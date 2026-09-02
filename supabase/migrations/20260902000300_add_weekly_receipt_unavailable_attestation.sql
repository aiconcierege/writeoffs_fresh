-- Record the two distinct customer facts behind a receipt-unavailable answer in
-- one transaction: the requested document is unavailable, and the purchase was
-- either still for the Business or should be left out. Existing source,
-- documentation, and bookkeeping histories remain append-only.

alter function public.complete_weekly_missing_documentation_decision(
  uuid, uuid, uuid, text, uuid[], boolean
) rename to complete_weekly_missing_documentation_decision_legacy_internal;

revoke execute on function public.complete_weekly_missing_documentation_decision_legacy_internal(
  uuid, uuid, uuid, text, uuid[], boolean
) from public, anon, authenticated, service_role;

create function public.complete_weekly_missing_documentation_decision(
  p_review_period_id uuid,
  p_expected_workflow_event_id uuid,
  p_request_id uuid,
  p_decision text,
  p_record_ids uuid[],
  p_complete_stage boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  authenticated_user_id uuid := (select auth.uid());
  selected_business_id uuid;
  expected_workflow public.bookkeeping_weekly_review_workflow_events%rowtype;
begin
  if authenticated_user_id is null then raise exception 'authentication required'; end if;
  select id into selected_business_id from public.businesses
  where owner_user_id = authenticated_user_id;
  if selected_business_id is null then raise exception 'Business was not found'; end if;
  select * into expected_workflow from public.bookkeeping_weekly_review_workflow_events event
  where event.id = p_expected_workflow_event_id
    and event.business_id = selected_business_id
    and event.review_period_id = p_review_period_id
    and not exists (
      select 1 from public.bookkeeping_weekly_review_workflow_events successor
      where successor.supersedes_event_id = event.id
    );
  if p_decision = 'include_missing'
    and expected_workflow.details ->> 'flowVersion' = '3'
  then raise exception 'Version 3 requires an explicit receipt-unavailable business-use answer'; end if;
  return public.complete_weekly_missing_documentation_decision_legacy_internal(
    p_review_period_id, p_expected_workflow_event_id, p_request_id,
    p_decision, p_record_ids, p_complete_stage
  );
end;
$$;

revoke execute on function public.complete_weekly_missing_documentation_decision(
  uuid, uuid, uuid, text, uuid[], boolean
) from public, anon, authenticated, service_role;
grant execute on function public.complete_weekly_missing_documentation_decision(
  uuid, uuid, uuid, text, uuid[], boolean
) to authenticated;

create or replace function public.attest_weekly_receipt_unavailable(
  p_review_period_id uuid,
  p_expected_workflow_event_id uuid,
  p_request_id uuid,
  p_financial_transaction_id uuid,
  p_expected_current_decision_id uuid,
  p_expected_documentation_event_id uuid,
  p_business_use text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  authenticated_user_id uuid := (select auth.uid());
  selected_business_id uuid;
  period public.bookkeeping_review_periods%rowtype;
  workflow public.bookkeeping_weekly_review_workflow_events%rowtype;
  selected_record public.bookkeeping_records%rowtype;
  current_decision public.bookkeeping_decisions%rowtype;
  documentation public.bookkeeping_documentation_events%rowtype;
  existing_batch public.bookkeeping_weekly_documentation_batches%rowtype;
  existing_item public.bookkeeping_weekly_documentation_batch_items%rowtype;
  documentation_result jsonb;
  correction_result jsonb;
  allocation public.bookkeeping_allocations%rowtype;
  resulting_decision_id uuid;
  inserted_batch_id uuid;
begin
  if authenticated_user_id is null then raise exception 'authentication required'; end if;
  if p_review_period_id is null or p_expected_workflow_event_id is null
    or p_request_id is null or p_financial_transaction_id is null
    or p_expected_current_decision_id is null
    or p_expected_documentation_event_id is null
    or p_business_use not in ('business', 'personal')
  then raise exception 'Receipt-unavailable attestation is invalid'; end if;

  select id into selected_business_id from public.businesses
  where owner_user_id = authenticated_user_id;
  if selected_business_id is null then raise exception 'Business was not found'; end if;

  select * into existing_batch from public.bookkeeping_weekly_documentation_batches
  where business_id = selected_business_id and request_id = p_request_id;
  if found then
    select * into existing_item from public.bookkeeping_weekly_documentation_batch_items
    where batch_id = existing_batch.id;
    return jsonb_build_object(
      'batch_id', existing_batch.id,
      'decision_id', existing_item.resulting_decision_id,
      'receipt_lost_event_id', existing_item.receipt_lost_event_id,
      'business_use', case existing_batch.decision
        when 'include_missing' then 'business' else 'personal' end,
      'idempotent', true
    );
  end if;

  select * into period from public.bookkeeping_review_periods
  where id = p_review_period_id and business_id = selected_business_id;
  if not found then raise exception 'Review period was not found'; end if;

  perform pg_advisory_xact_lock(
    hashtextextended('weekly-documentation:' || p_review_period_id::text, 0));

  -- Recheck after serialization so concurrent retries return the first result
  -- instead of observing its newly superseded leaves as stale.
  select * into existing_batch from public.bookkeeping_weekly_documentation_batches
  where business_id = selected_business_id and request_id = p_request_id;
  if found then
    select * into existing_item from public.bookkeeping_weekly_documentation_batch_items
    where batch_id = existing_batch.id;
    return jsonb_build_object(
      'batch_id', existing_batch.id,
      'decision_id', existing_item.resulting_decision_id,
      'receipt_lost_event_id', existing_item.receipt_lost_event_id,
      'business_use', case existing_batch.decision
        when 'include_missing' then 'business' else 'personal' end,
      'idempotent', true
    );
  end if;

  select * into workflow from public.bookkeeping_weekly_review_workflow_events event
  where event.id = p_expected_workflow_event_id
    and event.business_id = selected_business_id
    and event.review_period_id = p_review_period_id
    and not exists (
      select 1 from public.bookkeeping_weekly_review_workflow_events successor
      where successor.supersedes_event_id = event.id
    ) for update;
  if not found then raise exception 'Review workflow changed'; end if;
  if workflow.details ->> 'flowVersion' <> '3'
    or not (
      (workflow.stage = 'mixed' and workflow.event_type = 'stage_completed')
      or (workflow.stage = 'documentation' and workflow.event_type = 'stage_reopened')
    )
  then raise exception 'Review is not accepting documentation answers'; end if;

  select record.* into selected_record
  from public.bookkeeping_records record
  join public.bookkeeping_financial_sources source
    on source.bookkeeping_record_id = record.id
   and source.business_id = record.business_id
   and source.revoked_at is null
  join public.financial_transactions financial
    on financial.id = source.financial_transaction_id
   and financial.business_id = source.business_id
  where record.business_id = selected_business_id
    and financial.id = p_financial_transaction_id
    and record.source_kind = 'financial_transaction'
    and record.occurred_on between period.period_start and period.period_end;
  if selected_record.id is null then
    raise exception 'Documentation activity is outside this review';
  end if;
  if (select count(*) from public.bookkeeping_financial_sources source
      where source.business_id = selected_business_id
        and source.bookkeeping_record_id = selected_record.id
        and source.revoked_at is null) <> 1
  then raise exception 'Documentation activity has an unsupported source structure'; end if;

  perform pg_advisory_xact_lock(
    hashtextextended('bookkeeping-record:' || selected_record.id::text, 0));
  select * into current_decision from public.bookkeeping_decisions decision
  where decision.id = p_expected_current_decision_id
    and decision.business_id = selected_business_id
    and decision.bookkeeping_record_id = selected_record.id
    and not exists (
      select 1 from public.bookkeeping_decisions successor
      where successor.supersedes_decision_id = decision.id
    ) for update;
  if not found then raise exception 'stale current bookkeeping decision'; end if;
  if current_decision.bookkeeping_nature <> 'expense'
    or current_decision.treatment not in ('business', 'mixed_use')
  then raise exception 'Only an established business purchase can use this answer'; end if;
  if exists (
    select 1 from public.bookkeeping_document_links link
    where link.business_id = selected_business_id
      and link.bookkeeping_record_id = selected_record.id
      and link.revoked_at is null
  ) then raise exception 'Supporting documentation is already attached'; end if;

  select * into documentation from public.bookkeeping_documentation_events event
  where event.id = p_expected_documentation_event_id
    and event.business_id = selected_business_id
    and event.bookkeeping_record_id = selected_record.id
    and event.event_type in ('request_opened', 'reopened', 'evidence_attached')
    and not exists (
      select 1 from public.bookkeeping_documentation_events successor
      where successor.supersedes_event_id = event.id
    ) for update;
  if not found then raise exception 'Current documentation event changed'; end if;

  documentation_result := public.mark_bookkeeping_receipt_lost(
    documentation.documentation_issue_id,
    documentation.id,
    documentation.context_fingerprint,
    documentation.evidence_fingerprint,
    '{"schemaVersion":1,"assertion":"receipt_lost"}'::jsonb
  );

  if p_business_use = 'business' then
    insert into public.bookkeeping_decisions(
      business_id, bookkeeping_record_id, supersedes_decision_id,
      bookkeeping_nature, treatment, review_status, provenance, actor_user_id,
      confidence, reason, business_purpose, correction_request_id
    ) values (
      selected_business_id, selected_record.id, current_decision.id,
      current_decision.bookkeeping_nature, current_decision.treatment,
      'resolved', 'user', authenticated_user_id, null,
      'Customer confirmed that this purchase was still for the business.',
      current_decision.business_purpose, p_request_id
    ) returning id into resulting_decision_id;
    for allocation in select * from public.bookkeeping_allocations
      where bookkeeping_decision_id = current_decision.id
    loop
      insert into public.bookkeeping_allocations(
        business_id, bookkeeping_record_id, bookkeeping_decision_id,
        allocation_kind, amount_cents, tax_category_key, memo
      ) values (
        selected_business_id, selected_record.id, resulting_decision_id,
        allocation.allocation_kind, allocation.amount_cents,
        allocation.tax_category_key, allocation.memo
      );
    end loop;
  else
    correction_result := public.correct_imported_transaction_personal_scope(
      p_financial_transaction_id,
      current_decision.id,
      p_request_id,
      'personal'
    );
    resulting_decision_id := (correction_result ->> 'decision_id')::uuid;
  end if;

  insert into public.bookkeeping_weekly_documentation_batches(
    business_id, review_period_id, decision, actor_user_id, request_id
  ) values (
    selected_business_id, p_review_period_id,
    case p_business_use when 'business' then 'include_missing' else 'exclude_missing' end,
    authenticated_user_id, p_request_id
  ) returning id into inserted_batch_id;

  insert into public.bookkeeping_weekly_documentation_batch_items(
    business_id, review_period_id, batch_id, bookkeeping_record_id,
    prior_decision_id, resulting_decision_id, receipt_lost_event_id
  ) values (
    selected_business_id, p_review_period_id, inserted_batch_id, selected_record.id,
    current_decision.id, resulting_decision_id,
    (documentation_result ->> 'receipt_lost_event_id')::uuid
  );

  return jsonb_build_object(
    'batch_id', inserted_batch_id,
    'decision_id', resulting_decision_id,
    'receipt_lost_event_id', documentation_result ->> 'receipt_lost_event_id',
    'business_use', p_business_use,
    'idempotent', false
  );
end;
$$;

revoke execute on function public.attest_weekly_receipt_unavailable(
  uuid, uuid, uuid, uuid, uuid, uuid, text
) from public, anon, authenticated, service_role;
grant execute on function public.attest_weekly_receipt_unavailable(
  uuid, uuid, uuid, uuid, uuid, uuid, text
) to authenticated;

comment on function public.attest_weekly_receipt_unavailable(
  uuid, uuid, uuid, uuid, uuid, uuid, text
) is 'Atomically records an unavailable receipt and the customer business-use fact for one owned v3 weekly-review purchase.';

comment on function public.complete_weekly_missing_documentation_decision(
  uuid, uuid, uuid, text, uuid[], boolean
) is 'Compatibility documentation batch path; v3 receipt-unavailable inclusion requires the atomic customer-attestation RPC.';

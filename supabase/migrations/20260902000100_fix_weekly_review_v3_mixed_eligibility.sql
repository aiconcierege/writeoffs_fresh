-- Allow the v3 Activity mixed-use sweep to identify supported expense-direction
-- transactions before their bookkeeping nature has been fully classified.
-- Identification opens a factual clarification only; allocation remains in the
-- existing database-authoritative mixed-use answer functions.

create or replace function public.open_weekly_mixed_clarifications(
  p_review_period_id uuid,
  p_expected_workflow_event_id uuid,
  p_request_id uuid,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_business uuid;
  period public.bookkeeping_review_periods%rowtype;
  workflow public.bookkeeping_weekly_review_workflow_events%rowtype;
  existing uuid;
  item jsonb;
  selected_record public.bookkeeping_records%rowtype;
  decision public.bookkeeping_decisions%rowtype;
  source public.bookkeeping_financial_sources%rowtype;
  financial public.financial_transactions%rowtype;
  active_source_count integer;
  issue public.bookkeeping_review_events%rowtype;
  issue_id uuid;
  evidence text;
  workflow_event uuid;
  opened_count integer := 0;
begin
  if (select auth.uid()) is null
    or jsonb_typeof(p_items) <> 'array'
    or jsonb_array_length(p_items) > 500
  then raise exception 'Mixed-use selection is invalid'; end if;

  select id into selected_business
  from public.businesses
  where owner_user_id = (select auth.uid());

  select id into existing
  from public.bookkeeping_weekly_review_workflow_events
  where business_id = selected_business and request_id = p_request_id;
  if existing is not null then
    return jsonb_build_object('workflow_event_id', existing, 'idempotent', true);
  end if;

  select * into period
  from public.bookkeeping_review_periods
  where id = p_review_period_id and business_id = selected_business;
  if not found then raise exception 'Review period was not found'; end if;

  perform pg_advisory_xact_lock(hashtextextended('weekly-mixed:' || p_review_period_id::text, 0));
  select * into workflow
  from public.bookkeeping_weekly_review_workflow_events as w
  where w.id = p_expected_workflow_event_id
    and w.business_id = selected_business
    and w.review_period_id = p_review_period_id
    and not exists (
      select 1 from public.bookkeeping_weekly_review_workflow_events as successor
      where successor.supersedes_event_id = w.id
    )
  for update;
  if not found
    or workflow.stage <> 'personal'
    or workflow.event_type <> 'stage_completed'
    or workflow.details ->> 'flowVersion' <> '3'
  then raise exception 'Mixed-use workflow changed'; end if;

  for item in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(item) <> 'object'
      or (select count(*) from jsonb_object_keys(item)) <> 3
      or not (item ? 'recordId' and item ? 'transactionId' and item ? 'decisionId')
    then raise exception 'Mixed-use selection item is invalid'; end if;

    select * into selected_record
    from public.bookkeeping_records
    where id = (item ->> 'recordId')::uuid
      and business_id = selected_business
      and occurred_on between period.period_start and period.period_end
    for update;

    select * into decision
    from public.bookkeeping_decisions as d
    where d.id = (item ->> 'decisionId')::uuid
      and d.business_id = selected_business
      and d.bookkeeping_record_id = selected_record.id
      and (
        (d.bookkeeping_nature = 'expense' and d.treatment in ('business', 'unresolved'))
        or (d.bookkeeping_nature is null and d.treatment = 'unresolved')
      )
      and not exists (
        select 1 from public.bookkeeping_decisions as successor
        where successor.supersedes_decision_id = d.id
      )
    for update;

    select * into source
    from public.bookkeeping_financial_sources as s
    where s.business_id = selected_business
      and s.bookkeeping_record_id = selected_record.id
      and s.financial_transaction_id = (item ->> 'transactionId')::uuid
      and s.revoked_at is null;

    select count(*) into active_source_count
    from public.bookkeeping_financial_sources as s
    where s.business_id = selected_business
      and s.bookkeeping_record_id = selected_record.id
      and s.revoked_at is null;

    select * into financial
    from public.financial_transactions as financial_transaction
    where financial_transaction.id = source.financial_transaction_id
      and financial_transaction.business_id = selected_business;

    if selected_record.id is null
      or decision.id is null
      or source.id is null
      or financial.id is null
      or financial.amount_cents >= 0
      or active_source_count <> 1
    then raise exception 'Selected mixed-use activity changed'; end if;

    if exists (
      select 1 from public.bookkeeping_review_events as event
      where event.business_id = selected_business
        and event.bookkeeping_record_id = selected_record.id
        and event.event_type in ('opened', 'skipped', 'reopened')
        and not exists (
          select 1 from public.bookkeeping_review_events as successor
          where successor.supersedes_event_id = event.id
        )
        and event.reason <> 'MIXED_USE_CLARIFICATION'
    ) then raise exception 'Another material fact must be resolved first'; end if;

    select * into issue
    from public.bookkeeping_review_events as event
    where event.business_id = selected_business
      and event.bookkeeping_record_id = selected_record.id
      and event.reason = 'MIXED_USE_CLARIFICATION'
      and event.based_on_decision_id = decision.id
      and event.event_type in ('opened', 'skipped', 'reopened')
      and not exists (
        select 1 from public.bookkeeping_review_events as successor
        where successor.supersedes_event_id = event.id
      )
    for update;

    if issue.id is null then
      issue_id := gen_random_uuid();
      evidence := public.current_bookkeeping_evidence_fingerprint(selected_business, selected_record.id);
      insert into public.bookkeeping_review_events (
        id, business_id, bookkeeping_record_id, review_issue_id,
        sequence_number, event_type, reason, based_on_decision_id, issue_key,
        context_fingerprint, evidence_fingerprint, question_context, provenance
      ) values (
        issue_id, selected_business, selected_record.id, issue_id,
        1, 'opened', 'MIXED_USE_CLARIFICATION', decision.id,
        'weekly-v3:mixed:' || p_review_period_id::text || ':' || selected_record.id::text,
        md5(p_review_period_id::text || ':' || selected_record.id::text || ':' || decision.id::text || ':' || evidence),
        evidence,
        jsonb_build_object(
          'schemaVersion', 1,
          'reason', 'MIXED_USE_CLARIFICATION',
          'businessUse', 'mixed',
          'reviewPeriodId', p_review_period_id,
          'flowVersion', 3
        ),
        'system'
      );
      opened_count := opened_count + 1;
    end if;
  end loop;

  if jsonb_array_length(p_items) = 0 then
    workflow_event := public.append_weekly_review_workflow_event(
      p_review_period_id, p_expected_workflow_event_id, 'mixed', 'stage_completed',
      jsonb_build_object('selectedCount', 0), p_request_id
    );
  else
    workflow_event := public.append_weekly_review_workflow_event(
      p_review_period_id, p_expected_workflow_event_id, 'mixed', 'stage_reopened',
      jsonb_build_object('phase', 'mixed_followups', 'selectedCount', jsonb_array_length(p_items)), p_request_id
    );
  end if;

  return jsonb_build_object(
    'workflow_event_id', workflow_event,
    'opened_count', opened_count,
    'idempotent', false
  );
end;
$$;

revoke execute on function public.open_weekly_mixed_clarifications(uuid, uuid, uuid, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.open_weekly_mixed_clarifications(uuid, uuid, uuid, jsonb)
  to authenticated;

comment on function public.open_weekly_mixed_clarifications(uuid, uuid, uuid, jsonb) is
  'Atomically opens v3 mixed-use clarification for current supported expense-direction financial activity without allocating money.';

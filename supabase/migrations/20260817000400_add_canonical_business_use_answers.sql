-- Atomic factual answers for BUSINESS_USE_UNCLEAR and its dollar-only
-- MIXED_USE_CLARIFICATION follow-up. Customer input never controls canonical
-- treatment, allocation kinds, signs, categories, confidence, or provenance.

create or replace function public.answer_bookkeeping_business_use_review_issue(
  p_review_issue_id uuid,
  p_expected_current_event_id uuid,
  p_expected_current_decision_id uuid,
  p_expected_context_fingerprint text,
  p_expected_evidence_fingerprint text,
  p_answer jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_event public.bookkeeping_review_events%rowtype;
  current_decision public.bookkeeping_decisions%rowtype;
  selected_use text;
  authoritative_amount bigint;
  authoritative_currency text;
  current_evidence_fingerprint text;
  preserved_category text;
  inserted_decision_id uuid;
  answered_event_id uuid;
  resolved_event_id uuid;
  follow_up_event_id uuid;
  follow_up_issue_id uuid;
  follow_up_reason text;
  follow_up_issue_key text;
  follow_up_context_fingerprint text;
  follow_up_question_context jsonb;
  decision_treatment text;
  decision_review_status text;
  decision_allocations jsonb := '[]'::jsonb;
begin
  if (select auth.uid()) is null then raise exception 'authentication required'; end if;
  if jsonb_typeof(p_answer) <> 'object'
    or (select count(*) from jsonb_object_keys(p_answer)) <> 2
    or not (p_answer ? 'schemaVersion') or not (p_answer ? 'use')
    or p_answer -> 'schemaVersion' <> '1'::jsonb
    or jsonb_typeof(p_answer -> 'use') <> 'string'
    or p_answer ->> 'use' not in ('business', 'personal', 'mixed')
  then raise exception 'only schemaVersion and use are accepted'; end if;
  selected_use := p_answer ->> 'use';

  select * into current_event from public.bookkeeping_review_events
  where review_issue_id = p_review_issue_id and id = p_expected_current_event_id;
  if not found then raise exception 'current review event changed'; end if;
  if not exists (
    select 1 from public.businesses
    where id = current_event.business_id and owner_user_id = (select auth.uid())
  ) then raise exception 'review issue is unavailable to the authenticated user'; end if;

  perform pg_advisory_xact_lock(
    hashtextextended(current_event.bookkeeping_record_id::text, 41)
  );
  select * into current_event from public.bookkeeping_review_events
  where review_issue_id = p_review_issue_id and id = p_expected_current_event_id
  for update;
  if not found or exists (
    select 1 from public.bookkeeping_review_events
    where supersedes_event_id = current_event.id
  ) or current_event.event_type not in ('opened', 'skipped', 'reopened')
  then raise exception 'current review event changed'; end if;
  if current_event.reason <> 'BUSINESS_USE_UNCLEAR'
  then raise exception 'answer processing is not implemented for this review reason'; end if;
  if current_event.context_fingerprint <> p_expected_context_fingerprint
    or current_event.question_context is null
    or current_event.question_context -> 'schemaVersion' <> '1'::jsonb
    or current_event.question_context ->> 'reason' <> 'BUSINESS_USE_UNCLEAR'
  then raise exception 'trusted question context changed'; end if;
  if current_event.evidence_fingerprint is distinct from p_expected_evidence_fingerprint
  then raise exception 'expected evidence context changed'; end if;

  current_evidence_fingerprint := public.current_bookkeeping_evidence_fingerprint(
    current_event.business_id, current_event.bookkeeping_record_id
  );
  if current_evidence_fingerprint is distinct from current_event.evidence_fingerprint
  then raise exception 'canonical evidence changed; reevaluation required'; end if;

  select * into current_decision from public.bookkeeping_decisions as decisions
  where decisions.business_id = current_event.business_id
    and decisions.bookkeeping_record_id = current_event.bookkeeping_record_id
    and decisions.id = p_expected_current_decision_id
    and not exists (
      select 1 from public.bookkeeping_decisions as successors
      where successors.supersedes_decision_id = decisions.id
    )
  for update;
  if not found or current_decision.id <> current_event.based_on_decision_id
  then raise exception 'current bookkeeping decision changed'; end if;

  select coalesce(transactions.amount_cents, records.amount_cents),
         coalesce(transactions.currency, records.currency)
  into authoritative_amount, authoritative_currency
  from public.bookkeeping_records as records
  left join public.bookkeeping_financial_sources as sources
    on sources.bookkeeping_record_id = records.id
   and sources.business_id = records.business_id and sources.revoked_at is null
  left join public.financial_transactions as transactions
    on transactions.id = sources.financial_transaction_id
   and transactions.business_id = sources.business_id
  where records.id = current_event.bookkeeping_record_id
    and records.business_id = current_event.business_id;
  if not found or authoritative_amount is null or authoritative_amount = 0
  then raise exception 'business-use answer requires a known nonzero authoritative amount'; end if;
  if authoritative_currency is null
  then raise exception 'business-use answer requires authoritative currency'; end if;

  select case when count(distinct allocations.tax_category_key) = 1
              then min(allocations.tax_category_key) else null end
  into preserved_category
  from public.bookkeeping_allocations as allocations
  where allocations.business_id = current_event.business_id
    and allocations.bookkeeping_record_id = current_event.bookkeeping_record_id
    and allocations.bookkeeping_decision_id = current_decision.id
    and allocations.allocation_kind = 'business'
    and allocations.tax_category_key is not null;

  if selected_use = 'mixed' or current_decision.bookkeeping_nature is null then
    decision_treatment := 'unresolved';
    decision_review_status := 'needs_review';
    decision_allocations := '[]'::jsonb;
  elsif selected_use = 'business' then
    decision_treatment := 'business';
    decision_review_status := 'resolved';
    decision_allocations := jsonb_build_array(jsonb_build_object(
      'kind', 'business', 'amount_cents', authoritative_amount,
      'tax_category_key', preserved_category, 'memo', null
    ));
  else
    decision_treatment := 'personal';
    decision_review_status := 'resolved';
    decision_allocations := jsonb_build_array(jsonb_build_object(
      'kind', 'personal', 'amount_cents', authoritative_amount,
      'tax_category_key', null, 'memo', null
    ));
  end if;

  inserted_decision_id := public.append_bookkeeping_decision(
    current_event.business_id, current_event.bookkeeping_record_id,
    current_decision.id, current_decision.bookkeeping_nature,
    decision_treatment, decision_review_status, 'user', null,
    current_decision.reason, current_decision.business_purpose,
    decision_allocations
  );

  insert into public.bookkeeping_review_events (
    business_id, bookkeeping_record_id, review_issue_id, supersedes_event_id,
    sequence_number, event_type, reason, based_on_decision_id, issue_key,
    context_fingerprint, evidence_fingerprint, question_context,
    answer_payload, resulting_decision_id, provenance, actor_user_id
  ) values (
    current_event.business_id, current_event.bookkeeping_record_id,
    current_event.review_issue_id, current_event.id,
    current_event.sequence_number + 1, 'answered', current_event.reason,
    current_decision.id, current_event.issue_key, current_event.context_fingerprint,
    current_event.evidence_fingerprint, current_event.question_context,
    jsonb_build_object('schemaVersion', 1, 'use', selected_use),
    inserted_decision_id, 'user', (select auth.uid())
  ) returning id into answered_event_id;

  insert into public.bookkeeping_review_events (
    business_id, bookkeeping_record_id, review_issue_id, supersedes_event_id,
    sequence_number, event_type, reason, based_on_decision_id, issue_key,
    context_fingerprint, evidence_fingerprint, question_context,
    resulting_decision_id, provenance, actor_user_id
  ) values (
    current_event.business_id, current_event.bookkeeping_record_id,
    current_event.review_issue_id, answered_event_id,
    current_event.sequence_number + 2, 'resolved', current_event.reason,
    current_decision.id, current_event.issue_key, current_event.context_fingerprint,
    current_event.evidence_fingerprint, current_event.question_context,
    inserted_decision_id, 'system', null
  ) returning id into resolved_event_id;

  if selected_use = 'mixed' or current_decision.bookkeeping_nature is null then
    follow_up_reason := case when selected_use = 'mixed'
      then 'MIXED_USE_CLARIFICATION' else 'TRANSACTION_TYPE_UNCLEAR' end;
    follow_up_issue_id := gen_random_uuid();
    follow_up_issue_key := lower(follow_up_reason) || ':after:' || current_event.review_issue_id::text;
    follow_up_context_fingerprint := md5(
      current_event.context_fingerprint || ':' || current_evidence_fingerprint || ':' ||
      inserted_decision_id::text || ':' || selected_use || ':' || follow_up_reason
    );
    follow_up_question_context := jsonb_build_object(
      'schemaVersion', 1, 'reason', follow_up_reason,
      'originatingReviewIssueId', current_event.review_issue_id,
      'businessUse', selected_use,
      'authoritativeAmountCents', authoritative_amount,
      'authoritativeCurrency', authoritative_currency
    );
    insert into public.bookkeeping_review_events (
      id, business_id, bookkeeping_record_id, review_issue_id,
      supersedes_event_id, sequence_number, event_type, reason,
      based_on_decision_id, issue_key, context_fingerprint,
      evidence_fingerprint, question_context, provenance, actor_user_id
    ) values (
      follow_up_issue_id, current_event.business_id,
      current_event.bookkeeping_record_id, follow_up_issue_id,
      null, 1, 'opened', follow_up_reason, inserted_decision_id,
      follow_up_issue_key, follow_up_context_fingerprint,
      current_evidence_fingerprint, follow_up_question_context, 'system', null
    ) returning id into follow_up_event_id;
  end if;

  return jsonb_build_object(
    'business_id', current_event.business_id,
    'decision_id', inserted_decision_id,
    'answered_event_id', answered_event_id,
    'resolved_event_id', resolved_event_id,
    'follow_up_event_id', follow_up_event_id
  );
end;
$$;

create or replace function public.answer_bookkeeping_mixed_use_review_issue(
  p_review_issue_id uuid,
  p_expected_current_event_id uuid,
  p_expected_current_decision_id uuid,
  p_expected_context_fingerprint text,
  p_expected_evidence_fingerprint text,
  p_answer jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_event public.bookkeeping_review_events%rowtype;
  current_decision public.bookkeeping_decisions%rowtype;
  business_magnitude numeric;
  authoritative_amount bigint;
  authoritative_currency text;
  business_amount bigint;
  personal_amount bigint;
  current_evidence_fingerprint text;
  preserved_category text;
  inserted_decision_id uuid;
  answered_event_id uuid;
  resolved_event_id uuid;
  follow_up_event_id uuid;
  follow_up_issue_id uuid;
  follow_up_issue_key text;
  follow_up_context_fingerprint text;
  decision_treatment text;
  decision_review_status text;
  decision_allocations jsonb := '[]'::jsonb;
begin
  if (select auth.uid()) is null then raise exception 'authentication required'; end if;
  if jsonb_typeof(p_answer) <> 'object'
    or (select count(*) from jsonb_object_keys(p_answer)) <> 2
    or not (p_answer ? 'schemaVersion') or not (p_answer ? 'businessAmountCents')
    or p_answer -> 'schemaVersion' <> '1'::jsonb
    or jsonb_typeof(p_answer -> 'businessAmountCents') <> 'number'
    or (p_answer ->> 'businessAmountCents') !~ '^[0-9]+$'
  then raise exception 'only schemaVersion and positive integer businessAmountCents are accepted'; end if;
  business_magnitude := (p_answer ->> 'businessAmountCents')::numeric;
  if business_magnitude <= 0 or business_magnitude > 9007199254740991
  then raise exception 'business amount must be a positive safe integer number of cents'; end if;

  select * into current_event from public.bookkeeping_review_events
  where review_issue_id = p_review_issue_id and id = p_expected_current_event_id;
  if not found then raise exception 'current review event changed'; end if;
  if not exists (
    select 1 from public.businesses
    where id = current_event.business_id and owner_user_id = (select auth.uid())
  ) then raise exception 'review issue is unavailable to the authenticated user'; end if;

  perform pg_advisory_xact_lock(
    hashtextextended(current_event.bookkeeping_record_id::text, 41)
  );
  select * into current_event from public.bookkeeping_review_events
  where review_issue_id = p_review_issue_id and id = p_expected_current_event_id
  for update;
  if not found or exists (
    select 1 from public.bookkeeping_review_events
    where supersedes_event_id = current_event.id
  ) or current_event.event_type not in ('opened', 'skipped', 'reopened')
  then raise exception 'current review event changed'; end if;
  if current_event.reason <> 'MIXED_USE_CLARIFICATION'
  then raise exception 'answer processing is not implemented for this review reason'; end if;
  if current_event.context_fingerprint <> p_expected_context_fingerprint
    or current_event.question_context is null
    or current_event.question_context -> 'schemaVersion' <> '1'::jsonb
    or current_event.question_context ->> 'reason' <> 'MIXED_USE_CLARIFICATION'
    or current_event.question_context ->> 'businessUse' <> 'mixed'
  then raise exception 'trusted question context changed'; end if;
  if current_event.evidence_fingerprint is distinct from p_expected_evidence_fingerprint
  then raise exception 'expected evidence context changed'; end if;

  current_evidence_fingerprint := public.current_bookkeeping_evidence_fingerprint(
    current_event.business_id, current_event.bookkeeping_record_id
  );
  if current_evidence_fingerprint is distinct from current_event.evidence_fingerprint
  then raise exception 'canonical evidence changed; reevaluation required'; end if;

  select * into current_decision from public.bookkeeping_decisions as decisions
  where decisions.business_id = current_event.business_id
    and decisions.bookkeeping_record_id = current_event.bookkeeping_record_id
    and decisions.id = p_expected_current_decision_id
    and not exists (
      select 1 from public.bookkeeping_decisions as successors
      where successors.supersedes_decision_id = decisions.id
    )
  for update;
  if not found or current_decision.id <> current_event.based_on_decision_id
  then raise exception 'current bookkeeping decision changed'; end if;

  select coalesce(transactions.amount_cents, records.amount_cents),
         coalesce(transactions.currency, records.currency)
  into authoritative_amount, authoritative_currency
  from public.bookkeeping_records as records
  left join public.bookkeeping_financial_sources as sources
    on sources.bookkeeping_record_id = records.id
   and sources.business_id = records.business_id and sources.revoked_at is null
  left join public.financial_transactions as transactions
    on transactions.id = sources.financial_transaction_id
   and transactions.business_id = sources.business_id
  where records.id = current_event.bookkeeping_record_id
    and records.business_id = current_event.business_id;
  if not found or authoritative_amount is null or authoritative_amount = 0
  then raise exception 'mixed-use answer requires a known nonzero authoritative amount'; end if;
  if authoritative_currency is null
  then raise exception 'mixed-use answer requires authoritative currency'; end if;
  if business_magnitude >= abs(authoritative_amount::numeric)
  then raise exception 'business amount must be less than the full transaction amount'; end if;

  business_amount := case when authoritative_amount < 0
    then -business_magnitude else business_magnitude end;
  personal_amount := authoritative_amount - business_amount;
  if business_amount = 0 or personal_amount = 0
    or sign(business_amount::numeric) <> sign(authoritative_amount::numeric)
    or sign(personal_amount::numeric) <> sign(authoritative_amount::numeric)
    or business_amount + personal_amount <> authoritative_amount
  then raise exception 'mixed-use allocations do not reconcile to the authoritative amount'; end if;

  select case when count(distinct allocations.tax_category_key) = 1
              then min(allocations.tax_category_key) else null end
  into preserved_category
  from public.bookkeeping_allocations as allocations
  where allocations.business_id = current_event.business_id
    and allocations.bookkeeping_record_id = current_event.bookkeeping_record_id
    and allocations.bookkeeping_decision_id = current_decision.id
    and allocations.allocation_kind = 'business'
    and allocations.tax_category_key is not null;

  if current_decision.bookkeeping_nature is null then
    decision_treatment := 'unresolved';
    decision_review_status := 'needs_review';
    decision_allocations := '[]'::jsonb;
  else
    decision_treatment := 'mixed_use';
    decision_review_status := 'resolved';
    decision_allocations := jsonb_build_array(
      jsonb_build_object(
        'kind', 'business', 'amount_cents', business_amount,
        'tax_category_key', preserved_category, 'memo', null
      ),
      jsonb_build_object(
        'kind', 'personal', 'amount_cents', personal_amount,
        'tax_category_key', null, 'memo', null
      )
    );
  end if;

  inserted_decision_id := public.append_bookkeeping_decision(
    current_event.business_id, current_event.bookkeeping_record_id,
    current_decision.id, current_decision.bookkeeping_nature,
    decision_treatment, decision_review_status, 'user', null,
    current_decision.reason, current_decision.business_purpose,
    decision_allocations
  );

  insert into public.bookkeeping_review_events (
    business_id, bookkeeping_record_id, review_issue_id, supersedes_event_id,
    sequence_number, event_type, reason, based_on_decision_id, issue_key,
    context_fingerprint, evidence_fingerprint, question_context,
    answer_payload, resulting_decision_id, provenance, actor_user_id
  ) values (
    current_event.business_id, current_event.bookkeeping_record_id,
    current_event.review_issue_id, current_event.id,
    current_event.sequence_number + 1, 'answered', current_event.reason,
    current_decision.id, current_event.issue_key, current_event.context_fingerprint,
    current_event.evidence_fingerprint, current_event.question_context,
    jsonb_build_object('schemaVersion', 1, 'businessAmountCents', business_magnitude),
    inserted_decision_id, 'user', (select auth.uid())
  ) returning id into answered_event_id;

  insert into public.bookkeeping_review_events (
    business_id, bookkeeping_record_id, review_issue_id, supersedes_event_id,
    sequence_number, event_type, reason, based_on_decision_id, issue_key,
    context_fingerprint, evidence_fingerprint, question_context,
    resulting_decision_id, provenance, actor_user_id
  ) values (
    current_event.business_id, current_event.bookkeeping_record_id,
    current_event.review_issue_id, answered_event_id,
    current_event.sequence_number + 2, 'resolved', current_event.reason,
    current_decision.id, current_event.issue_key, current_event.context_fingerprint,
    current_event.evidence_fingerprint, current_event.question_context,
    inserted_decision_id, 'system', null
  ) returning id into resolved_event_id;

  if current_decision.bookkeeping_nature is null then
    follow_up_issue_id := gen_random_uuid();
    follow_up_issue_key := 'transaction_type_unclear:after:' || current_event.review_issue_id::text;
    follow_up_context_fingerprint := md5(
      current_event.context_fingerprint || ':' || current_evidence_fingerprint || ':' ||
      inserted_decision_id::text || ':mixed:' || business_magnitude::text
    );
    insert into public.bookkeeping_review_events (
      id, business_id, bookkeeping_record_id, review_issue_id,
      supersedes_event_id, sequence_number, event_type, reason,
      based_on_decision_id, issue_key, context_fingerprint,
      evidence_fingerprint, question_context, provenance, actor_user_id
    ) values (
      follow_up_issue_id, current_event.business_id,
      current_event.bookkeeping_record_id, follow_up_issue_id,
      null, 1, 'opened', 'TRANSACTION_TYPE_UNCLEAR', inserted_decision_id,
      follow_up_issue_key, follow_up_context_fingerprint,
      current_evidence_fingerprint,
      jsonb_build_object(
        'schemaVersion', 1, 'reason', 'TRANSACTION_TYPE_UNCLEAR',
        'originatingReviewIssueId', current_event.review_issue_id,
        'businessUse', 'mixed',
        'businessAmountCents', business_magnitude,
        'authoritativeAmountCents', authoritative_amount,
        'authoritativeCurrency', authoritative_currency
      ),
      'system', null
    ) returning id into follow_up_event_id;
  end if;

  return jsonb_build_object(
    'business_id', current_event.business_id,
    'decision_id', inserted_decision_id,
    'answered_event_id', answered_event_id,
    'resolved_event_id', resolved_event_id,
    'follow_up_event_id', follow_up_event_id
  );
end;
$$;

revoke execute on function public.answer_bookkeeping_business_use_review_issue(
  uuid, uuid, uuid, text, text, jsonb
) from public, anon;
grant execute on function public.answer_bookkeeping_business_use_review_issue(
  uuid, uuid, uuid, text, text, jsonb
) to authenticated;

revoke execute on function public.answer_bookkeeping_mixed_use_review_issue(
  uuid, uuid, uuid, text, text, jsonb
) from public, anon;
grant execute on function public.answer_bookkeeping_mixed_use_review_issue(
  uuid, uuid, uuid, text, text, jsonb
) to authenticated;

comment on function public.answer_bookkeeping_business_use_review_issue(
  uuid, uuid, uuid, text, text, jsonb
) is 'Atomically records a factual Business, Personal, or Both answer and opens only the required typed follow-up.';
comment on function public.answer_bookkeeping_mixed_use_review_issue(
  uuid, uuid, uuid, text, text, jsonb
) is 'Atomically converts a positive customer business-cent amount into exact signed business and personal allocations.';

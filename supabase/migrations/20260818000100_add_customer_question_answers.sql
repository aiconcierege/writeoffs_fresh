-- Customer-facing factual answers missing from the canonical answer functions.
-- These operations append canonical decisions and review history atomically.

create or replace function public.apply_bookkeeping_customer_question_fact(
  p_review_issue_id uuid,
  p_expected_current_event_id uuid,
  p_expected_current_decision_id uuid,
  p_expected_context_fingerprint text,
  p_expected_evidence_fingerprint text,
  p_mode text,
  p_answer_payload jsonb,
  p_personal_amount_cents bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_event public.bookkeeping_review_events%rowtype;
  current_decision public.bookkeeping_decisions%rowtype;
  authoritative_amount bigint;
  authoritative_currency text;
  current_evidence_fingerprint text;
  preserved_category text;
  existing_allocations jsonb;
  decision_treatment text;
  decision_review_status text;
  decision_allocations jsonb;
  business_amount bigint;
  personal_amount bigint;
  inserted_decision_id uuid;
  answered_event_id uuid;
  resolved_event_id uuid;
  follow_up_event_id uuid;
  follow_up_issue_id uuid;
  follow_up_context_fingerprint text;
begin
  if (select auth.uid()) is null then raise exception 'authentication required'; end if;
  if p_mode not in ('not_sure', 'all_business', 'personal_amount')
  then raise exception 'customer question answer mode is unsupported'; end if;

  select * into current_event from public.bookkeeping_review_events
  where review_issue_id = p_review_issue_id and id = p_expected_current_event_id;
  if not found or not exists (
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
  if p_mode = 'not_sure' and current_event.reason not in (
      'BUSINESS_USE_UNCLEAR', 'BUSINESS_PURPOSE_NEEDED', 'MIXED_USE_CLARIFICATION'
    )
  then raise exception 'Not sure is unavailable for this question'; end if;
  if p_mode in ('all_business', 'personal_amount')
    and current_event.reason <> 'MIXED_USE_CLARIFICATION'
  then raise exception 'mixed-use answer is unavailable for this question'; end if;
  if current_event.context_fingerprint <> p_expected_context_fingerprint
    or current_event.evidence_fingerprint is distinct from p_expected_evidence_fingerprint
    or current_event.question_context is null
    or current_event.question_context -> 'schemaVersion' <> '1'::jsonb
    or current_event.question_context ->> 'reason' <> current_event.reason
  then raise exception 'trusted question context changed'; end if;

  current_evidence_fingerprint := public.current_bookkeeping_evidence_fingerprint(
    current_event.business_id, current_event.bookkeeping_record_id
  );
  if current_evidence_fingerprint is distinct from current_event.evidence_fingerprint
  then raise exception 'canonical evidence changed; reevaluation required'; end if;

  select * into current_decision from public.bookkeeping_decisions decisions
  where decisions.business_id = current_event.business_id
    and decisions.bookkeeping_record_id = current_event.bookkeeping_record_id
    and decisions.id = p_expected_current_decision_id
    and not exists (
      select 1 from public.bookkeeping_decisions successors
      where successors.supersedes_decision_id = decisions.id
    ) for update;
  if not found or current_decision.id <> current_event.based_on_decision_id
  then raise exception 'current bookkeeping decision changed'; end if;

  select coalesce(transactions.amount_cents, records.amount_cents),
         coalesce(transactions.currency, records.currency)
  into authoritative_amount, authoritative_currency
  from public.bookkeeping_records records
  left join public.bookkeeping_financial_sources sources
    on sources.bookkeeping_record_id = records.id
   and sources.business_id = records.business_id and sources.revoked_at is null
  left join public.financial_transactions transactions
    on transactions.id = sources.financial_transaction_id
   and transactions.business_id = sources.business_id
  where records.id = current_event.bookkeeping_record_id
    and records.business_id = current_event.business_id;
  if not found or authoritative_amount is null or authoritative_amount = 0
  then raise exception 'question answer requires a known nonzero amount'; end if;
  if authoritative_currency is null
  then raise exception 'question answer requires authoritative currency'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'kind', allocations.allocation_kind,
    'amount_cents', allocations.amount_cents,
    'tax_category_key', allocations.tax_category_key,
    'memo', allocations.memo
  ) order by allocations.id), '[]'::jsonb)
  into existing_allocations
  from public.bookkeeping_allocations allocations
  where allocations.business_id = current_event.business_id
    and allocations.bookkeeping_record_id = current_event.bookkeeping_record_id
    and allocations.bookkeeping_decision_id = current_decision.id;

  select case when count(distinct allocations.tax_category_key) = 1
              then min(allocations.tax_category_key) else null end
  into preserved_category
  from public.bookkeeping_allocations allocations
  where allocations.business_id = current_event.business_id
    and allocations.bookkeeping_record_id = current_event.bookkeeping_record_id
    and allocations.bookkeeping_decision_id = current_decision.id
    and allocations.allocation_kind = 'business'
    and allocations.tax_category_key is not null;

  if p_mode = 'not_sure' then
    decision_treatment := current_decision.treatment;
    decision_review_status := current_decision.review_status;
    decision_allocations := existing_allocations;
  elsif p_mode = 'all_business' then
    if current_decision.bookkeeping_nature is null then
      decision_treatment := 'unresolved';
      decision_review_status := 'needs_review';
      decision_allocations := '[]'::jsonb;
    else
      decision_treatment := 'business';
      decision_review_status := 'resolved';
      decision_allocations := jsonb_build_array(jsonb_build_object(
        'kind', 'business', 'amount_cents', authoritative_amount,
        'tax_category_key', preserved_category, 'memo', null
      ));
    end if;
  else
    if p_personal_amount_cents is null or p_personal_amount_cents <= 0
      or p_personal_amount_cents >= abs(authoritative_amount)
    then raise exception 'personal amount must be positive and less than the purchase total'; end if;
    personal_amount := case when authoritative_amount < 0
      then -p_personal_amount_cents else p_personal_amount_cents end;
    business_amount := authoritative_amount - personal_amount;
    if business_amount = 0 or personal_amount = 0
      or sign(business_amount::numeric) <> sign(authoritative_amount::numeric)
      or sign(personal_amount::numeric) <> sign(authoritative_amount::numeric)
      or business_amount + personal_amount <> authoritative_amount
    then raise exception 'mixed-use amounts do not reconcile'; end if;
    if current_decision.bookkeeping_nature is null then
      decision_treatment := 'unresolved';
      decision_review_status := 'needs_review';
      decision_allocations := '[]'::jsonb;
    else
      decision_treatment := 'mixed_use';
      decision_review_status := 'resolved';
      decision_allocations := jsonb_build_array(
        jsonb_build_object('kind', 'business', 'amount_cents', business_amount,
          'tax_category_key', preserved_category, 'memo', null),
        jsonb_build_object('kind', 'personal', 'amount_cents', personal_amount,
          'tax_category_key', null, 'memo', null)
      );
    end if;
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
    p_answer_payload, inserted_decision_id, 'user', (select auth.uid())
  ) returning id into answered_event_id;

  insert into public.bookkeeping_review_events (
    business_id, bookkeeping_record_id, review_issue_id, supersedes_event_id,
    sequence_number, event_type, reason, based_on_decision_id, issue_key,
    context_fingerprint, evidence_fingerprint, question_context,
    resulting_decision_id, provenance
  ) values (
    current_event.business_id, current_event.bookkeeping_record_id,
    current_event.review_issue_id, answered_event_id,
    current_event.sequence_number + 2, 'resolved', current_event.reason,
    current_decision.id, current_event.issue_key, current_event.context_fingerprint,
    current_event.evidence_fingerprint, current_event.question_context,
    inserted_decision_id, 'system'
  ) returning id into resolved_event_id;

  if p_mode in ('all_business', 'personal_amount')
    and current_decision.bookkeeping_nature is null
  then
    follow_up_issue_id := gen_random_uuid();
    follow_up_context_fingerprint := md5(concat_ws(':',
      current_event.context_fingerprint, current_evidence_fingerprint,
      inserted_decision_id::text, p_mode
    ));
    insert into public.bookkeeping_review_events (
      id, business_id, bookkeeping_record_id, review_issue_id,
      sequence_number, event_type, reason, based_on_decision_id, issue_key,
      context_fingerprint, evidence_fingerprint, question_context, provenance
    ) values (
      follow_up_issue_id, current_event.business_id,
      current_event.bookkeeping_record_id, follow_up_issue_id,
      1, 'opened', 'TRANSACTION_TYPE_UNCLEAR', inserted_decision_id,
      'transaction_type_unclear:after:' || current_event.review_issue_id::text,
      follow_up_context_fingerprint, current_evidence_fingerprint,
      jsonb_build_object(
        'schemaVersion', 1, 'reason', 'TRANSACTION_TYPE_UNCLEAR',
        'originatingReviewIssueId', current_event.review_issue_id,
        'businessUse', case when p_mode = 'all_business' then 'business' else 'mixed' end,
        'personalAmountCents', p_personal_amount_cents,
        'authoritativeAmountCents', authoritative_amount,
        'authoritativeCurrency', authoritative_currency
      ), 'system'
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

create or replace function public.answer_bookkeeping_customer_not_sure(
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
begin
  if p_answer <> '{"schemaVersion":1,"response":"not_sure"}'::jsonb
    or (select count(*) from jsonb_object_keys(p_answer)) <> 2
  then raise exception 'only the exact Not sure response is accepted'; end if;
  return public.apply_bookkeeping_customer_question_fact(
    p_review_issue_id, p_expected_current_event_id,
    p_expected_current_decision_id, p_expected_context_fingerprint,
    p_expected_evidence_fingerprint, 'not_sure', p_answer, null
  );
end;
$$;

create or replace function public.answer_bookkeeping_mixed_use_all_business(
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
begin
  if p_answer <> '{"schemaVersion":1,"scope":"all_business"}'::jsonb
    or (select count(*) from jsonb_object_keys(p_answer)) <> 2
  then raise exception 'only the exact all-business response is accepted'; end if;
  return public.apply_bookkeeping_customer_question_fact(
    p_review_issue_id, p_expected_current_event_id,
    p_expected_current_decision_id, p_expected_context_fingerprint,
    p_expected_evidence_fingerprint, 'all_business', p_answer, null
  );
end;
$$;

create or replace function public.answer_bookkeeping_mixed_use_personal_amount(
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
  personal_amount numeric;
begin
  if jsonb_typeof(p_answer) <> 'object'
    or (select count(*) from jsonb_object_keys(p_answer)) <> 2
    or p_answer -> 'schemaVersion' <> '1'::jsonb
    or jsonb_typeof(p_answer -> 'personalAmountCents') <> 'number'
    or (p_answer ->> 'personalAmountCents') !~ '^[0-9]+$'
  then raise exception 'only schemaVersion and positive integer personalAmountCents are accepted'; end if;
  personal_amount := (p_answer ->> 'personalAmountCents')::numeric;
  if personal_amount <= 0 or personal_amount > 9007199254740991
  then raise exception 'personal amount must be a positive safe integer'; end if;
  return public.apply_bookkeeping_customer_question_fact(
    p_review_issue_id, p_expected_current_event_id,
    p_expected_current_decision_id, p_expected_context_fingerprint,
    p_expected_evidence_fingerprint, 'personal_amount', p_answer,
    personal_amount::bigint
  );
end;
$$;

revoke execute on function public.apply_bookkeeping_customer_question_fact(
  uuid, uuid, uuid, text, text, text, jsonb, bigint
) from public, anon, authenticated;
revoke execute on function public.answer_bookkeeping_customer_not_sure(
  uuid, uuid, uuid, text, text, jsonb
) from public, anon;
grant execute on function public.answer_bookkeeping_customer_not_sure(
  uuid, uuid, uuid, text, text, jsonb
) to authenticated;
revoke execute on function public.answer_bookkeeping_mixed_use_all_business(
  uuid, uuid, uuid, text, text, jsonb
) from public, anon;
grant execute on function public.answer_bookkeeping_mixed_use_all_business(
  uuid, uuid, uuid, text, text, jsonb
) to authenticated;
revoke execute on function public.answer_bookkeeping_mixed_use_personal_amount(
  uuid, uuid, uuid, text, text, jsonb
) from public, anon;
grant execute on function public.answer_bookkeeping_mixed_use_personal_amount(
  uuid, uuid, uuid, text, text, jsonb
) to authenticated;

comment on function public.answer_bookkeeping_customer_not_sure(
  uuid, uuid, uuid, text, text, jsonb
) is 'Preserves a factual customer Not sure response without fabricating bookkeeping conclusions.';
comment on function public.answer_bookkeeping_mixed_use_personal_amount(
  uuid, uuid, uuid, text, text, jsonb
) is 'Converts customer-entered positive personal cents into exact signed canonical allocations.';

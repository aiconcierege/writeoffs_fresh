-- Atomic factual answer for TRANSACTION_TYPE_UNCLEAR. The customer describes
-- what happened; only trusted database logic maps that fact to canonical nature.

create or replace function public.answer_bookkeeping_transaction_type_review_issue(
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
  origin_answer public.bookkeeping_review_events%rowtype;
  origin_resolved public.bookkeeping_review_events%rowtype;
  business_use_answer public.bookkeeping_review_events%rowtype;
  selected_activity text;
  selected_details text;
  mapped_nature text;
  prior_use text;
  prior_business_magnitude numeric;
  origin_issue_id uuid;
  business_use_issue_id uuid;
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
  follow_up_reason text;
  follow_up_issue_key text;
  follow_up_context_fingerprint text;
  follow_up_question_context jsonb;
  decision_treatment text := 'unresolved';
  decision_review_status text := 'needs_review';
  decision_allocations jsonb := '[]'::jsonb;
  answer_payload jsonb;
  business_purpose_required boolean := false;
begin
  if (select auth.uid()) is null then raise exception 'authentication required'; end if;
  if jsonb_typeof(p_answer) <> 'object'
    or not (p_answer ? 'schemaVersion') or not (p_answer ? 'activity')
    or p_answer -> 'schemaVersion' <> '1'::jsonb
    or jsonb_typeof(p_answer -> 'activity') <> 'string'
  then raise exception 'schemaVersion and factual activity are required'; end if;
  selected_activity := p_answer ->> 'activity';
  if selected_activity = 'other' then
    if (select count(*) from jsonb_object_keys(p_answer)) <> 3
      or not (p_answer ? 'details')
      or jsonb_typeof(p_answer -> 'details') <> 'string'
    then raise exception 'other accepts only schemaVersion, activity, and factual details'; end if;
    selected_details := btrim(p_answer ->> 'details');
    if length(selected_details) not between 1 and 1000
    then raise exception 'other details must be between 1 and 1000 characters'; end if;
    answer_payload := jsonb_build_object(
      'schemaVersion', 1, 'activity', 'other', 'details', selected_details
    );
  else
    if (select count(*) from jsonb_object_keys(p_answer)) <> 2
      or selected_activity not in (
        'purchase', 'earned_money', 'moved_money', 'paid_card',
        'received_refund', 'added_own_money', 'borrowed_money'
      )
    then raise exception 'only schemaVersion and a supported factual activity are accepted'; end if;
    answer_payload := jsonb_build_object(
      'schemaVersion', 1, 'activity', selected_activity
    );
  end if;

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
  if current_event.reason <> 'TRANSACTION_TYPE_UNCLEAR'
  then raise exception 'answer processing is not implemented for this review reason'; end if;
  if current_event.context_fingerprint <> p_expected_context_fingerprint
    or current_event.question_context is null
    or current_event.question_context -> 'schemaVersion' <> '1'::jsonb
    or current_event.question_context ->> 'reason' <> 'TRANSACTION_TYPE_UNCLEAR'
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

  -- Follow-up context is only a pointer. Re-read and verify the immutable user
  -- answer event before reusing Business, Personal, Both, or the dollar amount.
  if current_event.question_context ? 'originatingReviewIssueId' then
    begin
      origin_issue_id := (current_event.question_context ->> 'originatingReviewIssueId')::uuid;
    exception when invalid_text_representation then
      raise exception 'trusted prior-answer context changed';
    end;
    select * into origin_answer from public.bookkeeping_review_events
    where business_id = current_event.business_id
      and bookkeeping_record_id = current_event.bookkeeping_record_id
      and review_issue_id = origin_issue_id and event_type = 'answered';
    if not found then raise exception 'trusted prior answer is unavailable'; end if;
    select * into origin_resolved from public.bookkeeping_review_events
    where supersedes_event_id = origin_answer.id and event_type = 'resolved';
    if not found or origin_resolved.resulting_decision_id <> origin_answer.resulting_decision_id
      or origin_answer.resulting_decision_id <> current_decision.id
    then raise exception 'trusted prior answer no longer matches the current decision'; end if;

    if origin_answer.reason = 'BUSINESS_USE_UNCLEAR' then
      prior_use := origin_answer.answer_payload ->> 'use';
      if prior_use not in ('business', 'personal', 'mixed')
      then raise exception 'trusted business-use answer is invalid'; end if;
    elsif origin_answer.reason = 'MIXED_USE_CLARIFICATION' then
      prior_use := 'mixed';
      if jsonb_typeof(origin_answer.answer_payload -> 'businessAmountCents') <> 'number'
      then raise exception 'trusted mixed-use amount is invalid'; end if;
      prior_business_magnitude :=
        (origin_answer.answer_payload ->> 'businessAmountCents')::numeric;
      begin
        business_use_issue_id :=
          (origin_answer.question_context ->> 'originatingReviewIssueId')::uuid;
      exception when invalid_text_representation then
        raise exception 'trusted mixed-use origin is invalid';
      end;
      select * into business_use_answer from public.bookkeeping_review_events
      where business_id = current_event.business_id
        and bookkeeping_record_id = current_event.bookkeeping_record_id
        and review_issue_id = business_use_issue_id
        and event_type = 'answered'
        and bookkeeping_review_events.answer_payload ->> 'use' = 'mixed';
      if not found then raise exception 'trusted Both answer is unavailable'; end if;
    else
      raise exception 'trusted prior answer does not contain business-use facts';
    end if;
    if current_event.question_context ->> 'businessUse' is distinct from prior_use
    then raise exception 'trusted prior business-use context changed'; end if;
    if prior_business_magnitude is not null and (
      current_event.question_context ->> 'businessAmountCents' is null
      or (current_event.question_context ->> 'businessAmountCents')::numeric
        <> prior_business_magnitude
    ) then raise exception 'trusted prior mixed-use amount changed'; end if;
  elsif current_event.question_context ? 'businessUse'
    or current_event.question_context ? 'businessAmountCents'
  then raise exception 'business-use facts require immutable answer history'; end if;

  business_purpose_required := coalesce(
    (current_event.question_context ->> 'businessPurposeRequired')::boolean,
    false
  );
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

  mapped_nature := case selected_activity
    when 'purchase' then 'expense'
    when 'earned_money' then 'business_income'
    when 'moved_money' then 'transfer'
    when 'paid_card' then 'credit_card_payment'
    when 'received_refund' then 'refund'
    when 'added_own_money' then 'owner_contribution'
    when 'borrowed_money' then 'loan_proceeds'
    else null
  end;

  select case when count(distinct allocations.tax_category_key) = 1
              then min(allocations.tax_category_key) else null end
  into preserved_category
  from public.bookkeeping_allocations as allocations
  where allocations.business_id = current_event.business_id
    and allocations.bookkeeping_record_id = current_event.bookkeeping_record_id
    and allocations.bookkeeping_decision_id = current_decision.id
    and allocations.allocation_kind = 'business'
    and allocations.tax_category_key is not null;

  if selected_activity in ('other', 'received_refund') then
    decision_treatment := 'unresolved';
    decision_review_status := 'needs_review';
  elsif authoritative_amount is null or authoritative_amount = 0
    or authoritative_currency is null
  then raise exception 'mapped transaction activity requires a known nonzero authoritative amount and currency';
  elsif selected_activity = 'purchase' then
    if prior_use is null then
      follow_up_reason := 'BUSINESS_USE_UNCLEAR';
    elsif prior_use = 'business' then
      decision_treatment := 'business';
      decision_review_status := case
        when business_purpose_required and current_decision.business_purpose is null
        then 'needs_review' else 'resolved' end;
      decision_allocations := jsonb_build_array(jsonb_build_object(
        'kind', 'business', 'amount_cents', authoritative_amount,
        'tax_category_key', preserved_category, 'memo', null
      ));
      if business_purpose_required and current_decision.business_purpose is null
      then follow_up_reason := 'BUSINESS_PURPOSE_NEEDED'; end if;
    elsif prior_use = 'personal' then
      decision_treatment := 'personal';
      decision_review_status := 'resolved';
      decision_allocations := jsonb_build_array(jsonb_build_object(
        'kind', 'personal', 'amount_cents', authoritative_amount,
        'tax_category_key', null, 'memo', null
      ));
    elsif prior_business_magnitude is null then
      follow_up_reason := 'MIXED_USE_CLARIFICATION';
    else
      if prior_business_magnitude <= 0
        or prior_business_magnitude >= abs(authoritative_amount::numeric)
      then raise exception 'trusted mixed-use amount no longer fits authoritative amount'; end if;
      business_amount := case when authoritative_amount < 0
        then -prior_business_magnitude else prior_business_magnitude end;
      personal_amount := authoritative_amount - business_amount;
      if business_amount = 0 or personal_amount = 0
        or business_amount + personal_amount <> authoritative_amount
      then raise exception 'trusted mixed-use allocations do not reconcile'; end if;
      decision_treatment := 'mixed_use';
      decision_review_status := case
        when business_purpose_required and current_decision.business_purpose is null
        then 'needs_review' else 'resolved' end;
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
      if business_purpose_required and current_decision.business_purpose is null
      then follow_up_reason := 'BUSINESS_PURPOSE_NEEDED'; end if;
    end if;
  elsif selected_activity = 'earned_money' then
    if prior_use in ('personal', 'mixed') then
      follow_up_reason := 'CONFLICTING_EVIDENCE';
    else
      decision_treatment := 'business';
      decision_review_status := 'resolved';
      decision_allocations := jsonb_build_array(jsonb_build_object(
        'kind', 'business', 'amount_cents', authoritative_amount,
        'tax_category_key', null, 'memo', null
      ));
    end if;
  else
    decision_treatment := 'excluded';
    decision_review_status := 'resolved';
    decision_allocations := jsonb_build_array(jsonb_build_object(
      'kind', 'excluded', 'amount_cents', authoritative_amount,
      'tax_category_key', null, 'memo', null
    ));
  end if;

  inserted_decision_id := public.append_bookkeeping_decision(
    current_event.business_id, current_event.bookkeeping_record_id,
    current_decision.id, mapped_nature, decision_treatment,
    decision_review_status, 'user', null, current_decision.reason,
    current_decision.business_purpose, decision_allocations
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
    answer_payload, inserted_decision_id, 'user', (select auth.uid())
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

  if follow_up_reason is not null then
    follow_up_issue_id := gen_random_uuid();
    follow_up_issue_key := lower(follow_up_reason) || ':after:' || current_event.review_issue_id::text;
    follow_up_context_fingerprint := md5(
      current_event.context_fingerprint || ':' || current_evidence_fingerprint || ':' ||
      inserted_decision_id::text || ':' || selected_activity || ':' || follow_up_reason
    );
    follow_up_question_context := jsonb_build_object(
      'schemaVersion', 1, 'reason', follow_up_reason,
      'originatingReviewIssueId', current_event.review_issue_id,
      'transactionActivity', selected_activity,
      'authoritativeAmountCents', authoritative_amount,
      'authoritativeCurrency', authoritative_currency
    );
    if business_purpose_required then
      follow_up_question_context := follow_up_question_context ||
        jsonb_build_object('businessPurposeRequired', true);
    end if;
    if follow_up_reason = 'MIXED_USE_CLARIFICATION' then
      follow_up_question_context := follow_up_question_context ||
        jsonb_build_object('businessUse', 'mixed');
    end if;
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

revoke execute on function public.answer_bookkeeping_transaction_type_review_issue(
  uuid, uuid, uuid, text, text, jsonb
) from public, anon;
grant execute on function public.answer_bookkeeping_transaction_type_review_issue(
  uuid, uuid, uuid, text, text, jsonb
) to authenticated;

comment on function public.answer_bookkeeping_transaction_type_review_issue(
  uuid, uuid, uuid, text, text, jsonb
) is 'Atomically maps a plain-language factual activity to trusted canonical bookkeeping and any next typed material question.';

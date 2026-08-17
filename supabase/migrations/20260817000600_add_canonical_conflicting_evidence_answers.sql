-- Narrow factual conflict questions and atomic customer answers. Trusted code
-- prepares options; customers submit only an option id (or configured factual fallback).

create or replace function public.bookkeeping_conflict_fingerprint(
  p_business_id uuid,
  p_bookkeeping_record_id uuid,
  p_current_decision_id uuid,
  p_conflict_key text,
  p_options jsonb
)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  option_value jsonb;
  reference_value jsonb;
  reference_id uuid;
  reference_kind text;
  reference_state text := '';
  referenced_business uuid;
  referenced_record uuid;
begin
  if jsonb_typeof(p_options) <> 'array' or jsonb_array_length(p_options) < 2
  then raise exception 'a conflict requires at least two factual options'; end if;
  if not exists (
    select 1 from public.bookkeeping_decisions
    where id = p_current_decision_id and business_id = p_business_id
      and bookkeeping_record_id = p_bookkeeping_record_id
  ) then raise exception 'conflict decision is unavailable'; end if;

  for option_value in select value from jsonb_array_elements(p_options) loop
    for reference_value in
      select value from jsonb_array_elements(option_value -> 'evidenceRefs')
    loop
      begin reference_id := (reference_value ->> 'id')::uuid;
      exception when invalid_text_representation then
        raise exception 'conflict evidence reference is invalid'; end;
      reference_kind := reference_value ->> 'kind';
      referenced_business := null;
      referenced_record := null;
      if reference_kind = 'bookkeeping_record' then
        select business_id, id into referenced_business, referenced_record
        from public.bookkeeping_records where id = reference_id;
        reference_state := reference_state || '|' || reference_kind || ':' || reference_id || ':' ||
          public.current_bookkeeping_evidence_fingerprint(p_business_id, reference_id);
      elsif reference_kind = 'bookkeeping_decision' then
        select business_id, bookkeeping_record_id into referenced_business, referenced_record
        from public.bookkeeping_decisions where id = reference_id;
        reference_state := reference_state || '|' || reference_kind || ':' || reference_id || ':' ||
          coalesce((select md5(to_jsonb(d)::text) from public.bookkeeping_decisions d where d.id = reference_id), 'missing');
      elsif reference_kind = 'review_answer' then
        select business_id, bookkeeping_record_id into referenced_business, referenced_record
        from public.bookkeeping_review_events where id = reference_id and event_type = 'answered';
        reference_state := reference_state || '|' || reference_kind || ':' || reference_id || ':' ||
          coalesce((select md5(to_jsonb(e)::text) from public.bookkeeping_review_events e where e.id = reference_id), 'missing');
      elsif reference_kind = 'financial_transaction' then
        select business_id into referenced_business from public.financial_transactions where id = reference_id;
        reference_state := reference_state || '|' || reference_kind || ':' || reference_id || ':' ||
          coalesce((select md5(to_jsonb(t)::text) from public.financial_transactions t where t.id = reference_id), 'missing');
      elsif reference_kind = 'document_link' then
        select business_id, bookkeeping_record_id into referenced_business, referenced_record
        from public.bookkeeping_document_links where id = reference_id;
        reference_state := reference_state || '|' || reference_kind || ':' || reference_id || ':' ||
          coalesce((select md5(to_jsonb(l)::text) from public.bookkeeping_document_links l where l.id = reference_id), 'missing');
      elsif reference_kind = 'receipt' then
        select businesses.id into referenced_business
        from public.receipts join public.businesses on businesses.owner_user_id = receipts.user_id
        where receipts.id = reference_id;
        reference_state := reference_state || '|' || reference_kind || ':' || reference_id || ':' ||
          coalesce((select md5(to_jsonb(r)::text) from public.receipts r where r.id = reference_id), 'missing');
      else raise exception 'unsupported conflict evidence reference';
      end if;
      if referenced_business is distinct from p_business_id
      then raise exception 'conflict evidence crosses Business boundary'; end if;
      if referenced_record is not null then
        reference_state := reference_state || ':record-evidence:' ||
          public.current_bookkeeping_evidence_fingerprint(p_business_id, referenced_record);
      end if;
    end loop;
  end loop;
  return md5(concat_ws('|',
    public.current_bookkeeping_evidence_fingerprint(p_business_id, p_bookkeeping_record_id),
    p_current_decision_id::text, btrim(p_conflict_key), p_options::text, reference_state
  ));
end;
$$;

create or replace function public.validate_bookkeeping_conflict_options(
  p_business_id uuid,
  p_bookkeeping_record_id uuid,
  p_options jsonb
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  option_value jsonb;
  outcome jsonb;
  candidate jsonb;
  allocation jsonb;
  option_id text;
  outcome_type text;
  authoritative_amount bigint;
  allocation_total numeric;
  current_business_purpose text;
begin
  if jsonb_typeof(p_options) <> 'array' or jsonb_array_length(p_options) < 2
  then raise exception 'a conflict requires at least two factual options'; end if;
  if exists (
    select 1 from jsonb_array_elements(p_options) o
    group by o ->> 'optionId' having count(*) > 1
  ) then raise exception 'conflict option ids must be unique'; end if;
  if exists (
    select 1 from jsonb_array_elements(p_options) o
    group by lower(btrim(o ->> 'factualMeaning')) having count(*) > 1
  ) then raise exception 'conflict factual meanings must be materially distinct'; end if;
  if p_options is distinct from (
    select jsonb_agg(value order by value ->> 'optionId') from jsonb_array_elements(p_options)
  ) then raise exception 'conflict options must be normalized by stable option id'; end if;

  select coalesce(t.amount_cents, r.amount_cents) into authoritative_amount
  from public.bookkeeping_records r
  left join public.bookkeeping_financial_sources s on s.business_id = r.business_id
    and s.bookkeeping_record_id = r.id and s.revoked_at is null
  left join public.financial_transactions t on t.business_id = s.business_id
    and t.id = s.financial_transaction_id
  where r.id = p_bookkeeping_record_id and r.business_id = p_business_id;
  if not found then raise exception 'conflict record is unavailable'; end if;
  select business_purpose into current_business_purpose
  from public.bookkeeping_decisions current_d
  where current_d.business_id=p_business_id and current_d.bookkeeping_record_id=p_bookkeeping_record_id
    and not exists (select 1 from public.bookkeeping_decisions n where n.supersedes_decision_id=current_d.id);

  for option_value in select value from jsonb_array_elements(p_options) loop
    if jsonb_typeof(option_value) <> 'object'
      or (select count(*) from jsonb_object_keys(option_value)) <> 4
      or not option_value ?& array['optionId','factualMeaning','evidenceRefs','outcome']
      or jsonb_typeof(option_value -> 'evidenceRefs') <> 'array'
      or jsonb_array_length(option_value -> 'evidenceRefs') < 1
    then raise exception 'conflict option shape is invalid'; end if;
    option_id := btrim(option_value ->> 'optionId');
    if length(option_id) not between 1 and 120 or option_id = 'none_of_these'
      or lower(option_id) in ('approve','approved','confirm','confirmation')
      or length(btrim(option_value ->> 'factualMeaning')) not between 1 and 500
    then raise exception 'conflict option must be a specific factual interpretation'; end if;
    if exists (
      select 1 from jsonb_array_elements(option_value -> 'evidenceRefs') r
      where jsonb_typeof(r) <> 'object'
        or (select count(*) from jsonb_object_keys(r)) <> 3
        or not r ?& array['kind','id','role']
        or length(btrim(r ->> 'role')) not between 1 and 120
    ) then raise exception 'conflict evidence references are invalid'; end if;
    if option_value -> 'evidenceRefs' is distinct from (
      select jsonb_agg(value order by value->>'kind', value->>'id', value->>'role')
      from jsonb_array_elements(option_value -> 'evidenceRefs')
    ) then raise exception 'conflict evidence references must be normalized'; end if;
    outcome := option_value -> 'outcome';
    outcome_type := outcome ->> 'type';
    if jsonb_typeof(outcome) <> 'object' or outcome -> 'version' <> '1'::jsonb
      or outcome_type not in (
        'COPY_CURRENT_DECISION','COPY_PRIOR_DECISION','APPLY_VALIDATED_CANDIDATE',
        'REMAIN_UNRESOLVED','OPEN_TYPED_FOLLOWUP'
      ) then raise exception 'unsupported conflict outcome'; end if;
    if outcome_type in ('COPY_CURRENT_DECISION','REMAIN_UNRESOLVED') then
      if (select count(*) from jsonb_object_keys(outcome)) <> 2
      then raise exception 'conflict outcome shape is invalid'; end if;
    elsif outcome_type = 'COPY_PRIOR_DECISION' then
      if (select count(*) from jsonb_object_keys(outcome)) <> 3 or not outcome ? 'decisionId'
      then raise exception 'prior-decision outcome is invalid'; end if;
      if not exists (select 1 from public.bookkeeping_decisions prior
        where prior.id=(outcome->>'decisionId')::uuid and prior.business_id=p_business_id
          and prior.bookkeeping_record_id=p_bookkeeping_record_id)
      then raise exception 'prior decision must belong to the conflict record'; end if;
      if exists (select 1 from public.bookkeeping_decisions prior
        where prior.id=(outcome->>'decisionId')::uuid and prior.provenance='user')
        and not exists (select 1 from jsonb_array_elements(option_value->'evidenceRefs') ref
          join public.bookkeeping_review_events answered
            on answered.id=(ref->>'id')::uuid and answered.event_type='answered'
          where ref->>'kind'='review_answer'
            and answered.resulting_decision_id=(outcome->>'decisionId')::uuid)
      then raise exception 'prior user decision requires its immutable answer reference'; end if;
    else
      candidate := outcome -> 'candidate';
      if jsonb_typeof(candidate) <> 'object'
        or not candidate ?& array['bookkeepingNature','treatment','reviewStatus','allocations']
        or jsonb_typeof(candidate -> 'allocations') <> 'array'
      then raise exception 'trusted candidate is invalid'; end if;
      if candidate ->> 'treatment' not in ('unresolved','business','personal','mixed_use','excluded')
        or candidate ->> 'reviewStatus' not in ('needs_review','in_review','resolved','not_required')
        or (candidate ->> 'bookkeepingNature' is not null and candidate ->> 'bookkeepingNature' not in (
          'expense','business_income','transfer','credit_card_payment','refund',
          'owner_contribution','loan_proceeds','other_non_income'
        ))
      then raise exception 'trusted candidate bookkeeping values are invalid'; end if;
      allocation_total := 0;
      for allocation in select value from jsonb_array_elements(candidate -> 'allocations') loop
        if jsonb_typeof(allocation) <> 'object'
          or not allocation ?& array['kind','amountCents']
          or allocation ->> 'kind' not in ('business','personal','excluded')
          or jsonb_typeof(allocation -> 'amountCents') <> 'number'
        then raise exception 'trusted candidate allocation is invalid'; end if;
        allocation_total := allocation_total + (allocation ->> 'amountCents')::numeric;
      end loop;
      if candidate ->> 'treatment' = 'unresolved' then
        if jsonb_array_length(candidate -> 'allocations') <> 0
        then raise exception 'unresolved candidate cannot allocate'; end if;
      elsif authoritative_amount is null or allocation_total <> authoritative_amount
      then raise exception 'trusted candidate allocations do not reconcile'; end if;
      if candidate ->> 'businessPurpose' is distinct from current_business_purpose
        and not exists (
          select 1 from jsonb_array_elements(option_value->'evidenceRefs') ref
          join public.bookkeeping_review_events answered
            on answered.id=(ref->>'id')::uuid and answered.event_type='answered'
          where ref->>'kind'='review_answer'
            and answered.business_id=p_business_id
            and answered.answer_payload->>'businessPurpose'=candidate->>'businessPurpose'
        )
      then raise exception 'trusted candidate business purpose lacks immutable provenance'; end if;
      if outcome_type = 'APPLY_VALIDATED_CANDIDATE' and
        (select count(*) from jsonb_object_keys(outcome)) <> 3
      then raise exception 'candidate outcome shape is invalid'; end if;
      if outcome_type = 'OPEN_TYPED_FOLLOWUP' then
        if (select count(*) from jsonb_object_keys(outcome)) <> 5
          or outcome ->> 'followUpReason' not in (
            'BUSINESS_USE_UNCLEAR','BUSINESS_PURPOSE_NEEDED',
            'MIXED_USE_CLARIFICATION','TRANSACTION_TYPE_UNCLEAR'
          ) or jsonb_typeof(outcome -> 'followUpContext') <> 'object'
          or outcome -> 'followUpContext' ->> 'reason' <> outcome ->> 'followUpReason'
        then raise exception 'typed follow-up outcome is invalid'; end if;
      end if;
    end if;
  end loop;
  perform public.bookkeeping_conflict_fingerprint(
    p_business_id, p_bookkeeping_record_id,
    (select current_d.id from public.bookkeeping_decisions current_d where current_d.business_id = p_business_id
      and current_d.bookkeeping_record_id = p_bookkeeping_record_id
      and not exists (select 1 from public.bookkeeping_decisions n where n.supersedes_decision_id = current_d.id)),
    'validation', p_options
  );
end;
$$;

create or replace function public.open_bookkeeping_conflicting_evidence_issue(
  p_business_id uuid,
  p_bookkeeping_record_id uuid,
  p_based_on_decision_id uuid,
  p_conflict_key text,
  p_prompt text,
  p_allow_none_of_these boolean,
  p_options jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_id uuid;
  issue_id uuid := gen_random_uuid();
  conflict_fingerprint text;
  selected_question_context jsonb;
begin
  if (select auth.role()) <> 'service_role' then raise exception 'trusted conflict opening required'; end if;
  if length(btrim(p_conflict_key)) not between 1 and 200
    or length(btrim(p_prompt)) not between 1 and 500
  then raise exception 'conflict identity and factual prompt are required'; end if;
  -- Lock the primary and every related record together in sorted order. Never
  -- take the primary lock first: two reciprocal conflicts must share one order.
  perform pg_advisory_xact_lock(hashtextextended(ids.id::text, 41))
  from (
    select p_bookkeeping_record_id id union
    select case when refs ->> 'kind' = 'bookkeeping_record' then (refs ->> 'id')::uuid
      when refs ->> 'kind' = 'bookkeeping_decision' then
        (select bookkeeping_record_id from public.bookkeeping_decisions where id = (refs ->> 'id')::uuid)
      when refs ->> 'kind' = 'review_answer' then
        (select bookkeeping_record_id from public.bookkeeping_review_events where id = (refs ->> 'id')::uuid)
      when refs ->> 'kind' = 'document_link' then
        (select bookkeeping_record_id from public.bookkeeping_document_links where id = (refs ->> 'id')::uuid)
      else null end
    from jsonb_array_elements(p_options) opts,
      jsonb_array_elements(opts -> 'evidenceRefs') refs
  ) ids where ids.id is not null order by ids.id;
  if not exists (select 1 from public.bookkeeping_decisions d
    where d.id = p_based_on_decision_id and d.business_id = p_business_id
      and d.bookkeeping_record_id = p_bookkeeping_record_id
      and not exists (select 1 from public.bookkeeping_decisions n where n.supersedes_decision_id = d.id))
  then raise exception 'conflict must reference the current decision'; end if;
  perform public.validate_bookkeeping_conflict_options(p_business_id, p_bookkeeping_record_id, p_options);
  conflict_fingerprint := public.bookkeeping_conflict_fingerprint(
    p_business_id, p_bookkeeping_record_id, p_based_on_decision_id,
    btrim(p_conflict_key), p_options
  );
  selected_question_context := jsonb_build_object(
    'schemaVersion', 1, 'reason', 'CONFLICTING_EVIDENCE',
    'conflictKey', btrim(p_conflict_key), 'prompt', btrim(p_prompt),
    'allowNoneOfThese', coalesce(p_allow_none_of_these, false),
    'options', p_options, 'conflictFingerprint', conflict_fingerprint
  );
  perform pg_advisory_xact_lock(hashtextextended(
    p_business_id::text || ':' || p_bookkeeping_record_id::text || ':conflict:' || btrim(p_conflict_key), 0
  ));
  select leaf.id into selected_id
  from public.bookkeeping_review_events root
  join lateral (
    select e.id, e.event_type, e.question_context from public.bookkeeping_review_events e
    where e.review_issue_id = root.review_issue_id
      and not exists (select 1 from public.bookkeeping_review_events n where n.supersedes_event_id = e.id)
  ) leaf on true
  where root.business_id = p_business_id and root.bookkeeping_record_id = p_bookkeeping_record_id
    and root.reason = 'CONFLICTING_EVIDENCE' and root.issue_key = btrim(p_conflict_key)
    and root.event_type = 'opened';
  if selected_id is not null then
    if exists (select 1 from public.bookkeeping_review_events where id = selected_id and event_type = 'resolved')
    then raise exception 'resolved conflict cannot be recreated by ordinary processing'; end if;
    if not exists (select 1 from public.bookkeeping_review_events where id = selected_id
      and bookkeeping_review_events.question_context = selected_question_context)
    then raise exception 'existing conflict context changed; use a justified reopen'; end if;
    return selected_id;
  end if;
  insert into public.bookkeeping_review_events (
    id,business_id,bookkeeping_record_id,review_issue_id,sequence_number,event_type,
    reason,based_on_decision_id,issue_key,context_fingerprint,evidence_fingerprint,
    question_context,provenance
  ) values (
    issue_id,p_business_id,p_bookkeeping_record_id,issue_id,1,'opened',
    'CONFLICTING_EVIDENCE',p_based_on_decision_id,btrim(p_conflict_key),
    conflict_fingerprint,public.current_bookkeeping_evidence_fingerprint(p_business_id,p_bookkeeping_record_id),
    selected_question_context,'automation'
  ) returning id into selected_id;
  return selected_id;
end;
$$;

create or replace function public.answer_bookkeeping_conflicting_evidence_review_issue(
  p_review_issue_id uuid,
  p_expected_current_event_id uuid,
  p_expected_current_decision_id uuid,
  p_expected_context_fingerprint text,
  p_expected_evidence_fingerprint text,
  p_expected_conflict_fingerprint text,
  p_answer jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.bookkeeping_review_events%rowtype;
  d public.bookkeeping_decisions%rowtype;
  source_d public.bookkeeping_decisions%rowtype;
  option_value jsonb;
  outcome jsonb;
  candidate jsonb;
  allocation jsonb;
  allocations jsonb := '[]'::jsonb;
  normalized_answer jsonb;
  option_id text;
  explanation text;
  fingerprint text;
  new_decision_id uuid;
  answered_id uuid;
  resolved_id uuid;
  followup_id uuid;
  followup_issue uuid;
  nature text;
  treatment text;
  review_status text;
  reason_text text;
  business_purpose text;
begin
  if (select auth.uid()) is null then raise exception 'authentication required'; end if;
  if jsonb_typeof(p_answer) <> 'object' or p_answer -> 'schemaVersion' <> '1'::jsonb
    or jsonb_typeof(p_answer -> 'optionId') <> 'string'
  then raise exception 'schemaVersion and factual option are required'; end if;
  option_id := btrim(p_answer ->> 'optionId');
  if option_id = 'none_of_these' then
    if (select count(*) from jsonb_object_keys(p_answer)) <> 3
      or jsonb_typeof(p_answer -> 'factualExplanation') <> 'string'
    then raise exception 'fallback requires only a factual explanation'; end if;
    explanation := btrim(p_answer ->> 'factualExplanation');
    if length(explanation) not between 1 and 1000
    then raise exception 'factual explanation must be between 1 and 1000 characters'; end if;
    normalized_answer := jsonb_build_object('schemaVersion',1,'optionId',option_id,'factualExplanation',explanation);
  else
    if (select count(*) from jsonb_object_keys(p_answer)) <> 2
    then raise exception 'only schemaVersion and optionId are accepted'; end if;
    normalized_answer := jsonb_build_object('schemaVersion',1,'optionId',option_id);
  end if;

  select * into e from public.bookkeeping_review_events
  where review_issue_id = p_review_issue_id and id = p_expected_current_event_id;
  if not found or not exists (select 1 from public.businesses
    where id = e.business_id and owner_user_id = (select auth.uid()))
  then raise exception 'review issue is unavailable to authenticated user'; end if;
  -- Lock primary and referenced records in one deterministic order.
  perform pg_advisory_xact_lock(hashtextextended(ids.id::text, 41)) from (
    select e.bookkeeping_record_id id union
    select case when refs ->> 'kind' = 'bookkeeping_record' then (refs ->> 'id')::uuid
      when refs ->> 'kind' = 'bookkeeping_decision' then (select bookkeeping_record_id from public.bookkeeping_decisions where id=(refs->>'id')::uuid)
      when refs ->> 'kind' = 'review_answer' then (select bookkeeping_record_id from public.bookkeeping_review_events where id=(refs->>'id')::uuid)
      when refs ->> 'kind' = 'document_link' then (select bookkeeping_record_id from public.bookkeeping_document_links where id=(refs->>'id')::uuid)
      else null end
    from jsonb_array_elements(e.question_context -> 'options') opts,
      jsonb_array_elements(opts -> 'evidenceRefs') refs
  ) ids where ids.id is not null order by ids.id;
  select * into e from public.bookkeeping_review_events
  where review_issue_id=p_review_issue_id and id=p_expected_current_event_id for update;
  if not found or e.reason <> 'CONFLICTING_EVIDENCE'
    or e.event_type not in ('opened','skipped','reopened')
    or exists (select 1 from public.bookkeeping_review_events n where n.supersedes_event_id=e.id)
  then raise exception 'current review event changed'; end if;
  if e.context_fingerprint <> p_expected_context_fingerprint
    or e.evidence_fingerprint is distinct from p_expected_evidence_fingerprint
  then raise exception 'expected review context changed'; end if;
  if e.question_context -> 'schemaVersion' <> '1'::jsonb
    or e.question_context ->> 'reason' <> 'CONFLICTING_EVIDENCE'
  then raise exception 'trusted conflict context is invalid'; end if;
  select * into d from public.bookkeeping_decisions current_d
  where current_d.id=p_expected_current_decision_id and current_d.business_id=e.business_id
    and current_d.bookkeeping_record_id=e.bookkeeping_record_id
    and not exists (select 1 from public.bookkeeping_decisions n where n.supersedes_decision_id=current_d.id)
  for update;
  if not found or d.id <> e.based_on_decision_id then raise exception 'current bookkeeping decision changed'; end if;
  if public.current_bookkeeping_evidence_fingerprint(e.business_id,e.bookkeeping_record_id)
      is distinct from e.evidence_fingerprint
  then raise exception 'canonical evidence changed; reevaluation required'; end if;
  perform public.validate_bookkeeping_conflict_options(e.business_id,e.bookkeeping_record_id,e.question_context->'options');
  fingerprint := public.bookkeeping_conflict_fingerprint(
    e.business_id,e.bookkeeping_record_id,d.id,e.question_context->>'conflictKey',e.question_context->'options'
  );
  if fingerprint is distinct from p_expected_conflict_fingerprint
    or fingerprint is distinct from e.question_context->>'conflictFingerprint'
    or fingerprint is distinct from e.context_fingerprint
  then raise exception 'trusted conflict context changed'; end if;

  if option_id = 'none_of_these' then
    if coalesce((e.question_context->>'allowNoneOfThese')::boolean,false) is not true
    then raise exception 'factual fallback is not enabled'; end if;
    outcome := jsonb_build_object('type','REMAIN_UNRESOLVED','version',1);
  else
    select value into option_value from jsonb_array_elements(e.question_context->'options')
    where value->>'optionId'=option_id;
    if not found then raise exception 'selected factual option is unavailable'; end if;
    outcome := option_value->'outcome';
  end if;

  if outcome->>'type' = 'COPY_CURRENT_DECISION' then source_d := d;
  elsif outcome->>'type' = 'COPY_PRIOR_DECISION' then
    select * into source_d from public.bookkeeping_decisions
    where id=(outcome->>'decisionId')::uuid and business_id=e.business_id
      and bookkeeping_record_id=e.bookkeeping_record_id;
    if not found then raise exception 'referenced prior decision is unavailable'; end if;
  end if;
  if source_d.id is not null then
    nature:=source_d.bookkeeping_nature; treatment:=source_d.treatment;
    review_status:=source_d.review_status; reason_text:=source_d.reason;
    business_purpose:=source_d.business_purpose;
    select coalesce(jsonb_agg(jsonb_build_object(
      'kind',allocation_kind,'amount_cents',amount_cents,
      'tax_category_key',tax_category_key,'memo',memo
    ) order by created_at),'[]'::jsonb) into allocations
    from public.bookkeeping_allocations where business_id=e.business_id
      and bookkeeping_decision_id=source_d.id;
  elsif outcome->>'type' in ('APPLY_VALIDATED_CANDIDATE','OPEN_TYPED_FOLLOWUP') then
    candidate:=outcome->'candidate'; nature:=candidate->>'bookkeepingNature';
    treatment:=candidate->>'treatment'; review_status:=candidate->>'reviewStatus';
    reason_text:=candidate->>'reason'; business_purpose:=candidate->>'businessPurpose';
    for allocation in select value from jsonb_array_elements(candidate->'allocations') loop
      allocations:=allocations||jsonb_build_array(jsonb_build_object(
        'kind',allocation->>'kind','amount_cents',(allocation->>'amountCents')::bigint,
        'tax_category_key',allocation->>'taxCategoryKey','memo',allocation->>'memo'
      ));
    end loop;
  else
    nature:=d.bookkeeping_nature; treatment:='unresolved'; review_status:='needs_review';
    reason_text:=d.reason; business_purpose:=d.business_purpose; allocations:='[]'::jsonb;
  end if;
  new_decision_id:=public.append_bookkeeping_decision(
    e.business_id,e.bookkeeping_record_id,d.id,nature,treatment,review_status,
    'user',null,reason_text,business_purpose,allocations
  );
  insert into public.bookkeeping_review_events(
    business_id,bookkeeping_record_id,review_issue_id,supersedes_event_id,sequence_number,
    event_type,reason,based_on_decision_id,issue_key,context_fingerprint,evidence_fingerprint,
    question_context,answer_payload,resulting_decision_id,provenance,actor_user_id
  ) values(e.business_id,e.bookkeeping_record_id,e.review_issue_id,e.id,e.sequence_number+1,
    'answered',e.reason,d.id,e.issue_key,e.context_fingerprint,e.evidence_fingerprint,
    e.question_context,normalized_answer,new_decision_id,'user',(select auth.uid())) returning id into answered_id;
  insert into public.bookkeeping_review_events(
    business_id,bookkeeping_record_id,review_issue_id,supersedes_event_id,sequence_number,
    event_type,reason,based_on_decision_id,issue_key,context_fingerprint,evidence_fingerprint,
    question_context,resulting_decision_id,provenance
  ) values(e.business_id,e.bookkeeping_record_id,e.review_issue_id,answered_id,e.sequence_number+2,
    'resolved',e.reason,d.id,e.issue_key,e.context_fingerprint,e.evidence_fingerprint,
    e.question_context,new_decision_id,'system') returning id into resolved_id;
  if outcome->>'type'='OPEN_TYPED_FOLLOWUP' then
    followup_issue:=gen_random_uuid();
    insert into public.bookkeeping_review_events(
      id,business_id,bookkeeping_record_id,review_issue_id,sequence_number,event_type,reason,
      based_on_decision_id,issue_key,context_fingerprint,evidence_fingerprint,question_context,provenance
    ) values(followup_issue,e.business_id,e.bookkeeping_record_id,followup_issue,1,'opened',
      outcome->>'followUpReason',new_decision_id,lower(outcome->>'followUpReason')||':after:'||e.review_issue_id,
      md5(fingerprint||':'||new_decision_id||':'||(outcome->>'followUpReason')),
      public.current_bookkeeping_evidence_fingerprint(e.business_id,e.bookkeeping_record_id),
      outcome->'followUpContext','system') returning id into followup_id;
  end if;
  return jsonb_build_object('business_id',e.business_id,'decision_id',new_decision_id,
    'answered_event_id',answered_id,'resolved_event_id',resolved_id,'follow_up_event_id',followup_id);
end;
$$;

revoke execute on function public.bookkeeping_conflict_fingerprint(uuid,uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.bookkeeping_conflict_fingerprint(uuid,uuid,uuid,text,jsonb) to service_role;
revoke execute on function public.validate_bookkeeping_conflict_options(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.validate_bookkeeping_conflict_options(uuid,uuid,jsonb) to service_role;
revoke execute on function public.open_bookkeeping_conflicting_evidence_issue(uuid,uuid,uuid,text,text,boolean,jsonb) from public,anon,authenticated;
grant execute on function public.open_bookkeeping_conflicting_evidence_issue(uuid,uuid,uuid,text,text,boolean,jsonb) to service_role;
revoke execute on function public.answer_bookkeeping_conflicting_evidence_review_issue(uuid,uuid,uuid,text,text,text,jsonb) from public,anon;
grant execute on function public.answer_bookkeeping_conflicting_evidence_review_issue(uuid,uuid,uuid,text,text,text,jsonb) to authenticated;

comment on function public.open_bookkeeping_conflicting_evidence_issue(uuid,uuid,uuid,text,text,boolean,jsonb)
is 'Trusted-only opener for evidence-backed factual conflict options.';
comment on function public.answer_bookkeeping_conflicting_evidence_review_issue(uuid,uuid,uuid,text,text,text,jsonb)
is 'Atomically applies one server-authored factual conflict option selected by the owning user.';

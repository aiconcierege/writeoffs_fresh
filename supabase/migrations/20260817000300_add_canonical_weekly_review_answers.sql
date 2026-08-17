-- Atomic factual answer processing for BUSINESS_PURPOSE_NEEDED only.

alter table public.bookkeeping_review_events
  add column question_context jsonb,
  add column answer_payload jsonb,
  add column resulting_decision_id uuid,
  add column evidence_fingerprint text,
  add constraint bookkeeping_review_events_resulting_decision_fkey
    foreign key (resulting_decision_id, business_id, bookkeeping_record_id)
    references public.bookkeeping_decisions(id, business_id, bookkeeping_record_id)
    on delete restrict;

alter table public.bookkeeping_review_events
  drop constraint bookkeeping_review_events_type_check,
  add constraint bookkeeping_review_events_type_check check (
    event_type in ('opened', 'answered', 'skipped', 'resolved', 'reopened')
  );

create or replace function public.lock_bookkeeping_evidence_state()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(new.bookkeeping_record_id::text, 41));
  return new;
end;
$$;

create trigger bookkeeping_financial_sources_lock_evidence
before insert or update on public.bookkeeping_financial_sources
for each row execute function public.lock_bookkeeping_evidence_state();
create trigger bookkeeping_document_links_lock_evidence
before insert or update on public.bookkeeping_document_links
for each row execute function public.lock_bookkeeping_evidence_state();

create or replace function public.current_bookkeeping_evidence_fingerprint(
  p_business_id uuid,
  p_bookkeeping_record_id uuid
)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  selected_record public.bookkeeping_records%rowtype;
  source_state text;
  document_state text;
  authoritative_amount bigint;
  authoritative_currency text;
begin
  select * into selected_record
  from public.bookkeeping_records
  where id = p_bookkeeping_record_id and business_id = p_business_id;
  if not found then raise exception 'bookkeeping record is unavailable'; end if;

  select
    concat_ws(':', sources.id::text, sources.financial_transaction_id::text),
    transactions.amount_cents,
    transactions.currency
  into source_state, authoritative_amount, authoritative_currency
  from public.bookkeeping_financial_sources as sources
  join public.financial_transactions as transactions
    on transactions.id = sources.financial_transaction_id
   and transactions.business_id = sources.business_id
  where sources.business_id = p_business_id
    and sources.bookkeeping_record_id = p_bookkeeping_record_id
    and sources.revoked_at is null;

  authoritative_amount := coalesce(authoritative_amount, selected_record.amount_cents);
  authoritative_currency := coalesce(authoritative_currency, selected_record.currency);

  select coalesce(string_agg(
    concat_ws(':',
      links.id::text,
      links.receipt_id::text,
      extract(epoch from links.linked_at)::text,
      coalesce(extract(epoch from links.revoked_at)::text, 'active'),
      coalesce(links.revocation_reason, '')
    ),
    '|' order by links.id::text
  ), '') into document_state
  from public.bookkeeping_document_links as links
  where links.business_id = p_business_id
    and links.bookkeeping_record_id = p_bookkeeping_record_id;

  return md5(concat_ws('|',
    selected_record.id::text,
    coalesce(authoritative_amount::text, 'unknown'),
    authoritative_currency,
    coalesce(source_state, 'no-financial-source'),
    document_state
  ));
end;
$$;

create or replace function public.validate_bookkeeping_review_event()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  predecessor public.bookkeeping_review_events%rowtype;
begin
  if new.event_type in ('opened', 'reopened') and not exists (
    select 1 from public.bookkeeping_decisions as decisions
    where decisions.id = new.based_on_decision_id
      and decisions.business_id = new.business_id
      and decisions.bookkeeping_record_id = new.bookkeeping_record_id
      and not exists (
        select 1 from public.bookkeeping_decisions as successors
        where successors.supersedes_decision_id = decisions.id
      )
  ) then
    raise exception 'opening or reopening must reference the current bookkeeping decision';
  end if;

  if new.actor_user_id is not null and not exists (
    select 1 from public.businesses
    where businesses.id = new.business_id
      and businesses.owner_user_id = new.actor_user_id
  ) then raise exception 'review event actor does not own the Business'; end if;

  if new.supersedes_event_id is null then
    if new.event_type <> 'opened' or new.sequence_number <> 1
      or new.review_issue_id <> new.id
      or new.provenance not in ('automation', 'system')
      or new.deferred_until is not null or new.answer_payload is not null
      or new.resulting_decision_id is not null
    then raise exception 'review issue must begin with one trusted opened event'; end if;
    return new;
  end if;

  select * into predecessor from public.bookkeeping_review_events
  where id = new.supersedes_event_id
    and business_id = new.business_id
    and bookkeeping_record_id = new.bookkeeping_record_id
    and review_issue_id = new.review_issue_id
  for update;
  if not found then raise exception 'review predecessor is unavailable'; end if;
  if exists (
    select 1 from public.bookkeeping_review_events
    where supersedes_event_id = predecessor.id
  ) then raise exception 'review correction must supersede the current event leaf'; end if;
  if new.sequence_number <> predecessor.sequence_number + 1
    or new.reason <> predecessor.reason or new.issue_key <> predecessor.issue_key
  then raise exception 'review issue identity and ordering are immutable'; end if;

  if new.event_type = 'answered' then
    if predecessor.event_type not in ('opened', 'skipped', 'reopened')
      or new.provenance <> 'user' or new.answer_payload is null
      or new.resulting_decision_id is null or new.deferred_until is not null
    then raise exception 'answer must be a user response to the current outstanding issue'; end if;
    if new.context_fingerprint <> predecessor.context_fingerprint
      or new.evidence_fingerprint is distinct from predecessor.evidence_fingerprint
      or new.question_context is distinct from predecessor.question_context
      or new.based_on_decision_id <> predecessor.based_on_decision_id
    then raise exception 'answer cannot change trusted review context'; end if;
    if not exists (
      select 1 from public.bookkeeping_decisions as result
      where result.id = new.resulting_decision_id
        and result.business_id = new.business_id
        and result.bookkeeping_record_id = new.bookkeeping_record_id
        and result.supersedes_decision_id = new.based_on_decision_id
        and result.provenance = 'user'
        and result.actor_user_id = new.actor_user_id
        and not exists (
          select 1 from public.bookkeeping_decisions as successors
          where successors.supersedes_decision_id = result.id
        )
    ) then raise exception 'answer must link its new current user decision'; end if;
  elsif new.event_type = 'skipped' then
    if predecessor.event_type not in ('opened', 'skipped', 'reopened')
      or new.provenance <> 'user' or new.answer_payload is not null
      or new.resulting_decision_id is not null
    then raise exception 'only an outstanding issue may be skipped by its user'; end if;
    if new.context_fingerprint <> predecessor.context_fingerprint
      or new.evidence_fingerprint is distinct from predecessor.evidence_fingerprint
      or new.question_context is distinct from predecessor.question_context
      or new.based_on_decision_id <> predecessor.based_on_decision_id
    then raise exception 'skip cannot change review context'; end if;
  elsif new.event_type = 'resolved' then
    if predecessor.event_type = 'answered' then
      if new.provenance <> 'system'
        or new.resulting_decision_id is distinct from predecessor.resulting_decision_id
        or new.answer_payload is not null
      then raise exception 'answered issue resolution must preserve its result'; end if;
    elsif predecessor.event_type not in ('opened', 'skipped', 'reopened')
      or new.provenance not in ('automation', 'system')
      or new.resulting_decision_id is not null or new.answer_payload is not null
    then raise exception 'only an outstanding issue may be resolved by trusted processing'; end if;
    if new.context_fingerprint <> predecessor.context_fingerprint
      or new.evidence_fingerprint is distinct from predecessor.evidence_fingerprint
      or new.question_context is distinct from predecessor.question_context
      or new.based_on_decision_id <> predecessor.based_on_decision_id
    then raise exception 'resolution cannot change review context'; end if;
  elsif new.event_type = 'reopened' then
    if predecessor.event_type <> 'resolved'
      or new.provenance not in ('automation', 'system')
      or new.context_fingerprint = predecessor.context_fingerprint
      or new.answer_payload is not null or new.resulting_decision_id is not null
    then raise exception 'reopen requires a resolved issue and materially new context'; end if;
  else
    raise exception 'only the first review event may be opened';
  end if;
  return new;
end;
$$;

create or replace function public.open_bookkeeping_review_issue_v2(
  p_business_id uuid,
  p_bookkeeping_record_id uuid,
  p_based_on_decision_id uuid,
  p_reason text,
  p_issue_key text,
  p_context_fingerprint text,
  p_question_context jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  issue_uuid uuid := gen_random_uuid();
  selected_event_id uuid;
  selected_evidence_fingerprint text;
begin
  if p_reason not in (
    'BUSINESS_USE_UNCLEAR', 'BUSINESS_PURPOSE_NEEDED',
    'MIXED_USE_CLARIFICATION', 'TRANSACTION_TYPE_UNCLEAR',
    'CONFLICTING_EVIDENCE'
  ) then raise exception 'unsupported Weekly Review reason'; end if;
  if length(btrim(p_issue_key)) not between 1 and 200
    or length(btrim(p_context_fingerprint)) not between 1 and 200
  then raise exception 'review issue identity is required'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_bookkeeping_record_id::text, 41));
  selected_evidence_fingerprint := public.current_bookkeeping_evidence_fingerprint(
    p_business_id, p_bookkeeping_record_id
  );
  perform pg_advisory_xact_lock(hashtextextended(
    p_business_id::text || ':' || p_bookkeeping_record_id::text || ':' ||
    p_reason || ':' || p_issue_key, 0
  ));

  insert into public.bookkeeping_review_events (
    id, business_id, bookkeeping_record_id, review_issue_id,
    supersedes_event_id, sequence_number, event_type, reason,
    based_on_decision_id, issue_key, context_fingerprint,
    evidence_fingerprint, question_context, provenance, actor_user_id
  ) values (
    issue_uuid, p_business_id, p_bookkeeping_record_id, issue_uuid,
    null, 1, 'opened', p_reason, p_based_on_decision_id,
    btrim(p_issue_key), btrim(p_context_fingerprint),
    selected_evidence_fingerprint, p_question_context, 'automation', null
  ) on conflict (business_id, bookkeeping_record_id, reason, issue_key)
    where event_type = 'opened' do nothing
  returning id into selected_event_id;

  if selected_event_id is null then
    select events.id into selected_event_id
    from public.bookkeeping_review_events as events
    where events.business_id = p_business_id
      and events.bookkeeping_record_id = p_bookkeeping_record_id
      and events.reason = p_reason and events.issue_key = btrim(p_issue_key)
      and not exists (
        select 1 from public.bookkeeping_review_events as successors
        where successors.supersedes_event_id = events.id
      );
  end if;
  return selected_event_id;
end;
$$;

create or replace function public.answer_bookkeeping_business_purpose_review_issue(
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
  selected_business_purpose text;
  current_evidence_fingerprint text;
  copied_allocations jsonb;
  inserted_decision_id uuid;
  answered_event_id uuid;
  resolved_event_id uuid;
begin
  if (select auth.uid()) is null then raise exception 'authentication required'; end if;
  if jsonb_typeof(p_answer) <> 'object'
    or (select count(*) from jsonb_object_keys(p_answer)) <> 2
    or not (p_answer ? 'schemaVersion') or not (p_answer ? 'businessPurpose')
    or p_answer -> 'schemaVersion' <> '1'::jsonb
    or jsonb_typeof(p_answer -> 'businessPurpose') <> 'string'
  then raise exception 'only schemaVersion and factual businessPurpose are accepted'; end if;
  selected_business_purpose := btrim(p_answer ->> 'businessPurpose');
  if length(selected_business_purpose) not between 1 and 1000
  then raise exception 'business purpose must be between 1 and 1000 characters'; end if;

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
  if current_event.reason <> 'BUSINESS_PURPOSE_NEEDED'
  then raise exception 'answer processing is not implemented for this review reason'; end if;
  if current_event.context_fingerprint <> p_expected_context_fingerprint
    or current_event.question_context is null
    or current_event.question_context -> 'schemaVersion' <> '1'::jsonb
    or current_event.question_context ->> 'reason' <> 'BUSINESS_PURPOSE_NEEDED'
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
  if current_decision.treatment = 'unresolved' or current_decision.bookkeeping_nature is null
  then raise exception 'business-purpose question requires established bookkeeping facts'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'kind', allocations.allocation_kind,
    'amount_cents', allocations.amount_cents,
    'tax_category_key', allocations.tax_category_key,
    'memo', allocations.memo
  ) order by allocations.created_at, allocations.id), '[]'::jsonb)
  into copied_allocations
  from public.bookkeeping_allocations as allocations
  where allocations.business_id = current_event.business_id
    and allocations.bookkeeping_record_id = current_event.bookkeeping_record_id
    and allocations.bookkeeping_decision_id = current_decision.id;

  inserted_decision_id := public.append_bookkeeping_decision(
    current_event.business_id,
    current_event.bookkeeping_record_id,
    current_decision.id,
    current_decision.bookkeeping_nature,
    current_decision.treatment,
    'resolved',
    'user',
    null,
    current_decision.reason,
    selected_business_purpose,
    copied_allocations
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
    jsonb_build_object('schemaVersion', 1, 'businessPurpose', selected_business_purpose),
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

  return jsonb_build_object(
    'business_id', current_event.business_id,
    'decision_id', inserted_decision_id,
    'answered_event_id', answered_event_id,
    'resolved_event_id', resolved_event_id
  );
end;
$$;

-- Preserve the trusted context added in this migration across the existing
-- non-answer lifecycle operations.
create or replace function public.skip_bookkeeping_review_issue(
  p_business_id uuid,
  p_review_issue_id uuid,
  p_expected_current_event_id uuid,
  p_deferred_until timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_event public.bookkeeping_review_events%rowtype;
  inserted_id uuid;
begin
  if (select auth.uid()) is null or not exists (
    select 1 from public.businesses
    where id = p_business_id and owner_user_id = (select auth.uid())
  ) then raise exception 'review issue is unavailable to the authenticated user'; end if;
  select * into current_event from public.bookkeeping_review_events
  where business_id = p_business_id and review_issue_id = p_review_issue_id
    and id = p_expected_current_event_id for update;
  if not found then raise exception 'current review event changed'; end if;
  insert into public.bookkeeping_review_events (
    business_id, bookkeeping_record_id, review_issue_id, supersedes_event_id,
    sequence_number, event_type, reason, based_on_decision_id, issue_key,
    context_fingerprint, evidence_fingerprint, question_context,
    deferred_until, provenance, actor_user_id
  ) values (
    current_event.business_id, current_event.bookkeeping_record_id,
    current_event.review_issue_id, current_event.id,
    current_event.sequence_number + 1, 'skipped', current_event.reason,
    current_event.based_on_decision_id, current_event.issue_key,
    current_event.context_fingerprint, current_event.evidence_fingerprint,
    current_event.question_context, p_deferred_until, 'user', (select auth.uid())
  ) returning id into inserted_id;
  return inserted_id;
end;
$$;

create or replace function public.resolve_bookkeeping_review_issue(
  p_business_id uuid,
  p_review_issue_id uuid,
  p_expected_current_event_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_event public.bookkeeping_review_events%rowtype;
  inserted_id uuid;
begin
  select * into current_event from public.bookkeeping_review_events
  where business_id = p_business_id and review_issue_id = p_review_issue_id
    and id = p_expected_current_event_id for update;
  if not found then raise exception 'current review event changed'; end if;
  insert into public.bookkeeping_review_events (
    business_id, bookkeeping_record_id, review_issue_id, supersedes_event_id,
    sequence_number, event_type, reason, based_on_decision_id, issue_key,
    context_fingerprint, evidence_fingerprint, question_context,
    provenance, actor_user_id
  ) values (
    current_event.business_id, current_event.bookkeeping_record_id,
    current_event.review_issue_id, current_event.id,
    current_event.sequence_number + 1, 'resolved', current_event.reason,
    current_event.based_on_decision_id, current_event.issue_key,
    current_event.context_fingerprint, current_event.evidence_fingerprint,
    current_event.question_context, 'system', null
  ) returning id into inserted_id;
  return inserted_id;
end;
$$;

create or replace function public.reopen_bookkeeping_review_issue(
  p_business_id uuid,
  p_review_issue_id uuid,
  p_expected_current_event_id uuid,
  p_based_on_decision_id uuid,
  p_context_fingerprint text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_event public.bookkeeping_review_events%rowtype;
  inserted_id uuid;
  selected_evidence_fingerprint text;
begin
  if length(btrim(p_context_fingerprint)) not between 1 and 200
  then raise exception 'materially new context fingerprint is required'; end if;
  select * into current_event from public.bookkeeping_review_events
  where business_id = p_business_id and review_issue_id = p_review_issue_id
    and id = p_expected_current_event_id;
  if not found then raise exception 'current review event changed'; end if;
  perform pg_advisory_xact_lock(hashtextextended(current_event.bookkeeping_record_id::text, 41));
  select * into current_event from public.bookkeeping_review_events
  where business_id = p_business_id and review_issue_id = p_review_issue_id
    and id = p_expected_current_event_id for update;
  if not found then raise exception 'current review event changed'; end if;
  selected_evidence_fingerprint := public.current_bookkeeping_evidence_fingerprint(
    current_event.business_id, current_event.bookkeeping_record_id
  );
  insert into public.bookkeeping_review_events (
    business_id, bookkeeping_record_id, review_issue_id, supersedes_event_id,
    sequence_number, event_type, reason, based_on_decision_id, issue_key,
    context_fingerprint, evidence_fingerprint, question_context,
    provenance, actor_user_id
  ) values (
    current_event.business_id, current_event.bookkeeping_record_id,
    current_event.review_issue_id, current_event.id,
    current_event.sequence_number + 1, 'reopened', current_event.reason,
    p_based_on_decision_id, current_event.issue_key, btrim(p_context_fingerprint),
    selected_evidence_fingerprint, current_event.question_context,
    'automation', null
  ) returning id into inserted_id;
  return inserted_id;
end;
$$;

revoke execute on function public.open_bookkeeping_review_issue(
  uuid, uuid, uuid, text, text, text
) from service_role;
revoke execute on function public.current_bookkeeping_evidence_fingerprint(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.current_bookkeeping_evidence_fingerprint(uuid, uuid)
  to service_role;
revoke execute on function public.open_bookkeeping_review_issue_v2(
  uuid, uuid, uuid, text, text, text, jsonb
) from public, anon, authenticated;
grant execute on function public.open_bookkeeping_review_issue_v2(
  uuid, uuid, uuid, text, text, text, jsonb
) to service_role;
revoke execute on function public.answer_bookkeeping_business_purpose_review_issue(
  uuid, uuid, uuid, text, text, jsonb
) from public, anon;
grant execute on function public.answer_bookkeeping_business_purpose_review_issue(
  uuid, uuid, uuid, text, text, jsonb
) to authenticated;

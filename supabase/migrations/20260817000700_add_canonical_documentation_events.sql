-- Append-only documentation-risk history. Receipt Lost is a factual assertion;
-- it never changes canonical bookkeeping or Weekly Review state.

create table public.bookkeeping_documentation_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  bookkeeping_record_id uuid not null,
  documentation_issue_id uuid not null,
  supersedes_event_id uuid,
  sequence_number integer not null,
  event_type text not null,
  reason text not null,
  issue_key text not null,
  context_fingerprint text not null,
  evidence_fingerprint text not null,
  question_context jsonb,
  assertion_payload jsonb,
  provenance text not null,
  actor_user_id uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint bookkeeping_documentation_events_scope_unique
    unique (id, business_id, bookkeeping_record_id, documentation_issue_id),
  constraint bookkeeping_documentation_events_record_fkey
    foreign key (bookkeeping_record_id, business_id)
    references public.bookkeeping_records(id, business_id) on delete restrict,
  constraint bookkeeping_documentation_events_predecessor_fkey
    foreign key (
      supersedes_event_id, business_id, bookkeeping_record_id,
      documentation_issue_id
    ) references public.bookkeeping_documentation_events (
      id, business_id, bookkeeping_record_id, documentation_issue_id
    ) on delete restrict,
  constraint bookkeeping_documentation_events_sequence_check
    check (sequence_number > 0),
  constraint bookkeeping_documentation_events_type_check check (
    event_type in (
      'request_opened', 'receipt_lost', 'evidence_attached',
      'resolved', 'reopened'
    )
  ),
  constraint bookkeeping_documentation_events_reason_check check (
    reason = 'MISSING_SUPPORTING_DOCUMENTATION'
  ),
  constraint bookkeeping_documentation_events_text_check check (
    length(btrim(issue_key)) between 1 and 200
    and length(btrim(context_fingerprint)) between 1 and 200
    and length(btrim(evidence_fingerprint)) between 1 and 200
  ),
  constraint bookkeeping_documentation_events_provenance_check check (
    provenance in ('automation', 'system', 'user')
  ),
  constraint bookkeeping_documentation_events_actor_check check (
    (provenance = 'user' and actor_user_id is not null)
    or (provenance <> 'user' and actor_user_id is null)
  )
);

comment on table public.bookkeeping_documentation_events is
  'Append-only documentation request and risk history, separate from bookkeeping decisions and Weekly Review.';

create unique index bookkeeping_documentation_events_one_successor_idx
  on public.bookkeeping_documentation_events (supersedes_event_id)
  where supersedes_event_id is not null;
create unique index bookkeeping_documentation_events_open_idempotency_idx
  on public.bookkeeping_documentation_events (
    business_id, bookkeeping_record_id, reason, issue_key
  ) where event_type = 'request_opened';
create unique index bookkeeping_documentation_events_material_context_idx
  on public.bookkeeping_documentation_events (
    documentation_issue_id, context_fingerprint
  ) where event_type in ('request_opened', 'reopened');
create index bookkeeping_documentation_events_issue_sequence_idx
  on public.bookkeeping_documentation_events (
    documentation_issue_id, sequence_number
  );
create index bookkeeping_documentation_events_outstanding_idx
  on public.bookkeeping_documentation_events (business_id, created_at)
  where event_type in ('request_opened', 'reopened');

create or replace function public.validate_bookkeeping_documentation_event()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  predecessor public.bookkeeping_documentation_events%rowtype;
begin
  if new.actor_user_id is not null and not exists (
    select 1 from public.businesses
    where id = new.business_id and owner_user_id = new.actor_user_id
  ) then raise exception 'documentation event actor does not own Business'; end if;

  if new.supersedes_event_id is null then
    if new.event_type <> 'request_opened' or new.sequence_number <> 1
      or new.documentation_issue_id <> new.id
      or new.provenance not in ('automation', 'system')
      or new.assertion_payload is not null
      or new.question_context is null
    then raise exception 'documentation issue must begin with one trusted request'; end if;
    return new;
  end if;

  select * into predecessor
  from public.bookkeeping_documentation_events
  where id = new.supersedes_event_id
    and business_id = new.business_id
    and bookkeeping_record_id = new.bookkeeping_record_id
    and documentation_issue_id = new.documentation_issue_id
  for update;
  if not found then raise exception 'documentation predecessor is unavailable'; end if;
  if exists (
    select 1 from public.bookkeeping_documentation_events
    where supersedes_event_id = predecessor.id
  ) then raise exception 'documentation history must supersede its current leaf'; end if;
  if new.sequence_number <> predecessor.sequence_number + 1
    or new.reason <> predecessor.reason or new.issue_key <> predecessor.issue_key
  then raise exception 'documentation issue identity and ordering are immutable'; end if;

  if new.event_type = 'receipt_lost' then
    if predecessor.event_type not in ('request_opened', 'reopened')
      or new.provenance <> 'user' or new.actor_user_id is null
      or new.context_fingerprint <> predecessor.context_fingerprint
      or new.evidence_fingerprint <> predecessor.evidence_fingerprint
      or new.question_context is distinct from predecessor.question_context
      or new.assertion_payload <> '{"schemaVersion":1,"assertion":"receipt_lost"}'::jsonb
    then raise exception 'Receipt Lost must be one exact user assertion on the outstanding request'; end if;
  elsif new.event_type = 'resolved' then
    if predecessor.event_type <> 'receipt_lost'
      or new.provenance <> 'system' or new.assertion_payload is not null
      or new.context_fingerprint <> predecessor.context_fingerprint
      or new.evidence_fingerprint <> predecessor.evidence_fingerprint
      or new.question_context is distinct from predecessor.question_context
    then raise exception 'Receipt Lost resolution must preserve documentation context'; end if;
  elsif new.event_type = 'reopened' then
    if predecessor.event_type <> 'resolved'
      or new.provenance not in ('automation', 'system')
      or new.assertion_payload is not null or new.question_context is null
      or new.context_fingerprint = predecessor.context_fingerprint
      or new.evidence_fingerprint = predecessor.evidence_fingerprint
    then raise exception 'reopen requires materially new context and evidence'; end if;
  elsif new.event_type = 'evidence_attached' then
    raise exception 'documentation evidence attachment is not implemented in this slice';
  else
    raise exception 'unsupported documentation lifecycle transition';
  end if;
  return new;
end;
$$;

create trigger bookkeeping_documentation_events_validate
before insert on public.bookkeeping_documentation_events
for each row execute function public.validate_bookkeeping_documentation_event();
create trigger bookkeeping_documentation_events_reject_update_delete
before update or delete on public.bookkeeping_documentation_events
for each row execute function public.reject_canonical_bookkeeping_mutation();

create or replace function public.open_bookkeeping_documentation_request(
  p_business_id uuid,
  p_bookkeeping_record_id uuid,
  p_reason text,
  p_issue_key text,
  p_context_fingerprint text,
  p_question_context jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  issue_id uuid := gen_random_uuid();
  selected_event public.bookkeeping_documentation_events%rowtype;
  evidence_fingerprint text;
begin
  if (select auth.role()) <> 'service_role'
  then raise exception 'trusted documentation request opening required'; end if;
  if p_reason <> 'MISSING_SUPPORTING_DOCUMENTATION'
    or length(btrim(p_issue_key)) not between 1 and 200
    or length(btrim(p_context_fingerprint)) not between 1 and 200
    or jsonb_typeof(p_question_context) <> 'object'
    or p_question_context -> 'schemaVersion' <> '1'::jsonb
    or p_question_context ->> 'reason' <> p_reason
  then raise exception 'supported documentation request context is required'; end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_bookkeeping_record_id::text, 41)
  );
  if not exists (
    select 1 from public.bookkeeping_records
    where id = p_bookkeeping_record_id and business_id = p_business_id
  ) then raise exception 'bookkeeping record is unavailable'; end if;
  if exists (
    select 1 from public.bookkeeping_document_links
    where business_id = p_business_id
      and bookkeeping_record_id = p_bookkeeping_record_id
      and revoked_at is null
  ) then raise exception 'supporting documentation is already attached'; end if;
  evidence_fingerprint := public.current_bookkeeping_evidence_fingerprint(
    p_business_id, p_bookkeeping_record_id
  );
  perform pg_advisory_xact_lock(hashtextextended(
    p_business_id::text || ':' || p_bookkeeping_record_id::text || ':' ||
    p_reason || ':' || btrim(p_issue_key), 73
  ));

  select leaf.* into selected_event
  from public.bookkeeping_documentation_events root
  join lateral (
    select events.* from public.bookkeeping_documentation_events events
    where events.documentation_issue_id = root.documentation_issue_id
      and not exists (
        select 1 from public.bookkeeping_documentation_events successors
        where successors.supersedes_event_id = events.id
      )
  ) leaf on true
  where root.business_id = p_business_id
    and root.bookkeeping_record_id = p_bookkeeping_record_id
    and root.reason = p_reason and root.issue_key = btrim(p_issue_key)
    and root.event_type = 'request_opened';

  if selected_event.id is not null then
    if selected_event.context_fingerprint <> btrim(p_context_fingerprint)
      or selected_event.evidence_fingerprint <> evidence_fingerprint
      or selected_event.question_context is distinct from p_question_context
    then raise exception 'documentation context changed; trusted reevaluation required'; end if;
    return selected_event.id;
  end if;

  insert into public.bookkeeping_documentation_events (
    id, business_id, bookkeeping_record_id, documentation_issue_id,
    sequence_number, event_type, reason, issue_key, context_fingerprint,
    evidence_fingerprint, question_context, provenance
  ) values (
    issue_id, p_business_id, p_bookkeeping_record_id, issue_id,
    1, 'request_opened', p_reason, btrim(p_issue_key),
    btrim(p_context_fingerprint), evidence_fingerprint,
    p_question_context, 'automation'
  ) returning id into issue_id;
  return issue_id;
end;
$$;

create or replace function public.mark_bookkeeping_receipt_lost(
  p_documentation_issue_id uuid,
  p_expected_current_event_id uuid,
  p_expected_context_fingerprint text,
  p_expected_evidence_fingerprint text,
  p_assertion jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_event public.bookkeeping_documentation_events%rowtype;
  receipt_lost_id uuid;
  resolved_id uuid;
  current_evidence_fingerprint text;
begin
  if (select auth.uid()) is null then raise exception 'authentication required'; end if;
  if jsonb_typeof(p_assertion) <> 'object'
    or (select count(*) from jsonb_object_keys(p_assertion)) <> 2
    or p_assertion <> '{"schemaVersion":1,"assertion":"receipt_lost"}'::jsonb
  then raise exception 'only the exact Receipt Lost assertion is accepted'; end if;

  select * into current_event from public.bookkeeping_documentation_events
  where documentation_issue_id = p_documentation_issue_id
    and id = p_expected_current_event_id;
  if not found or not exists (
    select 1 from public.businesses
    where id = current_event.business_id and owner_user_id = (select auth.uid())
  ) then raise exception 'documentation request is unavailable to authenticated user'; end if;

  perform pg_advisory_xact_lock(
    hashtextextended(current_event.bookkeeping_record_id::text, 41)
  );
  select * into current_event from public.bookkeeping_documentation_events
  where documentation_issue_id = p_documentation_issue_id
    and id = p_expected_current_event_id for update;
  if not found or current_event.event_type not in ('request_opened', 'reopened')
    or exists (
      select 1 from public.bookkeeping_documentation_events
      where supersedes_event_id = current_event.id
    )
  then raise exception 'current documentation event changed'; end if;
  if current_event.reason <> 'MISSING_SUPPORTING_DOCUMENTATION'
    or current_event.context_fingerprint <> p_expected_context_fingerprint
    or current_event.evidence_fingerprint <> p_expected_evidence_fingerprint
    or current_event.question_context -> 'schemaVersion' <> '1'::jsonb
    or current_event.question_context ->> 'reason' <> current_event.reason
  then raise exception 'trusted documentation request context changed'; end if;
  current_evidence_fingerprint := public.current_bookkeeping_evidence_fingerprint(
    current_event.business_id, current_event.bookkeeping_record_id
  );
  if current_evidence_fingerprint <> current_event.evidence_fingerprint
  then raise exception 'canonical evidence changed; documentation request requires reevaluation'; end if;
  if exists (
    select 1 from public.bookkeeping_document_links
    where business_id = current_event.business_id
      and bookkeeping_record_id = current_event.bookkeeping_record_id
      and revoked_at is null
  ) then raise exception 'supporting documentation is already attached'; end if;

  insert into public.bookkeeping_documentation_events (
    business_id, bookkeeping_record_id, documentation_issue_id,
    supersedes_event_id, sequence_number, event_type, reason, issue_key,
    context_fingerprint, evidence_fingerprint, question_context,
    assertion_payload, provenance, actor_user_id
  ) values (
    current_event.business_id, current_event.bookkeeping_record_id,
    current_event.documentation_issue_id, current_event.id,
    current_event.sequence_number + 1, 'receipt_lost', current_event.reason,
    current_event.issue_key, current_event.context_fingerprint,
    current_event.evidence_fingerprint, current_event.question_context,
    p_assertion, 'user', (select auth.uid())
  ) returning id into receipt_lost_id;

  insert into public.bookkeeping_documentation_events (
    business_id, bookkeeping_record_id, documentation_issue_id,
    supersedes_event_id, sequence_number, event_type, reason, issue_key,
    context_fingerprint, evidence_fingerprint, question_context,
    provenance, actor_user_id
  ) values (
    current_event.business_id, current_event.bookkeeping_record_id,
    current_event.documentation_issue_id, receipt_lost_id,
    current_event.sequence_number + 2, 'resolved', current_event.reason,
    current_event.issue_key, current_event.context_fingerprint,
    current_event.evidence_fingerprint, current_event.question_context,
    'system', null
  ) returning id into resolved_id;

  return jsonb_build_object(
    'business_id', current_event.business_id,
    'receipt_lost_event_id', receipt_lost_id,
    'resolved_event_id', resolved_id
  );
end;
$$;

create or replace function public.reopen_bookkeeping_documentation_request(
  p_business_id uuid,
  p_documentation_issue_id uuid,
  p_expected_current_event_id uuid,
  p_context_fingerprint text,
  p_question_context jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_event public.bookkeeping_documentation_events%rowtype;
  current_evidence_fingerprint text;
  inserted_id uuid;
begin
  if (select auth.role()) <> 'service_role'
  then raise exception 'trusted documentation reopening required'; end if;
  if length(btrim(p_context_fingerprint)) not between 1 and 200
    or jsonb_typeof(p_question_context) <> 'object'
    or p_question_context -> 'schemaVersion' <> '1'::jsonb
    or p_question_context ->> 'reason' <> 'MISSING_SUPPORTING_DOCUMENTATION'
  then raise exception 'materially new documentation context is required'; end if;

  select * into current_event from public.bookkeeping_documentation_events
  where business_id = p_business_id
    and documentation_issue_id = p_documentation_issue_id
    and id = p_expected_current_event_id;
  if not found then raise exception 'current documentation event changed'; end if;
  perform pg_advisory_xact_lock(
    hashtextextended(current_event.bookkeeping_record_id::text, 41)
  );
  select * into current_event from public.bookkeeping_documentation_events
  where business_id = p_business_id
    and documentation_issue_id = p_documentation_issue_id
    and id = p_expected_current_event_id for update;
  if not found or current_event.event_type <> 'resolved'
    or exists (
      select 1 from public.bookkeeping_documentation_events
      where supersedes_event_id = current_event.id
    )
  then raise exception 'current documentation event changed'; end if;
  current_evidence_fingerprint := public.current_bookkeeping_evidence_fingerprint(
    current_event.business_id, current_event.bookkeeping_record_id
  );
  if btrim(p_context_fingerprint) = current_event.context_fingerprint
    or current_evidence_fingerprint = current_event.evidence_fingerprint
  then raise exception 'reopen requires materially new context and evidence'; end if;
  if exists (
    select 1 from public.bookkeeping_document_links
    where business_id = current_event.business_id
      and bookkeeping_record_id = current_event.bookkeeping_record_id
      and revoked_at is null
  ) then raise exception 'supporting documentation is currently attached'; end if;

  insert into public.bookkeeping_documentation_events (
    business_id, bookkeeping_record_id, documentation_issue_id,
    supersedes_event_id, sequence_number, event_type, reason, issue_key,
    context_fingerprint, evidence_fingerprint, question_context, provenance
  ) values (
    current_event.business_id, current_event.bookkeeping_record_id,
    current_event.documentation_issue_id, current_event.id,
    current_event.sequence_number + 1, 'reopened', current_event.reason,
    current_event.issue_key, btrim(p_context_fingerprint),
    current_evidence_fingerprint, p_question_context, 'automation'
  ) returning id into inserted_id;
  return inserted_id;
end;
$$;

create or replace function public.list_current_bookkeeping_documentation_requests(
  p_business_id uuid
)
returns setof public.bookkeeping_documentation_events
language sql
stable
set search_path = ''
as $$
  select events.*
  from public.bookkeeping_documentation_events events
  where events.business_id = p_business_id
    and events.event_type in ('request_opened', 'reopened')
    and not exists (
      select 1 from public.bookkeeping_documentation_events successors
      where successors.supersedes_event_id = events.id
    )
  order by events.created_at, events.id;
$$;

alter table public.bookkeeping_documentation_events enable row level security;
grant select on public.bookkeeping_documentation_events to authenticated, service_role;
grant insert on public.bookkeeping_documentation_events to service_role;

create policy "bookkeeping_documentation_events_select_own_business"
  on public.bookkeeping_documentation_events for select to authenticated
  using (exists (
    select 1 from public.businesses
    where businesses.id = bookkeeping_documentation_events.business_id
      and businesses.owner_user_id = (select auth.uid())
  ));

revoke execute on function public.open_bookkeeping_documentation_request(
  uuid, uuid, text, text, text, jsonb
) from public, anon, authenticated;
grant execute on function public.open_bookkeeping_documentation_request(
  uuid, uuid, text, text, text, jsonb
) to service_role;
revoke execute on function public.mark_bookkeeping_receipt_lost(
  uuid, uuid, text, text, jsonb
) from public, anon;
grant execute on function public.mark_bookkeeping_receipt_lost(
  uuid, uuid, text, text, jsonb
) to authenticated;
revoke execute on function public.reopen_bookkeeping_documentation_request(
  uuid, uuid, uuid, text, jsonb
) from public, anon, authenticated;
grant execute on function public.reopen_bookkeeping_documentation_request(
  uuid, uuid, uuid, text, jsonb
) to service_role;
revoke execute on function public.list_current_bookkeeping_documentation_requests(uuid)
  from public, anon;
grant execute on function public.list_current_bookkeeping_documentation_requests(uuid)
  to authenticated, service_role;

comment on function public.mark_bookkeeping_receipt_lost(uuid, uuid, text, text, jsonb)
is 'Atomically preserves an owned factual Receipt Lost assertion and resolves only its documentation request.';

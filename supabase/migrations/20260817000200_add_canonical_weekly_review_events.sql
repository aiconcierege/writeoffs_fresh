-- Typed, append-only Weekly Review issue history. Unresolved bookkeeping alone
-- does not create a review issue; only the five material-question reasons do.

create table public.bookkeeping_review_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  bookkeeping_record_id uuid not null,
  review_issue_id uuid not null,
  supersedes_event_id uuid,
  sequence_number integer not null,
  event_type text not null,
  reason text not null,
  based_on_decision_id uuid not null,
  issue_key text not null,
  context_fingerprint text not null,
  deferred_until timestamptz,
  provenance text not null,
  actor_user_id uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint bookkeeping_review_events_id_scope_unique
    unique (id, business_id, bookkeeping_record_id, review_issue_id),
  constraint bookkeeping_review_events_record_fkey
    foreign key (bookkeeping_record_id, business_id)
    references public.bookkeeping_records(id, business_id) on delete restrict,
  constraint bookkeeping_review_events_decision_fkey
    foreign key (based_on_decision_id, business_id, bookkeeping_record_id)
    references public.bookkeeping_decisions(id, business_id, bookkeeping_record_id)
    on delete restrict,
  constraint bookkeeping_review_events_predecessor_fkey
    foreign key (
      supersedes_event_id, business_id, bookkeeping_record_id, review_issue_id
    ) references public.bookkeeping_review_events (
      id, business_id, bookkeeping_record_id, review_issue_id
    ) on delete restrict,
  constraint bookkeeping_review_events_type_check check (
    event_type in ('opened', 'skipped', 'resolved', 'reopened')
  ),
  constraint bookkeeping_review_events_reason_check check (
    reason in (
      'BUSINESS_USE_UNCLEAR',
      'BUSINESS_PURPOSE_NEEDED',
      'MIXED_USE_CLARIFICATION',
      'TRANSACTION_TYPE_UNCLEAR',
      'CONFLICTING_EVIDENCE'
    )
  ),
  constraint bookkeeping_review_events_sequence_check check (sequence_number > 0),
  constraint bookkeeping_review_events_identity_text_check check (
    length(btrim(issue_key)) between 1 and 200
    and length(btrim(context_fingerprint)) between 1 and 200
  ),
  constraint bookkeeping_review_events_provenance_check check (
    provenance in ('automation', 'system', 'user')
  ),
  constraint bookkeeping_review_events_actor_check check (
    (provenance = 'user' and actor_user_id is not null)
    or (provenance <> 'user' and actor_user_id is null)
  ),
  constraint bookkeeping_review_events_defer_check check (
    (event_type = 'skipped') or deferred_until is null
  )
);

comment on table public.bookkeeping_review_events is
  'Append-only typed material-question history for canonical Weekly Review. It is independent from coarse bookkeeping decision review status.';

create unique index bookkeeping_review_events_one_successor_idx
  on public.bookkeeping_review_events (supersedes_event_id)
  where supersedes_event_id is not null;
create unique index bookkeeping_review_events_open_idempotency_idx
  on public.bookkeeping_review_events (
    business_id, bookkeeping_record_id, reason, issue_key
  ) where event_type = 'opened';
create unique index bookkeeping_review_events_material_context_idx
  on public.bookkeeping_review_events (review_issue_id, context_fingerprint)
  where event_type in ('opened', 'reopened');
create index bookkeeping_review_events_issue_sequence_idx
  on public.bookkeeping_review_events (review_issue_id, sequence_number);
create index bookkeeping_review_events_queue_idx
  on public.bookkeeping_review_events (business_id, created_at)
  where event_type in ('opened', 'skipped', 'reopened');

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
  ) then
    raise exception 'review event actor does not own the Business';
  end if;

  if new.supersedes_event_id is null then
    if new.event_type <> 'opened'
      or new.sequence_number <> 1
      or new.review_issue_id <> new.id
      or new.provenance not in ('automation', 'system')
      or new.deferred_until is not null
    then
      raise exception 'review issue must begin with one automated or system opened event';
    end if;
    return new;
  end if;

  select * into predecessor
  from public.bookkeeping_review_events
  where id = new.supersedes_event_id
    and business_id = new.business_id
    and bookkeeping_record_id = new.bookkeeping_record_id
    and review_issue_id = new.review_issue_id
  for update;
  if not found then raise exception 'review predecessor is unavailable'; end if;
  if exists (
    select 1 from public.bookkeeping_review_events
    where supersedes_event_id = predecessor.id
  ) then
    raise exception 'review correction must supersede the current event leaf';
  end if;
  if new.sequence_number <> predecessor.sequence_number + 1
    or new.reason <> predecessor.reason
    or new.issue_key <> predecessor.issue_key
  then
    raise exception 'review issue identity and ordering are immutable';
  end if;

  if new.event_type = 'skipped' then
    if predecessor.event_type not in ('opened', 'skipped', 'reopened')
      or new.provenance <> 'user'
    then raise exception 'only an outstanding issue may be skipped by its user'; end if;
    if new.context_fingerprint <> predecessor.context_fingerprint
      or new.based_on_decision_id <> predecessor.based_on_decision_id
    then raise exception 'skip cannot change review context'; end if;
  elsif new.event_type = 'resolved' then
    if predecessor.event_type not in ('opened', 'skipped', 'reopened')
      or new.provenance not in ('automation', 'system')
    then raise exception 'only an outstanding issue may be resolved by trusted processing'; end if;
    if new.context_fingerprint <> predecessor.context_fingerprint
      or new.based_on_decision_id <> predecessor.based_on_decision_id
    then raise exception 'resolution cannot change review context in this slice'; end if;
  elsif new.event_type = 'reopened' then
    if predecessor.event_type <> 'resolved'
      or new.provenance not in ('automation', 'system')
      or new.context_fingerprint = predecessor.context_fingerprint
    then raise exception 'reopen requires a resolved issue and materially new context'; end if;
  else
    raise exception 'only the first review event may be opened';
  end if;
  return new;
end;
$$;

create trigger bookkeeping_review_events_validate
before insert on public.bookkeeping_review_events
for each row execute function public.validate_bookkeeping_review_event();
create trigger bookkeeping_review_events_reject_update_delete
before update or delete on public.bookkeeping_review_events
for each row execute function public.reject_canonical_bookkeeping_mutation();

create or replace function public.open_bookkeeping_review_issue(
  p_business_id uuid,
  p_bookkeeping_record_id uuid,
  p_based_on_decision_id uuid,
  p_reason text,
  p_issue_key text,
  p_context_fingerprint text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  issue_uuid uuid := gen_random_uuid();
  selected_event_id uuid;
begin
  if p_reason not in (
    'BUSINESS_USE_UNCLEAR', 'BUSINESS_PURPOSE_NEEDED',
    'MIXED_USE_CLARIFICATION', 'TRANSACTION_TYPE_UNCLEAR',
    'CONFLICTING_EVIDENCE'
  ) then raise exception 'unsupported Weekly Review reason'; end if;
  if length(btrim(p_issue_key)) not between 1 and 200
    or length(btrim(p_context_fingerprint)) not between 1 and 200
  then raise exception 'review issue identity is required'; end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      p_business_id::text || ':' || p_bookkeeping_record_id::text || ':' ||
      p_reason || ':' || p_issue_key,
      0
    )
  );
  insert into public.bookkeeping_review_events (
    id, business_id, bookkeeping_record_id, review_issue_id,
    supersedes_event_id, sequence_number, event_type, reason,
    based_on_decision_id, issue_key, context_fingerprint,
    provenance, actor_user_id
  ) values (
    issue_uuid, p_business_id, p_bookkeeping_record_id, issue_uuid,
    null, 1, 'opened', p_reason,
    p_based_on_decision_id, btrim(p_issue_key), btrim(p_context_fingerprint),
    'automation', null
  ) on conflict (business_id, bookkeeping_record_id, reason, issue_key)
    where event_type = 'opened' do nothing
  returning id into selected_event_id;

  if selected_event_id is null then
    select events.id into selected_event_id
    from public.bookkeeping_review_events as events
    where events.business_id = p_business_id
      and events.bookkeeping_record_id = p_bookkeeping_record_id
      and events.reason = p_reason
      and events.issue_key = btrim(p_issue_key)
      and not exists (
        select 1 from public.bookkeeping_review_events as successors
        where successors.supersedes_event_id = events.id
      );
  end if;
  return selected_event_id;
end;
$$;

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
    context_fingerprint, deferred_until, provenance, actor_user_id
  ) values (
    current_event.business_id, current_event.bookkeeping_record_id,
    current_event.review_issue_id, current_event.id,
    current_event.sequence_number + 1, 'skipped', current_event.reason,
    current_event.based_on_decision_id, current_event.issue_key,
    current_event.context_fingerprint, p_deferred_until, 'user', (select auth.uid())
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
    context_fingerprint, provenance, actor_user_id
  ) values (
    current_event.business_id, current_event.bookkeeping_record_id,
    current_event.review_issue_id, current_event.id,
    current_event.sequence_number + 1, 'resolved', current_event.reason,
    current_event.based_on_decision_id, current_event.issue_key,
    current_event.context_fingerprint, 'system', null
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
begin
  if length(btrim(p_context_fingerprint)) not between 1 and 200
  then raise exception 'materially new context fingerprint is required'; end if;
  select * into current_event from public.bookkeeping_review_events
  where business_id = p_business_id and review_issue_id = p_review_issue_id
    and id = p_expected_current_event_id for update;
  if not found then raise exception 'current review event changed'; end if;
  insert into public.bookkeeping_review_events (
    business_id, bookkeeping_record_id, review_issue_id, supersedes_event_id,
    sequence_number, event_type, reason, based_on_decision_id, issue_key,
    context_fingerprint, provenance, actor_user_id
  ) values (
    current_event.business_id, current_event.bookkeeping_record_id,
    current_event.review_issue_id, current_event.id,
    current_event.sequence_number + 1, 'reopened', current_event.reason,
    p_based_on_decision_id, current_event.issue_key,
    btrim(p_context_fingerprint), 'automation', null
  ) returning id into inserted_id;
  return inserted_id;
end;
$$;

create or replace function public.list_current_bookkeeping_review_issues(
  p_business_id uuid,
  p_as_of timestamptz default now()
)
returns setof public.bookkeeping_review_events
language sql
stable
set search_path = ''
as $$
  select events.*
  from public.bookkeeping_review_events as events
  where events.business_id = p_business_id
    and not exists (
      select 1 from public.bookkeeping_review_events as successors
      where successors.supersedes_event_id = events.id
    )
    and (
      events.event_type in ('opened', 'reopened')
      or (
        events.event_type = 'skipped'
        and (events.deferred_until is null or events.deferred_until <= p_as_of)
      )
    )
  order by events.created_at, events.id;
$$;

alter table public.bookkeeping_review_events enable row level security;
grant select on public.bookkeeping_review_events to authenticated, service_role;
grant insert on public.bookkeeping_review_events to service_role;

create policy "bookkeeping_review_events_select_own_business"
  on public.bookkeeping_review_events for select to authenticated
  using (exists (
    select 1 from public.businesses
    where businesses.id = bookkeeping_review_events.business_id
      and businesses.owner_user_id = (select auth.uid())
  ));

revoke execute on function public.open_bookkeeping_review_issue(uuid, uuid, uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.open_bookkeeping_review_issue(uuid, uuid, uuid, text, text, text)
  to service_role;
revoke execute on function public.resolve_bookkeeping_review_issue(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.resolve_bookkeeping_review_issue(uuid, uuid, uuid)
  to service_role;
revoke execute on function public.reopen_bookkeeping_review_issue(uuid, uuid, uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.reopen_bookkeeping_review_issue(uuid, uuid, uuid, uuid, text)
  to service_role;
revoke execute on function public.skip_bookkeeping_review_issue(uuid, uuid, uuid, timestamptz)
  from public, anon;
grant execute on function public.skip_bookkeeping_review_issue(uuid, uuid, uuid, timestamptz)
  to authenticated;
revoke execute on function public.list_current_bookkeeping_review_issues(uuid, timestamptz)
  from public, anon;
grant execute on function public.list_current_bookkeeping_review_issues(uuid, timestamptz)
  to authenticated, service_role;

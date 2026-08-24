-- Business-owned canonical mileage facts. The legacy unowned mileage_trips table
-- remains locked and is never read or written by this system.

create unique index business_vehicles_id_business_unique on public.business_vehicles(id,business_id);
grant select,insert,update on public.business_vehicles to authenticated;

create table public.canonical_mileage_entries (
  id uuid primary key,
  business_id uuid not null references public.businesses(id) on delete restrict,
  vehicle_id uuid not null,
  original_miles_milli bigint not null,
  original_occurred_on date not null,
  original_job_label text,
  original_destination text,
  original_business_purpose text,
  creation_request_key text not null,
  provenance text not null default 'user',
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint canonical_mileage_entry_scope_unique unique (id,business_id),
  constraint canonical_mileage_vehicle_fkey foreign key (vehicle_id,business_id)
    references public.business_vehicles(id,business_id) on delete restrict,
  constraint canonical_mileage_request_unique unique (business_id,creation_request_key),
  constraint canonical_mileage_positive_check check (original_miles_milli > 0),
  constraint canonical_mileage_text_check check (
    length(creation_request_key) between 1 and 160
    and (original_job_label is null or length(original_job_label) between 1 and 200)
    and (original_destination is null or length(original_destination) between 1 and 500)
    and (original_business_purpose is null or length(original_business_purpose) between 1 and 1000)
  ),
  constraint canonical_mileage_provenance_check check (provenance='user')
);

create table public.canonical_mileage_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  mileage_entry_id uuid not null,
  supersedes_event_id uuid,
  sequence_number integer not null,
  event_type text not null,
  miles_milli bigint not null,
  occurred_on date not null,
  vehicle_id uuid not null,
  job_label text,
  destination text,
  business_purpose text,
  request_key text not null,
  reason text,
  provenance text not null default 'user',
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint canonical_mileage_event_entry_fkey foreign key (mileage_entry_id,business_id)
    references public.canonical_mileage_entries(id,business_id) on delete restrict,
  constraint canonical_mileage_event_vehicle_fkey foreign key (vehicle_id,business_id)
    references public.business_vehicles(id,business_id) on delete restrict,
  constraint canonical_mileage_event_predecessor_fkey foreign key (supersedes_event_id)
    references public.canonical_mileage_events(id) on delete restrict,
  constraint canonical_mileage_event_request_unique unique (business_id,request_key),
  constraint canonical_mileage_event_sequence_unique unique (mileage_entry_id,sequence_number),
  constraint canonical_mileage_event_leaf_unique unique (supersedes_event_id),
  constraint canonical_mileage_event_type_check check (event_type in ('recorded','corrected','voided')),
  constraint canonical_mileage_event_shape_check check (
    (event_type='recorded' and supersedes_event_id is null and sequence_number=1 and reason is null)
    or (event_type in ('corrected','voided') and supersedes_event_id is not null and sequence_number>1
      and reason is not null and length(reason) between 1 and 1000)
  ),
  constraint canonical_mileage_event_values_check check (
    miles_milli > 0 and length(request_key) between 1 and 160
    and (job_label is null or length(job_label) between 1 and 200)
    and (destination is null or length(destination) between 1 and 500)
    and (business_purpose is null or length(business_purpose) between 1 and 1000)
  ),
  constraint canonical_mileage_event_provenance_check check (provenance='user')
);

create index canonical_mileage_entries_business_date_idx
  on public.canonical_mileage_entries(business_id,original_occurred_on,id);
create index canonical_mileage_events_entry_idx
  on public.canonical_mileage_events(business_id,mileage_entry_id,sequence_number);

alter table public.canonical_mileage_entries enable row level security;
alter table public.canonical_mileage_events enable row level security;
grant select on public.canonical_mileage_entries,public.canonical_mileage_events to authenticated;
create policy canonical_mileage_entries_select_own on public.canonical_mileage_entries for select to authenticated
  using (exists(select 1 from public.businesses b where b.id=business_id and b.owner_user_id=(select auth.uid())));
create policy canonical_mileage_events_select_own on public.canonical_mileage_events for select to authenticated
  using (exists(select 1 from public.businesses b where b.id=business_id and b.owner_user_id=(select auth.uid())));
revoke insert,update,delete on public.canonical_mileage_entries from anon,authenticated;
revoke insert,update,delete on public.canonical_mileage_events from anon,authenticated;

create or replace function public.prevent_canonical_mileage_mutation() returns trigger
language plpgsql set search_path='' as $$
begin raise exception 'canonical mileage history is append-only'; end $$;

create trigger canonical_mileage_entries_append_only before update or delete on public.canonical_mileage_entries
for each row execute function public.prevent_canonical_mileage_mutation();
create trigger canonical_mileage_events_append_only before update or delete on public.canonical_mileage_events
for each row execute function public.prevent_canonical_mileage_mutation();

create view public.current_canonical_mileage_entries with (security_invoker=true) as
select entry.id,entry.business_id,event.id as current_event_id,event.event_type,event.miles_milli,
  event.occurred_on,event.vehicle_id,event.job_label,event.destination,event.business_purpose,
  event.created_at as last_changed_at,entry.created_at
from public.canonical_mileage_entries entry
join public.canonical_mileage_events event on event.mileage_entry_id=entry.id and event.business_id=entry.business_id
where not exists(select 1 from public.canonical_mileage_events successor where successor.supersedes_event_id=event.id)
  and event.event_type<>'voided';
grant select on public.current_canonical_mileage_entries to authenticated;

create or replace function public.validate_canonical_mileage_event() returns trigger
language plpgsql set search_path='' as $$
declare predecessor public.canonical_mileage_events%rowtype;
begin
  if not exists(select 1 from public.businesses b where b.id=new.business_id and b.owner_user_id=new.actor_user_id)
  then raise exception 'mileage actor does not own Business'; end if;
  if new.supersedes_event_id is not null then
    select * into predecessor from public.canonical_mileage_events where id=new.supersedes_event_id for update;
    if not found or predecessor.business_id<>new.business_id or predecessor.mileage_entry_id<>new.mileage_entry_id
      or predecessor.sequence_number+1<>new.sequence_number
    then raise exception 'mileage predecessor is invalid'; end if;
    if exists(select 1 from public.canonical_mileage_events e where e.supersedes_event_id=predecessor.id)
    then raise exception 'mileage correction must supersede the current leaf'; end if;
    if predecessor.event_type='voided' then raise exception 'voided mileage is immutable'; end if;
  end if;
  return new;
end $$;
create trigger canonical_mileage_event_validate before insert on public.canonical_mileage_events
for each row execute function public.validate_canonical_mileage_event();

create or replace function public.record_canonical_mileage(
  p_id uuid,p_vehicle_id uuid,p_miles_milli bigint,p_occurred_on date,p_job_label text,
  p_destination text,p_business_purpose text,p_request_key text
) returns uuid language plpgsql security definer set search_path='' as $$
declare selected_business_id uuid; selected_id uuid; existing public.canonical_mileage_entries%rowtype;
  actor uuid := (select auth.uid());
begin
  if actor is null then raise exception 'authentication required'; end if;
  select v.business_id into selected_business_id from public.business_vehicles v join public.businesses b on b.id=v.business_id
    where v.id=p_vehicle_id and b.owner_user_id=actor and v.archived_at is null;
  if selected_business_id is null then raise exception 'active vehicle unavailable'; end if;
  if p_id is null or p_miles_milli<=0 or p_occurred_on is null or p_occurred_on>current_date
    or length(btrim(coalesce(p_request_key,''))) not between 1 and 160
  then raise exception 'valid mileage facts are required'; end if;
  insert into public.canonical_mileage_entries(id,business_id,vehicle_id,original_miles_milli,original_occurred_on,
    original_job_label,original_destination,original_business_purpose,creation_request_key,actor_user_id)
  values(p_id,selected_business_id,p_vehicle_id,p_miles_milli,p_occurred_on,nullif(btrim(p_job_label),''),
    nullif(btrim(p_destination),''),nullif(btrim(p_business_purpose),''),btrim(p_request_key),actor)
  on conflict (business_id,creation_request_key) do nothing returning id into selected_id;
  if selected_id is null then
    select * into existing from public.canonical_mileage_entries
      where business_id=selected_business_id and creation_request_key=btrim(p_request_key);
    if existing.vehicle_id<>p_vehicle_id or existing.original_miles_milli<>p_miles_milli
      or existing.original_occurred_on<>p_occurred_on
      or existing.original_job_label is distinct from nullif(btrim(p_job_label),'')
      or existing.original_destination is distinct from nullif(btrim(p_destination),'')
      or existing.original_business_purpose is distinct from nullif(btrim(p_business_purpose),'')
    then raise exception 'mileage request identity was reused with different facts'; end if;
    return existing.id;
  end if;
  insert into public.canonical_mileage_events(business_id,mileage_entry_id,sequence_number,event_type,miles_milli,
    occurred_on,vehicle_id,job_label,destination,business_purpose,request_key,actor_user_id)
  values(selected_business_id,selected_id,1,'recorded',p_miles_milli,p_occurred_on,p_vehicle_id,
    nullif(btrim(p_job_label),''),nullif(btrim(p_destination),''),nullif(btrim(p_business_purpose),''),
    concat('record:',btrim(p_request_key)),actor);
  return selected_id;
end $$;

create or replace function public.correct_canonical_mileage(
  p_mileage_entry_id uuid,p_expected_event_id uuid,p_vehicle_id uuid,p_miles_milli bigint,p_occurred_on date,
  p_job_label text,p_destination text,p_business_purpose text,p_request_key text,p_reason text
) returns uuid language plpgsql security definer set search_path='' as $$
declare selected_business_id uuid; current_event public.canonical_mileage_events%rowtype; next_id uuid;
  actor uuid := (select auth.uid());
begin
  if actor is null then raise exception 'authentication required'; end if;
  select e.business_id into selected_business_id from public.canonical_mileage_entries e join public.businesses b on b.id=e.business_id
    where e.id=p_mileage_entry_id and b.owner_user_id=actor;
  if selected_business_id is null then raise exception 'mileage unavailable'; end if;
  if not exists(select 1 from public.business_vehicles where id=p_vehicle_id and business_id=selected_business_id)
    or p_miles_milli<=0 or p_occurred_on is null or p_occurred_on>current_date
    or length(btrim(coalesce(p_request_key,''))) not between 1 and 160
    or length(btrim(coalesce(p_reason,''))) not between 1 and 1000
  then raise exception 'valid correction facts are required'; end if;
  select id into next_id from public.canonical_mileage_events
    where business_id=selected_business_id and request_key=btrim(p_request_key);
  if next_id is not null then return next_id; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_mileage_entry_id::text,67));
  select * into current_event from public.canonical_mileage_events e where e.id=p_expected_event_id
    and e.business_id=selected_business_id and e.mileage_entry_id=p_mileage_entry_id
    and not exists(select 1 from public.canonical_mileage_events s where s.supersedes_event_id=e.id) for update;
  if not found then raise exception 'mileage changed; reload before correcting'; end if;
  insert into public.canonical_mileage_events(business_id,mileage_entry_id,supersedes_event_id,sequence_number,event_type,
    miles_milli,occurred_on,vehicle_id,job_label,destination,business_purpose,request_key,reason,actor_user_id)
  values(selected_business_id,p_mileage_entry_id,current_event.id,current_event.sequence_number+1,'corrected',p_miles_milli,
    p_occurred_on,p_vehicle_id,nullif(btrim(p_job_label),''),nullif(btrim(p_destination),''),
    nullif(btrim(p_business_purpose),''),btrim(p_request_key),btrim(p_reason),actor)
  on conflict (business_id,request_key) do nothing returning id into next_id;
  if next_id is null then select id into next_id from public.canonical_mileage_events
    where business_id=selected_business_id and request_key=btrim(p_request_key); end if;
  return next_id;
end $$;

create or replace function public.void_canonical_mileage(
  p_mileage_entry_id uuid,p_expected_event_id uuid,p_request_key text,p_reason text
) returns uuid language plpgsql security definer set search_path='' as $$
declare selected_business_id uuid; current_event public.canonical_mileage_events%rowtype; next_id uuid;
  actor uuid := (select auth.uid());
begin
  if actor is null then raise exception 'authentication required'; end if;
  select e.business_id into selected_business_id from public.canonical_mileage_entries e join public.businesses b on b.id=e.business_id
    where e.id=p_mileage_entry_id and b.owner_user_id=actor;
  if selected_business_id is null then raise exception 'mileage unavailable'; end if;
  if length(btrim(coalesce(p_request_key,''))) not between 1 and 160
  or length(btrim(coalesce(p_reason,''))) not between 1 and 1000 then raise exception 'void reason is required'; end if;
  select id into next_id from public.canonical_mileage_events
    where business_id=selected_business_id and request_key=btrim(p_request_key);
  if next_id is not null then return next_id; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_mileage_entry_id::text,67));
  select * into current_event from public.canonical_mileage_events e where e.id=p_expected_event_id
    and e.business_id=selected_business_id and e.mileage_entry_id=p_mileage_entry_id
    and not exists(select 1 from public.canonical_mileage_events s where s.supersedes_event_id=e.id) for update;
  if not found then raise exception 'mileage changed; reload before removing'; end if;
  insert into public.canonical_mileage_events(business_id,mileage_entry_id,supersedes_event_id,sequence_number,event_type,
    miles_milli,occurred_on,vehicle_id,job_label,destination,business_purpose,request_key,reason,actor_user_id)
  values(selected_business_id,p_mileage_entry_id,current_event.id,current_event.sequence_number+1,'voided',current_event.miles_milli,
    current_event.occurred_on,current_event.vehicle_id,current_event.job_label,current_event.destination,
    current_event.business_purpose,btrim(p_request_key),btrim(p_reason),actor) returning id into next_id;
  return next_id;
end $$;

revoke execute on function public.record_canonical_mileage(uuid,uuid,bigint,date,text,text,text,text) from public,anon;
revoke execute on function public.correct_canonical_mileage(uuid,uuid,uuid,bigint,date,text,text,text,text,text) from public,anon;
revoke execute on function public.void_canonical_mileage(uuid,uuid,text,text) from public,anon;
grant execute on function public.record_canonical_mileage(uuid,uuid,bigint,date,text,text,text,text) to authenticated;
grant execute on function public.correct_canonical_mileage(uuid,uuid,uuid,bigint,date,text,text,text,text,text) to authenticated;
grant execute on function public.void_canonical_mileage(uuid,uuid,text,text) to authenticated;

comment on table public.canonical_mileage_entries is 'Immutable Business-owned mileage source facts; never the legacy mileage_trips table.';
comment on view public.current_canonical_mileage_entries is 'Current non-voided mileage facts resolved from append-only event leaves.';

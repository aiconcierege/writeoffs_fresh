-- Business-owned membership authority. Stripe is a provider, never the entitlement model.

create table public.business_memberships (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null unique references public.businesses(id) on delete restrict,
  plan text not null,
  lifecycle text not null,
  authority text not null,
  access_through timestamptz,
  grace_through timestamptz,
  scheduled_plan text,
  scheduled_effective_at timestamptz,
  cancel_at_period_end boolean not null default false,
  last_provider_event_created_at timestamptz,
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint membership_plan_check check(plan in ('expenses','business')),
  constraint membership_lifecycle_check check(lifecycle in ('active','payment_issue','canceling','expired_read_only')),
  constraint membership_authority_check check(authority in ('stripe','grant')),
  constraint membership_scheduled_plan_check check(scheduled_plan is null or scheduled_plan in ('expenses','business')),
  constraint membership_schedule_pair_check check((scheduled_plan is null)=(scheduled_effective_at is null)),
  constraint membership_grace_check check(grace_through is null or lifecycle='payment_issue'),
  constraint membership_id_business_unique unique(id,business_id)
);

create table public.membership_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  membership_id uuid not null,
  event_type text not null,
  plan text not null,
  lifecycle text not null,
  access_through timestamptz,
  grace_through timestamptz,
  scheduled_plan text,
  scheduled_effective_at timestamptz,
  provenance text not null,
  actor_user_id uuid references auth.users(id) on delete restrict,
  request_key text not null,
  provider_event_id text,
  provider_event_created_at timestamptz,
  created_at timestamptz not null default now(),
  constraint membership_event_parent_fkey foreign key(membership_id,business_id) references public.business_memberships(id,business_id) on delete restrict,
  constraint membership_event_type_check check(event_type in ('grant_created','activated','plan_upgraded','downgrade_scheduled','downgrade_applied','downgrade_canceled','cancellation_requested','cancellation_reversed','payment_failed','payment_recovered','expired','restarted','provider_synced')),
  constraint membership_event_plan_check check(plan in ('expenses','business')),
  constraint membership_event_lifecycle_check check(lifecycle in ('active','payment_issue','canceling','expired_read_only')),
  constraint membership_event_provenance_check check(provenance in ('stripe','admin','system')),
  constraint membership_event_request_unique unique(business_id,request_key),
  constraint membership_event_provider_unique unique(provider_event_id)
);

create table public.membership_provider_links (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null unique references public.businesses(id) on delete restrict,
  provider text not null default 'stripe',
  provider_customer_id text not null unique,
  provider_subscription_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint membership_provider_check check(provider='stripe'),
  constraint membership_provider_ids_check check(length(provider_customer_id) between 3 and 255 and (provider_subscription_id is null or length(provider_subscription_id) between 3 and 255))
);

create table public.membership_grants (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  membership_id uuid not null,
  plan text not null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  provenance text not null,
  actor_user_id uuid references auth.users(id) on delete restrict,
  request_key text not null,
  reason text not null,
  created_at timestamptz not null default now(),
  constraint membership_grant_parent_fkey foreign key(membership_id,business_id) references public.business_memberships(id,business_id) on delete restrict,
  constraint membership_grant_plan_check check(plan in ('expenses','business')),
  constraint membership_grant_provenance_check check(provenance in ('admin','local_setup')),
  constraint membership_grant_dates_check check(ends_at is null or ends_at>starts_at),
  constraint membership_grant_request_unique unique(business_id,request_key)
);

create table public.stripe_membership_webhook_events (
  stripe_event_id text primary key,
  event_type text not null,
  provider_created_at timestamptz not null,
  business_id uuid references public.businesses(id) on delete restrict,
  application_status text not null,
  result_code text,
  received_at timestamptz not null default now(),
  applied_at timestamptz,
  constraint stripe_webhook_status_check check(application_status in ('received','applied','duplicate','stale','retryable','ignored')),
  constraint stripe_webhook_safe_code_check check(result_code is null or result_code~'^[A-Z0-9_]{1,100}$')
);

alter table public.business_memberships enable row level security;
alter table public.membership_events enable row level security;
alter table public.membership_provider_links enable row level security;
alter table public.membership_grants enable row level security;
alter table public.stripe_membership_webhook_events enable row level security;

create policy memberships_select_own on public.business_memberships for select to authenticated using
  (exists(select 1 from public.businesses where businesses.id=business_memberships.business_id and businesses.owner_user_id=(select auth.uid())));
create policy membership_events_select_own on public.membership_events for select to authenticated using
  (exists(select 1 from public.businesses where businesses.id=membership_events.business_id and businesses.owner_user_id=(select auth.uid())));
create policy membership_grants_select_own on public.membership_grants for select to authenticated using
  (exists(select 1 from public.businesses where businesses.id=membership_grants.business_id and businesses.owner_user_id=(select auth.uid())));

revoke all on public.business_memberships,public.membership_events,public.membership_provider_links,public.membership_grants,public.stripe_membership_webhook_events from public,anon,authenticated;
grant select on public.business_memberships,public.membership_events,public.membership_grants to authenticated;
grant all on public.business_memberships,public.membership_events,public.membership_provider_links,public.membership_grants,public.stripe_membership_webhook_events to service_role;

create view public.current_customer_membership with(security_barrier=true,security_invoker=true) as
select membership.id,membership.business_id,membership.plan,membership.lifecycle,membership.authority,membership.access_through,
  membership.grace_through,membership.scheduled_plan,membership.scheduled_effective_at,membership.cancel_at_period_end,membership.version,membership.updated_at
from public.business_memberships membership join public.businesses business on business.id=membership.business_id
where business.owner_user_id=(select auth.uid());
grant select on public.current_customer_membership to authenticated;

create or replace function public.reject_membership_history_mutation() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'membership history is append-only';end $$;
create trigger membership_events_immutable before update or delete on public.membership_events for each row execute function public.reject_membership_history_mutation();
create trigger membership_grants_immutable before update or delete on public.membership_grants for each row execute function public.reject_membership_history_mutation();
create trigger stripe_membership_events_no_delete before delete on public.stripe_membership_webhook_events for each row execute function public.reject_membership_history_mutation();

create or replace function public.create_business_membership_grant(
  p_business_id uuid,p_plan text,p_starts_at timestamptz,p_ends_at timestamptz,p_request_key text,p_reason text,p_provenance text default 'admin',p_actor_user_id uuid default null
) returns uuid language plpgsql security definer set search_path='' as $$
declare selected_membership_id uuid;selected_grant_id uuid;now_at timestamptz:=now();selected_lifecycle text;selected_access timestamptz;
begin
  if p_plan not in('expenses','business') or p_provenance not in('admin','local_setup') or length(btrim(coalesce(p_request_key,''))) not between 1 and 200
    or length(btrim(coalesce(p_reason,''))) not between 1 and 500 or p_starts_at is null or (p_ends_at is not null and p_ends_at<=p_starts_at)
    or not exists(select 1 from public.businesses where id=p_business_id) then raise exception 'membership grant is invalid';end if;
  select id into selected_grant_id from public.membership_grants where business_id=p_business_id and request_key=btrim(p_request_key);
  if selected_grant_id is not null then return selected_grant_id;end if;
  selected_lifecycle:=case when p_starts_at<=now_at and (p_ends_at is null or p_ends_at>now_at) then 'active' else 'expired_read_only' end;
  selected_access:=p_ends_at;
  insert into public.business_memberships(business_id,plan,lifecycle,authority,access_through)
    values(p_business_id,p_plan,selected_lifecycle,'grant',selected_access)
    on conflict(business_id) do update set plan=excluded.plan,lifecycle=excluded.lifecycle,authority='grant',access_through=excluded.access_through,
      grace_through=null,scheduled_plan=null,scheduled_effective_at=null,cancel_at_period_end=false,version=public.business_memberships.version+1,updated_at=now()
    returning id into selected_membership_id;
  insert into public.membership_grants(business_id,membership_id,plan,starts_at,ends_at,provenance,actor_user_id,request_key,reason)
    values(p_business_id,selected_membership_id,p_plan,p_starts_at,p_ends_at,p_provenance,p_actor_user_id,btrim(p_request_key),btrim(p_reason)) returning id into selected_grant_id;
  insert into public.membership_events(business_id,membership_id,event_type,plan,lifecycle,access_through,provenance,actor_user_id,request_key)
    values(p_business_id,selected_membership_id,'grant_created',p_plan,selected_lifecycle,selected_access,'admin',p_actor_user_id,'grant-event:'||btrim(p_request_key));
  return selected_grant_id;
end $$;

create or replace function public.apply_stripe_membership_event(
  p_stripe_event_id text,p_event_type text,p_provider_created_at timestamptz,p_business_id uuid,p_customer_id text,p_subscription_id text,
  p_plan text,p_lifecycle text,p_access_through timestamptz,p_grace_through timestamptz,p_cancel_at_period_end boolean,
  p_scheduled_plan text,p_scheduled_effective_at timestamptz,p_membership_event_type text
) returns text language plpgsql security definer set search_path='' as $$
declare membership public.business_memberships%rowtype;request_identity text:='stripe:'||p_stripe_event_id;
begin
  if length(coalesce(p_stripe_event_id,'')) not between 3 and 255 or p_plan not in('expenses','business')
    or p_lifecycle not in('active','payment_issue','canceling','expired_read_only') or p_membership_event_type not in
    ('activated','plan_upgraded','downgrade_scheduled','downgrade_applied','downgrade_canceled','cancellation_requested','cancellation_reversed','payment_failed','payment_recovered','expired','restarted','provider_synced')
    or not exists(select 1 from public.businesses where id=p_business_id) then raise exception 'stripe membership event is invalid';end if;
  insert into public.stripe_membership_webhook_events(stripe_event_id,event_type,provider_created_at,business_id,application_status)
    values(p_stripe_event_id,p_event_type,p_provider_created_at,p_business_id,'received') on conflict do nothing;
  if not found then return 'duplicate';end if;
  select * into membership from public.business_memberships where business_id=p_business_id for update;
  if found and membership.last_provider_event_created_at is not null and p_provider_created_at<membership.last_provider_event_created_at then
    update public.stripe_membership_webhook_events set application_status='stale',result_code='STALE_PROVIDER_EVENT' where stripe_event_id=p_stripe_event_id;return 'stale';end if;
  insert into public.membership_provider_links(business_id,provider_customer_id,provider_subscription_id)
    values(p_business_id,p_customer_id,p_subscription_id) on conflict(business_id) do update set
      provider_customer_id=excluded.provider_customer_id,provider_subscription_id=coalesce(excluded.provider_subscription_id,public.membership_provider_links.provider_subscription_id),updated_at=now();
  insert into public.business_memberships(business_id,plan,lifecycle,authority,access_through,grace_through,scheduled_plan,scheduled_effective_at,cancel_at_period_end,last_provider_event_created_at)
    values(p_business_id,p_plan,p_lifecycle,'stripe',p_access_through,p_grace_through,p_scheduled_plan,p_scheduled_effective_at,coalesce(p_cancel_at_period_end,false),p_provider_created_at)
    on conflict(business_id) do update set plan=excluded.plan,lifecycle=excluded.lifecycle,authority='stripe',access_through=excluded.access_through,
      grace_through=excluded.grace_through,scheduled_plan=excluded.scheduled_plan,scheduled_effective_at=excluded.scheduled_effective_at,
      cancel_at_period_end=excluded.cancel_at_period_end,last_provider_event_created_at=excluded.last_provider_event_created_at,
      version=public.business_memberships.version+1,updated_at=now() returning * into membership;
  insert into public.membership_events(business_id,membership_id,event_type,plan,lifecycle,access_through,grace_through,scheduled_plan,scheduled_effective_at,provenance,request_key,provider_event_id,provider_event_created_at)
    values(p_business_id,membership.id,p_membership_event_type,p_plan,p_lifecycle,p_access_through,p_grace_through,p_scheduled_plan,p_scheduled_effective_at,'stripe',request_identity,p_stripe_event_id,p_provider_created_at);
  update public.stripe_membership_webhook_events set application_status='applied',applied_at=now(),result_code='APPLIED' where stripe_event_id=p_stripe_event_id;
  return 'applied';
exception when others then
  update public.stripe_membership_webhook_events set application_status='retryable',result_code='APPLICATION_FAILED' where stripe_event_id=p_stripe_event_id;
  raise;
end $$;

create or replace function public.record_confirmed_membership_intent(
  p_business_id uuid,p_actor_user_id uuid,p_request_key text,p_event_type text,p_lifecycle text,p_scheduled_plan text,p_scheduled_effective_at timestamptz,p_cancel_at_period_end boolean
) returns boolean language plpgsql security definer set search_path='' as $$
declare membership public.business_memberships%rowtype;
begin
  if not exists(select 1 from public.businesses where id=p_business_id and owner_user_id=p_actor_user_id)
    or length(btrim(coalesce(p_request_key,''))) not between 8 and 200
    or p_event_type not in('downgrade_scheduled','downgrade_canceled','cancellation_requested','cancellation_reversed')
    or p_lifecycle not in('active','canceling') or (p_scheduled_plan is not null and p_scheduled_plan not in('expenses','business'))
    then raise exception 'membership intent is invalid';end if;
  if exists(select 1 from public.membership_events where business_id=p_business_id and request_key=btrim(p_request_key))then return true;end if;
  select * into membership from public.business_memberships where business_id=p_business_id for update;
  if not found or membership.authority<>'stripe' then raise exception 'stripe membership unavailable';end if;
  update public.business_memberships set lifecycle=p_lifecycle,grace_through=null,scheduled_plan=p_scheduled_plan,scheduled_effective_at=p_scheduled_effective_at,
    cancel_at_period_end=coalesce(p_cancel_at_period_end,false),version=version+1,updated_at=now() where id=membership.id returning * into membership;
  insert into public.membership_events(business_id,membership_id,event_type,plan,lifecycle,access_through,grace_through,scheduled_plan,scheduled_effective_at,provenance,actor_user_id,request_key)
    values(p_business_id,membership.id,p_event_type,membership.plan,membership.lifecycle,membership.access_through,membership.grace_through,membership.scheduled_plan,
      membership.scheduled_effective_at,'system',p_actor_user_id,btrim(p_request_key));return true;
end $$;

revoke execute on function public.create_business_membership_grant(uuid,text,timestamptz,timestamptz,text,text,text,uuid),
  public.apply_stripe_membership_event(text,text,timestamptz,uuid,text,text,text,text,timestamptz,timestamptz,boolean,text,timestamptz,text),
  public.record_confirmed_membership_intent(uuid,uuid,text,text,text,text,timestamptz,boolean) from public,anon,authenticated;
grant execute on function public.create_business_membership_grant(uuid,text,timestamptz,timestamptz,text,text,text,uuid),
  public.apply_stripe_membership_event(text,text,timestamptz,uuid,text,text,text,text,timestamptz,timestamptz,boolean,text,timestamptz,text),
  public.record_confirmed_membership_intent(uuid,uuid,text,text,text,text,timestamptz,boolean) to service_role;

create or replace function public.expire_elapsed_business_memberships(p_now timestamptz default now()) returns integer language plpgsql security definer set search_path='' as $$
declare affected integer;
begin
  with eligible as(select distinct on(grant_row.business_id) grant_row.business_id,grant_row.plan,grant_row.ends_at
      from public.membership_grants grant_row where grant_row.starts_at<=p_now and (grant_row.ends_at is null or grant_row.ends_at>p_now)
      order by grant_row.business_id,grant_row.created_at desc),activated as(
    update public.business_memberships membership set plan=eligible.plan,lifecycle='active',access_through=eligible.ends_at,version=version+1,updated_at=p_now
      from eligible where membership.business_id=eligible.business_id and membership.authority='grant' and membership.lifecycle='expired_read_only' returning membership.*)
  insert into public.membership_events(business_id,membership_id,event_type,plan,lifecycle,access_through,provenance,request_key)
    select business_id,id,'restarted',plan,'active',access_through,'system','grant-started:'||id::text||':'||version::text from activated;
  with expired as(
    update public.business_memberships set lifecycle='expired_read_only',version=version+1,updated_at=p_now
    where lifecycle in('active','canceling','payment_issue') and
      ((lifecycle='payment_issue' and grace_through is not null and grace_through<=p_now) or
       (lifecycle in('active','canceling') and access_through is not null and access_through<=p_now))
    returning *)
  insert into public.membership_events(business_id,membership_id,event_type,plan,lifecycle,access_through,grace_through,scheduled_plan,scheduled_effective_at,provenance,request_key)
    select business_id,id,'expired',plan,'expired_read_only',access_through,grace_through,scheduled_plan,scheduled_effective_at,'system','elapsed:'||id::text||':'||version::text from expired;
  get diagnostics affected=row_count;return affected;
end $$;
revoke execute on function public.expire_elapsed_business_memberships(timestamptz) from public,anon,authenticated;
grant execute on function public.expire_elapsed_business_memberships(timestamptz) to service_role;

create or replace function public.customer_has_active_membership() returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.business_memberships membership join public.businesses business on business.id=membership.business_id
    where business.owner_user_id=(select auth.uid()) and (
      (membership.lifecycle in('active','canceling') and (membership.access_through is null or membership.access_through>now())) or
      (membership.lifecycle='payment_issue' and membership.grace_through is not null and membership.grace_through>now())))
$$;
revoke execute on function public.customer_has_active_membership() from public,anon;
grant execute on function public.customer_has_active_membership() to authenticated,service_role;

drop policy if exists receipt_objects_insert_own on storage.objects;
create policy receipt_objects_insert_own on storage.objects for insert to authenticated with check(
  bucket_id='receipts' and split_part(name,'/',1)='receipts' and split_part(name,'/',2)=(select auth.uid())::text
  and public.customer_has_active_membership());
drop policy if exists statement_objects_insert_own on storage.objects;
create policy statement_objects_insert_own on storage.objects for insert to authenticated with check(
  bucket_id='receipts' and (storage.foldername(name))[1]='statements' and (storage.foldername(name))[2]=(select auth.uid())::text
  and public.customer_has_active_membership());

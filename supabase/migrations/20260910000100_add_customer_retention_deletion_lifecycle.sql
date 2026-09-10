-- Canonical cancellation retention and destructive account deletion lifecycle.

alter table public.business_memberships
  add column read_only_through timestamptz,
  add column deletion_due_at timestamptz;

create table public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references public.businesses(id) on delete set null,
  owner_user_id uuid references auth.users(id) on delete set null,
  business_identity_hash text not null,
  user_identity_hash text not null,
  reason text not null check(reason in ('customer_request','retention_expired')),
  status text not null check(status in ('scheduled','executing','retryable','canceled','completed')),
  requested_at timestamptz not null,
  scheduled_for timestamptz not null,
  canceled_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  lease_token uuid,
  lease_expires_at timestamptz,
  attempt_count integer not null default 0 check(attempt_count>=0),
  last_failure_code text,
  request_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint account_deletion_request_key_unique unique(user_identity_hash,request_key),
  constraint account_deletion_safe_failure check(last_failure_code is null or last_failure_code~'^[A-Z0-9_]{1,100}$'),
  constraint account_deletion_schedule check(scheduled_for>=requested_at)
);

create unique index one_open_account_deletion_per_user on public.account_deletion_requests(user_identity_hash)
  where status in ('scheduled','executing','retryable');
create index account_deletion_due_idx on public.account_deletion_requests(status,scheduled_for,lease_expires_at);

create table public.account_deletion_attempt_events (
  id uuid primary key default gen_random_uuid(),
  deletion_request_id uuid not null references public.account_deletion_requests(id) on delete restrict,
  event_type text not null check(event_type in ('scheduled','canceled','claimed','failed','completed')),
  safe_code text,
  actor_kind text not null check(actor_kind in ('customer','system','worker')),
  request_key text not null,
  created_at timestamptz not null default now(),
  constraint account_deletion_attempt_unique unique(deletion_request_id,request_key),
  constraint account_deletion_attempt_safe_code check(safe_code is null or safe_code~'^[A-Z0-9_]{1,100}$')
);

-- This minimized ledger deliberately has no FK to customer data. Export it to the
-- separately controlled DR destination so pre-deletion backups cannot resurrect data.
create table public.account_deletion_tombstones (
  id uuid primary key default gen_random_uuid(),
  deletion_request_id uuid not null unique,
  business_identity_hash text not null,
  user_identity_hash text not null,
  reason text not null check(reason in ('customer_request','retention_expired')),
  effective_at timestamptz not null,
  reconciliation_version integer not null default 1,
  created_at timestamptz not null default now()
);
create unique index account_deletion_business_tombstone on public.account_deletion_tombstones(business_identity_hash);
create unique index account_deletion_user_tombstone on public.account_deletion_tombstones(user_identity_hash);

create table public.retention_notification_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references public.businesses(id) on delete cascade,
  deletion_request_id uuid references public.account_deletion_requests(id) on delete cascade,
  notice_type text not null check(notice_type in ('read_only_started','retention_30_days','retention_7_days','explicit_deletion_scheduled')),
  scheduled_for timestamptz not null,
  delivered_at timestamptz,
  delivery_status text not null default 'pending' check(delivery_status in ('pending','delivered','failed','canceled')),
  safe_failure_code text,
  created_at timestamptz not null default now(),
  constraint retention_notice_subject check(business_id is not null or deletion_request_id is not null),
  constraint retention_notice_unique unique(business_id,notice_type,scheduled_for),
  constraint retention_notice_safe_code check(safe_failure_code is null or safe_failure_code~'^[A-Z0-9_]{1,100}$')
);

alter table public.account_deletion_requests enable row level security;
alter table public.account_deletion_attempt_events enable row level security;
alter table public.account_deletion_tombstones enable row level security;
alter table public.retention_notification_events enable row level security;

create policy account_deletion_request_select_own on public.account_deletion_requests for select to authenticated using(
  owner_user_id=(select auth.uid()) and business_id in(select id from public.businesses where owner_user_id=(select auth.uid()))
);
revoke all on public.account_deletion_requests,public.account_deletion_attempt_events,public.account_deletion_tombstones,public.retention_notification_events from public,anon,authenticated;
grant select on public.account_deletion_requests to authenticated;
grant all on public.account_deletion_requests,public.account_deletion_attempt_events,public.account_deletion_tombstones,public.retention_notification_events to service_role;

create or replace function public.reject_deletion_audit_mutation() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'deletion audit is append-only';end $$;
create trigger deletion_attempt_events_immutable before update or delete on public.account_deletion_attempt_events for each row execute function public.reject_deletion_audit_mutation();
create trigger deletion_tombstones_immutable before update or delete on public.account_deletion_tombstones for each row execute function public.reject_deletion_audit_mutation();

create or replace function public.schedule_customer_account_deletion(
  p_business_id uuid,p_user_id uuid,p_business_identity_hash text,p_user_identity_hash text,p_request_key text,p_now timestamptz default now()
) returns uuid language plpgsql security definer set search_path='' as $$
declare selected_id uuid;selected_membership public.business_memberships%rowtype;
begin
  if (select auth.uid()) is distinct from p_user_id or coalesce((select auth.jwt()->>'aal'),'')<>'aal2'
    or not exists(select 1 from public.businesses where id=p_business_id and owner_user_id=p_user_id)
    or length(p_business_identity_hash)<>64 or length(p_user_identity_hash)<>64
    or length(btrim(coalesce(p_request_key,''))) not between 8 and 200 then raise exception 'verified deletion request required';end if;
  select id into selected_id from public.account_deletion_requests where user_identity_hash=p_user_identity_hash and request_key=p_request_key;
  if selected_id is not null then return selected_id;end if;
  insert into public.account_deletion_requests(business_id,owner_user_id,business_identity_hash,user_identity_hash,reason,status,requested_at,scheduled_for,request_key)
    values(p_business_id,p_user_id,p_business_identity_hash,p_user_identity_hash,'customer_request','scheduled',p_now,p_now+interval '7 days',btrim(p_request_key)) returning id into selected_id;
  insert into public.account_deletion_attempt_events(deletion_request_id,event_type,actor_kind,request_key)
    values(selected_id,'scheduled','customer','scheduled:'||p_request_key);
  update public.business_memberships set version=version+1,updated_at=p_now where business_id=p_business_id returning * into selected_membership;
  if selected_membership.id is not null then insert into public.membership_events(business_id,membership_id,event_type,plan,lifecycle,access_through,grace_through,scheduled_plan,scheduled_effective_at,provenance,actor_user_id,request_key)
    values(p_business_id,selected_membership.id,'deletion_scheduled',selected_membership.plan,selected_membership.lifecycle,selected_membership.access_through,selected_membership.grace_through,selected_membership.scheduled_plan,selected_membership.scheduled_effective_at,'system',p_user_id,'deletion:'||p_request_key);end if;
  insert into public.retention_notification_events(business_id,deletion_request_id,notice_type,scheduled_for)
    values(p_business_id,selected_id,'explicit_deletion_scheduled',p_now) on conflict do nothing;
  return selected_id;
end $$;

create or replace function public.cancel_customer_account_deletion(p_request_id uuid,p_user_id uuid,p_request_key text,p_now timestamptz default now())
returns boolean language plpgsql security definer set search_path='' as $$
declare selected public.account_deletion_requests%rowtype;
begin
  if (select auth.uid()) is distinct from p_user_id or coalesce((select auth.jwt()->>'aal'),'')<>'aal2' then raise exception 'verified deletion cancellation required';end if;
  select * into selected from public.account_deletion_requests where id=p_request_id and owner_user_id=p_user_id for update;
  if not found then raise exception 'deletion request unavailable';end if;
  if selected.status='canceled' then return true;end if;
  if selected.status<>'scheduled' or selected.scheduled_for<=p_now then raise exception 'deletion cancellation unavailable';end if;
  update public.account_deletion_requests set status='canceled',canceled_at=p_now,updated_at=p_now where id=selected.id;
  insert into public.account_deletion_attempt_events(deletion_request_id,event_type,actor_kind,request_key)
    values(selected.id,'canceled','customer',btrim(p_request_key)) on conflict do nothing;
  update public.retention_notification_events set delivery_status='canceled' where deletion_request_id=selected.id and delivery_status='pending';
  return true;
end $$;

create or replace function public.advance_customer_retention_lifecycle(p_now timestamptz default now()) returns jsonb language plpgsql security definer set search_path='' as $$
declare readonly_count integer;deletion_count integer;
begin
  -- Existing read-only memberships receive a full notice window from rollout; do
  -- not retroactively delete historical accounts without the approved warnings.
  update public.business_memberships set read_only_through=p_now+interval '12 months',
    deletion_due_at=p_now+interval '12 months',version=version+1,updated_at=p_now
    where lifecycle='expired_read_only' and read_only_through is null;
  with moved as(update public.business_memberships set lifecycle='expired_read_only',read_only_through=coalesce(access_through,p_now)+interval '12 months',
      deletion_due_at=coalesce(access_through,p_now)+interval '12 months',version=version+1,updated_at=p_now
    where lifecycle in('active','canceling','payment_issue') and ((lifecycle='payment_issue' and grace_through is not null and grace_through<=p_now)
      or (lifecycle in('active','canceling') and access_through is not null and access_through<=p_now)) returning *)
  insert into public.retention_notification_events(business_id,notice_type,scheduled_for)
    select business_id,'read_only_started',p_now from moved on conflict do nothing;
  get diagnostics readonly_count=row_count;
  insert into public.retention_notification_events(business_id,notice_type,scheduled_for)
    select business_id,'retention_30_days',deletion_due_at-interval '30 days' from public.business_memberships where lifecycle='expired_read_only' and deletion_due_at is not null on conflict do nothing;
  insert into public.retention_notification_events(business_id,notice_type,scheduled_for)
    select business_id,'retention_7_days',deletion_due_at-interval '7 days' from public.business_memberships where lifecycle='expired_read_only' and deletion_due_at is not null on conflict do nothing;
  with due as(select m.business_id,b.owner_user_id from public.business_memberships m join public.businesses b on b.id=m.business_id
      where m.lifecycle='expired_read_only' and m.deletion_due_at<=p_now and not exists(select 1 from public.account_deletion_requests d where d.business_id=m.business_id and d.status in('scheduled','executing','retryable','completed'))), inserted as(
    insert into public.account_deletion_requests(business_id,owner_user_id,business_identity_hash,user_identity_hash,reason,status,requested_at,scheduled_for,request_key)
      select business_id,owner_user_id,encode(public.digest('business:'||business_id::text,'sha256'),'hex'),encode(public.digest('user:'||owner_user_id::text,'sha256'),'hex'),'retention_expired','scheduled',p_now,p_now,'retention:'||business_id::text from due returning id)
  insert into public.account_deletion_attempt_events(deletion_request_id,event_type,actor_kind,request_key) select id,'scheduled','system','retention-due:'||id::text from inserted;
  get diagnostics deletion_count=row_count;
  return jsonb_build_object('read_only_started',readonly_count,'deletions_scheduled',deletion_count);
end $$;

create or replace function public.claim_due_account_deletions(p_limit integer,p_lease_token uuid,p_now timestamptz default now())
returns setof public.account_deletion_requests language plpgsql security definer set search_path='' as $$
begin
  return query with selected as(select id from public.account_deletion_requests where scheduled_for<=p_now and
      (status in('scheduled','retryable') or(status='executing' and lease_expires_at<=p_now)) order by scheduled_for for update skip locked limit least(greatest(p_limit,1),20)), claimed as(
    update public.account_deletion_requests d set status='executing',lease_token=p_lease_token,lease_expires_at=p_now+interval '2 minutes',started_at=coalesce(started_at,p_now),attempt_count=attempt_count+1,updated_at=p_now from selected where d.id=selected.id returning d.*)
  select * from claimed;
end $$;

create or replace function public.record_account_deletion_failure(p_request_id uuid,p_lease_token uuid,p_safe_code text,p_now timestamptz default now()) returns boolean language plpgsql security definer set search_path='' as $$
declare changed integer;
begin
  update public.account_deletion_requests set status='retryable',last_failure_code=case when p_safe_code~'^[A-Z0-9_]{1,100}$' then p_safe_code else 'DELETION_FAILED' end,
    lease_token=null,lease_expires_at=null,updated_at=p_now where id=p_request_id and status='executing' and lease_token=p_lease_token;
  get diagnostics changed=row_count;
  if changed=1 then insert into public.account_deletion_attempt_events(deletion_request_id,event_type,safe_code,actor_kind,request_key)
    values(p_request_id,'failed',case when p_safe_code~'^[A-Z0-9_]{1,100}$' then p_safe_code else 'DELETION_FAILED' end,'worker','failed:'||p_lease_token::text);end if;
  return changed=1;
end $$;

-- Called only after provider and private-object cleanup. It removes all tenant rows,
-- preserves only minimized deletion control records, and is safe to call repeatedly.
create or replace function public.delete_customer_application_data(p_request_id uuid,p_lease_token uuid,p_now timestamptz default now()) returns jsonb language plpgsql security definer set search_path='' as $$
declare selected public.account_deletion_requests%rowtype;table_row record;passes integer;remaining integer;removed_tables integer:=0;
begin
  select * into selected from public.account_deletion_requests where id=p_request_id and status='executing' and lease_token=p_lease_token for update;
  if not found then raise exception 'deletion lease unavailable';end if;
  insert into public.account_deletion_tombstones(deletion_request_id,business_identity_hash,user_identity_hash,reason,effective_at)
    values(selected.id,selected.business_identity_hash,selected.user_identity_hash,selected.reason,p_now) on conflict do nothing;
  perform set_config('writeoffs.deletion_execution','on',true);
  delete from public.subscriptions where stripe_customer_id in(select provider_customer_id from public.membership_provider_links where business_id=selected.business_id)
    or stripe_subscription_id in(select provider_subscription_id from public.membership_provider_links where business_id=selected.business_id);
  -- Break the legacy transaction/receipt cycle before deleting Business-owned links.
  alter table public.transactions disable trigger user;delete from public.transactions where user_id=selected.owner_user_id;alter table public.transactions enable trigger user;
  alter table public.bank_connections disable trigger user;delete from public.bank_connections where user_id=selected.owner_user_id;alter table public.bank_connections enable trigger user;
  for passes in 1..100 loop
    remaining:=0;
    for table_row in select c.table_name from information_schema.columns c join information_schema.tables t on t.table_schema=c.table_schema and t.table_name=c.table_name
      where c.table_schema='public' and c.column_name='business_id' and t.table_type='BASE TABLE'
        and c.table_name not in('account_deletion_requests','account_deletion_attempt_events','account_deletion_tombstones','retention_notification_events','businesses') loop
      begin execute format('alter table public.%I disable trigger user',table_row.table_name);
        execute format('delete from public.%I where business_id=$1',table_row.table_name) using selected.business_id;
        execute format('alter table public.%I enable trigger user',table_row.table_name);removed_tables:=removed_tables+1;
      exception when foreign_key_violation then execute format('alter table public.%I enable trigger user',table_row.table_name);remaining:=remaining+1;
        when others then execute format('alter table public.%I enable trigger user',table_row.table_name);raise;end;
    end loop;
    exit when remaining=0;
  end loop;
  if remaining<>0 then raise exception 'tenant dependency cleanup incomplete';end if;
  alter table public.receipts disable trigger user;delete from public.receipts where user_id=selected.owner_user_id;alter table public.receipts enable trigger user;
  alter table public.profiles disable trigger user;delete from public.profiles where id=selected.owner_user_id;alter table public.profiles enable trigger user;
  delete from public.businesses where id=selected.business_id and owner_user_id=selected.owner_user_id;
  return jsonb_build_object('customer_data_removed',true,'tables_visited',removed_tables);
end $$;

create or replace function public.complete_account_deletion(p_request_id uuid,p_lease_token uuid,p_now timestamptz default now()) returns boolean language plpgsql security definer set search_path='' as $$
declare changed integer;
begin
  update public.account_deletion_requests set status='completed',completed_at=p_now,lease_token=null,lease_expires_at=null,last_failure_code=null,updated_at=p_now
    where id=p_request_id and status='executing' and lease_token=p_lease_token and business_id is null and owner_user_id is null
      and exists(select 1 from public.account_deletion_tombstones t join public.account_deletion_requests d on d.id=p_request_id
        where t.business_identity_hash=d.business_identity_hash and t.user_identity_hash=d.user_identity_hash);
  get diagnostics changed=row_count;
  if changed=1 then insert into public.account_deletion_attempt_events(deletion_request_id,event_type,actor_kind,request_key)
    values(p_request_id,'completed','worker','completed:'||p_lease_token::text) on conflict do nothing;end if;
  return changed=1;
end $$;

create or replace function public.reconcile_restored_deletion_tombstones(p_entries jsonb,p_hmac_key text,p_now timestamptz default now()) returns integer language plpgsql security definer set search_path='' as $$
declare entry jsonb;matched record;request_id uuid;affected integer:=0;
begin
  if jsonb_typeof(p_entries)<>'array' or length(coalesce(p_hmac_key,''))<32 then raise exception 'invalid reconciliation input';end if;
  for entry in select value from jsonb_array_elements(p_entries) loop
    if coalesce(entry->>'business_identity_hash','')!~'^[a-f0-9]{64}$' or coalesce(entry->>'user_identity_hash','')!~'^[a-f0-9]{64}$' then raise exception 'invalid tombstone';end if;
    insert into public.account_deletion_tombstones(deletion_request_id,business_identity_hash,user_identity_hash,reason,effective_at,reconciliation_version)
      values((entry->>'deletion_request_id')::uuid,entry->>'business_identity_hash',entry->>'user_identity_hash',entry->>'reason',(entry->>'effective_at')::timestamptz,1) on conflict do nothing;
    for matched in select b.id business_id,b.owner_user_id from public.businesses b where
      encode(extensions.hmac('writeoffs-deletion:v1:business:'||b.id::text,p_hmac_key,'sha256'),'hex')=entry->>'business_identity_hash'
      and encode(extensions.hmac('writeoffs-deletion:v1:user:'||b.owner_user_id::text,p_hmac_key,'sha256'),'hex')=entry->>'user_identity_hash' loop
      select id into request_id from public.account_deletion_requests where user_identity_hash=entry->>'user_identity_hash' and status in('scheduled','executing','retryable') limit 1;
      if request_id is null then
        insert into public.account_deletion_requests(id,business_id,owner_user_id,business_identity_hash,user_identity_hash,reason,status,requested_at,scheduled_for,request_key)
          values((entry->>'deletion_request_id')::uuid,matched.business_id,matched.owner_user_id,entry->>'business_identity_hash',entry->>'user_identity_hash',entry->>'reason','scheduled',p_now,p_now,'restore:'||(entry->>'deletion_request_id'))
          on conflict(id) do update set business_id=excluded.business_id,owner_user_id=excluded.owner_user_id,status='scheduled',scheduled_for=p_now,lease_token=null,lease_expires_at=null returning id into request_id;
      else update public.account_deletion_requests set status='scheduled',scheduled_for=p_now,lease_token=null,lease_expires_at=null where id=request_id;end if;
      if request_id is not null then insert into public.account_deletion_attempt_events(deletion_request_id,event_type,actor_kind,request_key)
        values(request_id,'scheduled','system','restore-reconciliation:'||request_id::text) on conflict do nothing;affected:=affected+1;end if;
    end loop;
  end loop;
  return affected;
end $$;

-- Membership history is immutable during normal operation but must not retain deleted books.
create or replace function public.reject_membership_history_mutation() returns trigger language plpgsql set search_path='' as $$
begin if current_setting('writeoffs.deletion_execution',true)='on' then return old;end if;raise exception 'membership history is append-only';end $$;

alter table public.membership_events drop constraint membership_event_type_check;
alter table public.membership_events add constraint membership_event_type_check check(event_type in ('grant_created','activated','plan_upgraded','downgrade_scheduled','downgrade_applied','downgrade_canceled','cancellation_requested','cancellation_reversed','payment_failed','payment_recovered','expired','restarted','provider_synced','deletion_scheduled'));

revoke execute on function public.schedule_customer_account_deletion(uuid,uuid,text,text,text,timestamptz),public.cancel_customer_account_deletion(uuid,uuid,text,timestamptz),
  public.advance_customer_retention_lifecycle(timestamptz),public.claim_due_account_deletions(integer,uuid,timestamptz),public.record_account_deletion_failure(uuid,uuid,text,timestamptz),
  public.delete_customer_application_data(uuid,uuid,timestamptz),public.complete_account_deletion(uuid,uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.schedule_customer_account_deletion(uuid,uuid,text,text,text,timestamptz),public.cancel_customer_account_deletion(uuid,uuid,text,timestamptz) to authenticated,service_role;
grant execute on function public.advance_customer_retention_lifecycle(timestamptz),public.claim_due_account_deletions(integer,uuid,timestamptz),public.record_account_deletion_failure(uuid,uuid,text,timestamptz),
  public.delete_customer_application_data(uuid,uuid,timestamptz),public.complete_account_deletion(uuid,uuid,timestamptz) to service_role;
revoke execute on function public.reconcile_restored_deletion_tombstones(jsonb,text,timestamptz) from public,anon,authenticated;
grant execute on function public.reconcile_restored_deletion_tombstones(jsonb,text,timestamptz) to service_role;

create or replace view public.current_customer_membership with(security_barrier=true,security_invoker=true) as
select membership.id,membership.business_id,membership.plan,membership.lifecycle,membership.authority,membership.access_through,
  membership.grace_through,membership.scheduled_plan,membership.scheduled_effective_at,membership.cancel_at_period_end,membership.version,membership.updated_at,
  membership.read_only_through,membership.deletion_due_at,
  deletion.id as deletion_request_id,deletion.status as deletion_status,deletion.scheduled_for as deletion_scheduled_for
from public.business_memberships membership join public.businesses business on business.id=membership.business_id
left join lateral(select id,status,scheduled_for from public.account_deletion_requests where business_id=membership.business_id and status in('scheduled','executing','retryable') order by requested_at desc limit 1) deletion on true
where business.owner_user_id=(select auth.uid());
grant select on public.current_customer_membership to authenticated;

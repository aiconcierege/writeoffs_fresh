-- Durable, minimized lifecycle-notification delivery. This outbox deliberately has
-- no FK to customer data so deletion-completion mail can survive tenant/Auth removal.

alter table public.retention_notification_events drop constraint retention_notification_events_delivery_status_check;
alter table public.retention_notification_events add constraint retention_notification_events_delivery_status_check
  check (delivery_status in ('pending','queued','delivered','failed','canceled'));

create table public.lifecycle_notification_outbox (
  id uuid primary key default gen_random_uuid(),
  semantic_key text not null unique,
  notice_type text not null check (notice_type in (
    'read_only_started','retention_30_days','retention_7_days',
    'explicit_deletion_scheduled','explicit_deletion_canceled','deletion_completed'
  )),
  recipient_ciphertext text not null,
  recipient_hash text not null check (recipient_hash ~ '^[a-f0-9]{64}$'),
  customer_timezone text not null default 'UTC',
  context_code text check (context_code is null or context_code in ('active','read_only')),
  action_path text,
  effective_at timestamptz,
  scheduled_for timestamptz not null,
  status text not null default 'pending' check (status in ('pending','processing','retryable','delivered','terminal_failed','canceled')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  lease_token uuid,
  lease_expires_at timestamptz,
  next_attempt_at timestamptz,
  provider_message_id text,
  safe_failure_code text,
  delivered_at timestamptz,
  recipient_expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lifecycle_notice_safe_failure check (safe_failure_code is null or safe_failure_code ~ '^[A-Z0-9_]{1,100}$'),
  constraint lifecycle_notice_action_path check (action_path is null or action_path ~ '^/[a-zA-Z0-9/_-]*$')
);
create index lifecycle_notification_due_idx on public.lifecycle_notification_outbox(status,scheduled_for,next_attempt_at,lease_expires_at);

create table public.lifecycle_notification_attempt_events (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.lifecycle_notification_outbox(id) on delete restrict,
  event_type text not null check (event_type in ('queued','claimed','accepted','retry_scheduled','terminal_failed','canceled','recipient_expired')),
  attempt_number integer not null,
  safe_code text,
  provider_message_fingerprint text,
  created_at timestamptz not null default now(),
  constraint lifecycle_notification_attempt_unique unique(notification_id,event_type,attempt_number),
  constraint lifecycle_notification_attempt_safe_code check (safe_code is null or safe_code ~ '^[A-Z0-9_]{1,100}$')
);

create table public.lifecycle_operational_alerts (
  id uuid primary key default gen_random_uuid(),
  alert_key text not null unique,
  alert_type text not null check (alert_type in ('deletion_retry_stale','notification_delivery_stale','tombstone_reconciliation_failed','lifecycle_drain_unhealthy','notification_terminal_failure')),
  severity text not null check (severity in ('warning','critical')),
  subject_hash text,
  safe_code text,
  status text not null default 'open' check (status in ('open','acknowledged','resolved')),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  occurrence_count integer not null default 1,
  constraint lifecycle_alert_subject_hash check (subject_hash is null or subject_hash ~ '^[a-f0-9]{64}$'),
  constraint lifecycle_alert_safe_code check (safe_code is null or safe_code ~ '^[A-Z0-9_]{1,100}$')
);

alter table public.lifecycle_notification_outbox enable row level security;
alter table public.lifecycle_notification_attempt_events enable row level security;
alter table public.lifecycle_operational_alerts enable row level security;
revoke all on public.lifecycle_notification_outbox,public.lifecycle_notification_attempt_events,public.lifecycle_operational_alerts from public,anon,authenticated;
grant all on public.lifecycle_notification_outbox,public.lifecycle_notification_attempt_events,public.lifecycle_operational_alerts to service_role;

create or replace function public.reject_lifecycle_delivery_audit_mutation() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'lifecycle delivery audit is append-only'; end $$;
create trigger lifecycle_notification_attempts_immutable before update or delete on public.lifecycle_notification_attempt_events for each row execute function public.reject_lifecycle_delivery_audit_mutation();

create or replace function public.claim_due_lifecycle_notifications(p_limit integer,p_lease_token uuid,p_now timestamptz default now())
returns setof public.lifecycle_notification_outbox language plpgsql security definer set search_path='' as $$
begin
  return query with selected as (
    select id from public.lifecycle_notification_outbox where scheduled_for<=p_now and recipient_expires_at>p_now and
      ((status='pending') or (status='retryable' and coalesce(next_attempt_at,p_now)<=p_now) or (status='processing' and lease_expires_at<=p_now))
      order by scheduled_for for update skip locked limit least(greatest(p_limit,1),25)
  ), claimed as (
    update public.lifecycle_notification_outbox n set status='processing',lease_token=p_lease_token,
      lease_expires_at=p_now+interval '2 minutes',attempt_count=attempt_count+1,updated_at=p_now
    from selected where n.id=selected.id returning n.*
  )
  select * from claimed;
end $$;

create or replace function public.complete_lifecycle_notification(p_id uuid,p_lease_token uuid,p_provider_id text,p_provider_fingerprint text,p_now timestamptz default now())
returns boolean language plpgsql security definer set search_path='' as $$
declare changed integer; attempt integer;
begin
  update public.lifecycle_notification_outbox set status='delivered',provider_message_id=left(p_provider_id,200),delivered_at=p_now,
    lease_token=null,lease_expires_at=null,next_attempt_at=null,safe_failure_code=null,
    recipient_ciphertext='',recipient_expires_at=p_now,updated_at=p_now
    where id=p_id and status='processing' and lease_token=p_lease_token returning attempt_count into attempt;
  get diagnostics changed=row_count;
  if changed=1 then insert into public.lifecycle_notification_attempt_events(notification_id,event_type,attempt_number,provider_message_fingerprint)
    values(p_id,'accepted',attempt,left(p_provider_fingerprint,128)) on conflict do nothing; end if;
  return changed=1;
end $$;

create or replace function public.fail_lifecycle_notification(p_id uuid,p_lease_token uuid,p_safe_code text,p_permanent boolean,p_now timestamptz default now())
returns boolean language plpgsql security definer set search_path='' as $$
declare changed integer; attempt integer; terminal boolean;
begin
  select attempt_count into attempt from public.lifecycle_notification_outbox where id=p_id and status='processing' and lease_token=p_lease_token for update;
  if not found then return false; end if;
  terminal:=p_permanent or attempt>=6;
  update public.lifecycle_notification_outbox set status=case when terminal then 'terminal_failed' else 'retryable' end,
    safe_failure_code=case when p_safe_code~'^[A-Z0-9_]{1,100}$' then p_safe_code else 'NOTIFICATION_DELIVERY_FAILED' end,
    next_attempt_at=case when terminal then null else p_now+(least(60,power(2,attempt)::integer)*interval '1 minute') end,
    lease_token=null,lease_expires_at=null,updated_at=p_now,
    recipient_expires_at=case when terminal then least(recipient_expires_at,p_now+interval '30 days') else recipient_expires_at end
    where id=p_id and status='processing' and lease_token=p_lease_token;
  get diagnostics changed=row_count;
  if changed=1 then insert into public.lifecycle_notification_attempt_events(notification_id,event_type,attempt_number,safe_code)
    values(p_id,case when terminal then 'terminal_failed' else 'retry_scheduled' end,attempt,
      case when p_safe_code~'^[A-Z0-9_]{1,100}$' then p_safe_code else 'NOTIFICATION_DELIVERY_FAILED' end) on conflict do nothing; end if;
  return changed=1;
end $$;

revoke execute on function public.claim_due_lifecycle_notifications(integer,uuid,timestamptz),public.complete_lifecycle_notification(uuid,uuid,text,text,timestamptz),public.fail_lifecycle_notification(uuid,uuid,text,boolean,timestamptz) from public,anon,authenticated;
grant execute on function public.claim_due_lifecycle_notifications(integer,uuid,timestamptz),public.complete_lifecycle_notification(uuid,uuid,text,text,timestamptz),public.fail_lifecycle_notification(uuid,uuid,text,boolean,timestamptz) to service_role;

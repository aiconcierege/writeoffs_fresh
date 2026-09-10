-- Signed, idempotent provider delivery outcomes for lifecycle mail. No recipient,
-- subject, or message content is retained in the provider-event ledger.

alter table public.lifecycle_notification_outbox
  add column provider_delivery_status text not null default 'accepted'
    check(provider_delivery_status in ('accepted','delivered','delayed','bounced','complained','failed','suppressed')),
  add column provider_delivery_updated_at timestamptz;

create table public.lifecycle_notification_provider_events (
  id uuid primary key default gen_random_uuid(),
  event_key_hash text not null unique check(event_key_hash ~ '^[a-f0-9]{64}$'),
  notification_id uuid references public.lifecycle_notification_outbox(id) on delete restrict,
  event_type text not null check(event_type in ('email.delivered','email.delivery_delayed','email.bounced','email.complained','email.failed','email.suppressed')),
  provider_message_fingerprint text not null check(provider_message_fingerprint ~ '^[a-f0-9]{64}$'),
  occurred_at timestamptz not null,
  created_at timestamptz not null default now()
);
alter table public.lifecycle_notification_provider_events enable row level security;
revoke all on public.lifecycle_notification_provider_events from public,anon,authenticated;
grant all on public.lifecycle_notification_provider_events to service_role;
create trigger lifecycle_notification_provider_events_immutable before update or delete on public.lifecycle_notification_provider_events for each row execute function public.reject_lifecycle_delivery_audit_mutation();

alter table public.lifecycle_operational_alerts drop constraint lifecycle_operational_alerts_alert_type_check;
alter table public.lifecycle_operational_alerts add constraint lifecycle_operational_alerts_alert_type_check check(alert_type in ('deletion_retry_stale','notification_delivery_stale','tombstone_reconciliation_failed','lifecycle_drain_unhealthy','notification_terminal_failure','notification_provider_failure'));

create or replace function public.record_resend_lifecycle_webhook(p_event_key_hash text,p_event_type text,p_provider_message_id text,p_provider_message_fingerprint text,p_occurred_at timestamptz)
returns boolean language plpgsql security definer set search_path='' as $$
declare target public.lifecycle_notification_outbox%rowtype; inserted_id uuid; next_status text; safe_code text;
begin
  if p_event_key_hash!~'^[a-f0-9]{64}$' or p_provider_message_fingerprint!~'^[a-f0-9]{64}$' or p_event_type not in ('email.delivered','email.delivery_delayed','email.bounced','email.complained','email.failed','email.suppressed') then raise exception 'invalid provider event'; end if;
  select * into target from public.lifecycle_notification_outbox where provider_message_id=p_provider_message_id limit 1;
  insert into public.lifecycle_notification_provider_events(event_key_hash,notification_id,event_type,provider_message_fingerprint,occurred_at)
    values(p_event_key_hash,target.id,p_event_type,p_provider_message_fingerprint,p_occurred_at)
    on conflict(event_key_hash) do nothing returning id into inserted_id;
  if inserted_id is null then return false; end if;
  if target.id is null then return true; end if;
  next_status=case p_event_type when 'email.delivered' then 'delivered' when 'email.delivery_delayed' then 'delayed' when 'email.bounced' then 'bounced' when 'email.complained' then 'complained' when 'email.failed' then 'failed' when 'email.suppressed' then 'suppressed' end;
  if target.provider_delivery_status not in ('bounced','complained','failed','suppressed') or next_status in ('bounced','complained','failed','suppressed') then
    update public.lifecycle_notification_outbox set provider_delivery_status=next_status,provider_delivery_updated_at=p_occurred_at,updated_at=now() where id=target.id;
  end if;
  if next_status in ('bounced','complained','failed','suppressed') then
    safe_code=case next_status when 'bounced' then 'RESEND_EMAIL_BOUNCED' when 'complained' then 'RESEND_EMAIL_COMPLAINED' when 'failed' then 'RESEND_EMAIL_FAILED' else 'RESEND_EMAIL_SUPPRESSED' end;
    insert into public.lifecycle_operational_alerts(alert_key,alert_type,severity,subject_hash,safe_code,last_seen_at)
      values('provider-delivery:'||target.id,'notification_provider_failure','critical',target.recipient_hash,safe_code,now())
      on conflict(alert_key) do update set safe_code=excluded.safe_code,last_seen_at=excluded.last_seen_at,occurrence_count=public.lifecycle_operational_alerts.occurrence_count+1,status='open';
  end if;
  return true;
end $$;
revoke execute on function public.record_resend_lifecycle_webhook(text,text,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.record_resend_lifecycle_webhook(text,text,text,text,timestamptz) to service_role;

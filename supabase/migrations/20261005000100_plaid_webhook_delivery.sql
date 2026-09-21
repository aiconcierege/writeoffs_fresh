-- Extend the existing Plaid inbox, not a second ingestion path.
alter table public.plaid_items add column new_accounts_available boolean not null default false;
alter table public.plaid_webhook_events add column last_attempt_at timestamptz;
create index plaid_webhook_pending_sync_idx on public.plaid_webhook_events(last_attempt_at nulls first, received_at)
  where processed_at is null and webhook_type='TRANSACTIONS' and webhook_code='SYNC_UPDATES_AVAILABLE';

create function public.record_plaid_webhook(p_hash text, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  i public.plaid_items%rowtype;
  event_id uuid;
  kind text := p_payload->>'webhook_type';
  code text := p_payload->>'webhook_code';
  wants_sync boolean := false;
begin
  if (select auth.role()) is distinct from 'service_role' then raise exception 'trusted service required'; end if;
  if kind is null or code is null or p_hash !~ '^[a-f0-9]{64}$' then raise exception 'invalid webhook'; end if;
  select * into i from public.plaid_items where plaid_item_id=p_payload->>'item_id'
    and environment=p_payload->>'environment' for update;
  insert into public.plaid_webhook_events(event_hash,plaid_item_record_id,webhook_type,webhook_code)
    values(p_hash,i.id,kind,code) on conflict(event_hash) do nothing returning id into event_id;
  if event_id is null then
    return jsonb_build_object('duplicate',true,'itemId',i.id,'shouldSync',false);
  end if;
  if i.id is not null and i.connection_status <> 'disconnected' then
    if kind='TRANSACTIONS' and code='SYNC_UPDATES_AVAILABLE' and i.consent_status='active' then
      update public.plaid_items set sync_requested_at=now(),
        initial_update_complete=initial_update_complete or coalesce((p_payload->>'initial_update_complete')::boolean,false),
        historical_update_complete=historical_update_complete or coalesce((p_payload->>'historical_update_complete')::boolean,false)
        where id=i.id;
      wants_sync:=true;
    elsif kind='ITEM' and code='NEW_ACCOUNTS_AVAILABLE' then
      update public.plaid_items set new_accounts_available=true,
        connection_status=case when connection_status='reconnect_required' then connection_status else 'needs_attention' end where id=i.id;
    elsif kind='ITEM' and code='ERROR' then
      update public.plaid_items set connection_status=case when p_payload#>>'{error,error_code}'='ITEM_LOGIN_REQUIRED'
        then 'reconnect_required' else 'needs_attention' end,
        provider_error_code=coalesce(p_payload#>>'{error,error_code}','ITEM_ERROR'),
        provider_error_type=coalesce(p_payload#>>'{error,error_type}','ITEM_ERROR'),provider_error_at=now() where id=i.id;
    elsif kind='ITEM' and code='USER_PERMISSION_REVOKED' then
      update public.plaid_items set connection_status='reconnect_required',consent_status='revoked',
        provider_error_code=code,provider_error_at=now() where id=i.id;
    elsif kind='ITEM' and code in ('PENDING_DISCONNECT','PENDING_EXPIRATION','USER_ACCOUNT_REVOKED') then
      -- Account-level revocation must not revoke unaffected accounts on the Item.
      update public.plaid_items set connection_status='needs_attention',provider_error_code=code,provider_error_at=now() where id=i.id;
    elsif kind='ITEM' and code='LOGIN_REPAIRED' then
      -- A repaired login does not restore revoked consent or clear unrelated errors.
      update public.plaid_items set connection_status=case when new_accounts_available then 'needs_attention' else 'connected' end,
        provider_error_code=null,provider_error_type=null,provider_error_at=null
        where id=i.id and provider_error_code='ITEM_LOGIN_REQUIRED' and consent_status='active';
    end if;
  end if;
  if not wants_sync then update public.plaid_webhook_events set processed_at=now() where id=event_id; end if;
  return jsonb_build_object('duplicate',false,'itemId',i.id,'shouldSync',wants_sync);
end $$;
revoke all on function public.record_plaid_webhook(text,jsonb) from public,anon,authenticated;
grant execute on function public.record_plaid_webhook(text,jsonb) to service_role;

-- A successful Transactions poll must not dismiss the separate account-consent prompt.
create function public.preserve_plaid_account_attention() returns trigger
language plpgsql set search_path='' as $$
begin
  if new.new_accounts_available and new.connection_status='connected' then new.connection_status:='needs_attention'; end if;
  return new;
end $$;
create trigger plaid_account_attention before update on public.plaid_items
  for each row execute function public.preserve_plaid_account_attention();

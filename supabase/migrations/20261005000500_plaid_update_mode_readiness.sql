-- Durable connection attention belongs to the existing Item, independently of a
-- successful transaction poll. No credentials or provider messages are exposed.
alter table public.plaid_items
  add column update_reason text,
  add column update_state_version bigint not null default 0,
  add column update_completed_at timestamptz,
  add column update_notice_at timestamptz;
update public.plaid_items set update_reason=provider_error_code,update_state_version=1
where provider_error_code in ('ITEM_LOGIN_REQUIRED','PENDING_EXPIRATION','PENDING_DISCONNECT','USER_PERMISSION_REVOKED','USER_ACCOUNT_REVOKED')
  and connection_status<>'disconnected';

create or replace function public.preserve_plaid_account_attention() returns trigger
language plpgsql set search_path='' as $$
begin
  -- Errors discovered by an ordinary sync must activate the same repair prompt.
  if new.provider_error_code='ITEM_LOGIN_REQUIRED' and new.update_reason is distinct from 'ITEM_LOGIN_REQUIRED'
    and new.provider_error_code is distinct from old.provider_error_code then
    new.update_reason:='ITEM_LOGIN_REQUIRED';
    new.update_state_version:=old.update_state_version+1;
  end if;
  if new.connection_status<>'disconnected' then
    if new.update_reason in ('ITEM_LOGIN_REQUIRED','USER_PERMISSION_REVOKED') then
      new.connection_status:='reconnect_required';
    elsif new.update_reason is not null or new.new_accounts_available then
      new.connection_status:='needs_attention';
    end if;
  end if;
  return new;
end $$;

create or replace function public.record_plaid_webhook(p_hash text,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  i public.plaid_items%rowtype;
  event_id uuid;
  kind text:=p_payload->>'webhook_type';
  code text:=p_payload->>'webhook_code';
  wants_sync boolean:=false;
  issued_at timestamptz:=coalesce((p_payload->>'_verified_issued_at')::timestamptz,now());
begin
  if (select auth.role()) is distinct from 'service_role' then raise exception 'trusted service required'; end if;
  if kind is null or code is null or p_hash !~ '^[a-f0-9]{64}$' then raise exception 'invalid webhook'; end if;
  select * into i from public.plaid_items where plaid_item_id=p_payload->>'item_id'
    and environment=p_payload->>'environment' for update;
  insert into public.plaid_webhook_events(event_hash,plaid_item_record_id,webhook_type,webhook_code)
    values(p_hash,i.id,kind,code) on conflict(event_hash) do nothing returning id into event_id;
  if event_id is null then return jsonb_build_object('duplicate',true,'itemId',i.id,'shouldSync',false); end if;
  if i.id is not null and i.connection_status<>'disconnected' and public.plaid_sync_business_allowed(i.business_id) then
    if kind='TRANSACTIONS' and code='SYNC_UPDATES_AVAILABLE' and i.consent_status='active' then
      update public.plaid_items set sync_requested_at=now(),
        initial_update_complete=initial_update_complete or coalesce((p_payload->>'initial_update_complete')::boolean,false),
        historical_update_complete=historical_update_complete or coalesce((p_payload->>'historical_update_complete')::boolean,false)
        where id=i.id;
      wants_sync:=true;
    elsif kind='ITEM' and issued_at>=coalesce(date_trunc('second',greatest(i.update_completed_at,i.update_notice_at)),'-infinity'::timestamptz) then
      if code='NEW_ACCOUNTS_AVAILABLE' then
        update public.plaid_items set new_accounts_available=true,update_state_version=update_state_version+1,update_notice_at=issued_at where id=i.id;
      elsif code='ERROR' then
        update public.plaid_items set connection_status=case when p_payload#>>'{error,error_code}'='ITEM_LOGIN_REQUIRED' then 'reconnect_required' else 'needs_attention' end,
          update_reason=case when p_payload#>>'{error,error_code}'='ITEM_LOGIN_REQUIRED' then 'ITEM_LOGIN_REQUIRED' else update_reason end,
          update_state_version=update_state_version+1,update_notice_at=issued_at,
          provider_error_code=coalesce(p_payload#>>'{error,error_code}','ITEM_ERROR'),
          provider_error_type=coalesce(p_payload#>>'{error,error_type}','ITEM_ERROR'),provider_error_at=now() where id=i.id;
      elsif code in ('PENDING_DISCONNECT','PENDING_EXPIRATION','USER_PERMISSION_REVOKED','USER_ACCOUNT_REVOKED') then
        update public.plaid_items set update_reason=case when update_reason='ITEM_LOGIN_REQUIRED' and code in ('PENDING_DISCONNECT','PENDING_EXPIRATION') then update_reason else code end,
          update_state_version=update_state_version+1,update_notice_at=issued_at,
          consent_status=case when code='USER_PERMISSION_REVOKED' then 'revoked' else consent_status end,
          provider_error_code=code,provider_error_at=now() where id=i.id;
      elsif code='LOGIN_REPAIRED' and i.consent_status='active' then
        -- A repaired login cannot restore revoked consent or dismiss other notices.
        update public.plaid_items set
          update_reason=case when update_reason='ITEM_LOGIN_REQUIRED' then null else update_reason end,
          connection_status=case when update_reason='ITEM_LOGIN_REQUIRED' or provider_error_code='ITEM_LOGIN_REQUIRED' then 'connected' else connection_status end,
          provider_error_code=case when provider_error_code='ITEM_LOGIN_REQUIRED' then null else provider_error_code end,
          provider_error_type=case when provider_error_code='ITEM_LOGIN_REQUIRED' then null else provider_error_type end,
          provider_error_at=case when provider_error_code='ITEM_LOGIN_REQUIRED' then null else provider_error_at end,
          update_state_version=update_state_version+case when update_reason='ITEM_LOGIN_REQUIRED' then 1 else 0 end,
          update_completed_at=case when update_reason='ITEM_LOGIN_REQUIRED' then now() else update_completed_at end,
          update_notice_at=issued_at,sync_requested_at=now() where id=i.id;
        wants_sync:=true;
      end if;
    end if;
  end if;
  if not wants_sync then update public.plaid_webhook_events set processed_at=now() where id=event_id; end if;
  return jsonb_build_object('duplicate',false,'itemId',i.id,'shouldSync',wants_sync);
end $$;

-- Same inbox/outbox and leased sync runner as Transactions webhooks. A client
-- completion is recorded explicitly as internal, never as a Plaid delivery.
create function public.complete_plaid_update(p_item_record_id uuid,p_business_id uuid,p_expected_version bigint)
returns boolean language plpgsql security definer set search_path='' as $$
declare i public.plaid_items%rowtype;
begin
  if (select auth.role()) is distinct from 'service_role' then raise exception 'trusted service required'; end if;
  select * into i from public.plaid_items where id=p_item_record_id and business_id=p_business_id for update;
  if i.id is null or i.connection_status='disconnected' or not public.plaid_sync_business_allowed(p_business_id) then return false; end if;
  if i.update_state_version<>p_expected_version then
    -- Retry of the same completed operation is harmless; newer notices survive.
    return i.update_state_version=p_expected_version+1 and i.update_completed_at is not null and i.update_reason is null and not i.new_accounts_available;
  end if;
  update public.plaid_items set new_accounts_available=false,update_reason=null,consent_status='active',
    provider_error_code=null,provider_error_type=null,provider_error_at=null,connection_status='connected',
    update_state_version=update_state_version+1,update_completed_at=now(),sync_requested_at=now() where id=i.id;
  insert into public.plaid_webhook_events(event_hash,plaid_item_record_id,webhook_type,webhook_code)
    values(repeat(md5('update:'||i.id::text||':'||p_expected_version::text),2),i.id,'INTERNAL','UPDATE_COMPLETED') on conflict(event_hash) do nothing;
  return true;
end $$;
revoke all on function public.complete_plaid_update(uuid,uuid,bigint) from public,anon,authenticated;
grant execute on function public.complete_plaid_update(uuid,uuid,bigint) to service_role;
create index plaid_update_pending_sync_idx on public.plaid_webhook_events(last_attempt_at nulls first,received_at)
  where processed_at is null and webhook_code in ('LOGIN_REPAIRED','UPDATE_COMPLETED');

drop function public.list_plaid_connections();
create function public.list_plaid_connections()
returns table(id uuid,institution_name text,connection_status text,consent_status text,
  last_successful_sync_at timestamptz,last_sync_attempted_at timestamptz,consent_expires_at timestamptz,created_at timestamptz,
  update_reason text,new_accounts_available boolean)
language sql security definer stable set search_path='' as $$
  select i.id,i.institution_name,i.connection_status,i.consent_status,i.last_successful_sync_at,i.last_sync_attempted_at,
    i.consent_expires_at,i.created_at,i.update_reason,i.new_accounts_available
  from public.plaid_items i join public.businesses b on b.id=i.business_id
  where b.owner_user_id=(select auth.uid()) order by i.created_at desc;
$$;
revoke all on function public.list_plaid_connections() from public,anon,service_role;
grant execute on function public.list_plaid_connections() to authenticated;

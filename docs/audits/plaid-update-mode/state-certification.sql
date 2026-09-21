-- INTERNAL DETERMINISTIC TEST, never represented as a provider delivery.
-- Run inside BEGIN/ROLLBACK on dedicated staging. Requires the migration first.
select set_config('request.jwt.claims','{"role":"service_role"}',true);
do $$
declare b uuid; a uuid; healthy uuid; r jsonb; v bigint; n integer;
begin
  select b0.id into b from public.businesses b0 join auth.users u on u.id=b0.owner_user_id
    where u.raw_user_meta_data->>'synthetic_plaid_completion'='true' limit 1;
  if b is null then raise exception 'isolated certification customer missing'; end if;
  insert into public.plaid_items(business_id,plaid_item_id,access_token_ciphertext,environment,connection_status)
    values(b,'update-cert-A','internal-only-no-provider-token','sandbox','connected') returning id into a;
  insert into public.plaid_items(business_id,plaid_item_id,access_token_ciphertext,environment,connection_status)
    values(b,'update-cert-B','internal-only-no-provider-token','sandbox','connected') returning id into healthy;
  foreach n in array array[1,2] loop
    r:=public.record_plaid_webhook(repeat(md5(n::text),2),jsonb_build_object('item_id','update-cert-A','environment','sandbox','webhook_type','ITEM',
      'webhook_code',case n when 1 then 'PENDING_EXPIRATION' else 'PENDING_DISCONNECT' end));
    if (r->>'shouldSync')::boolean then raise exception 'notice incorrectly starts sync'; end if;
    update public.plaid_items set connection_status='connected',provider_error_code=null where id=a;
    if (select connection_status from public.plaid_items where id=a)<>'needs_attention' then raise exception 'sync cleared notice'; end if;
    select update_state_version into v from public.plaid_items where id=a;
    if public.complete_plaid_update(a,healthy,v) then raise exception 'cross-business accepted'; end if;
    if not public.complete_plaid_update(a,b,v) then raise exception 'completion rejected'; end if;
    if not public.complete_plaid_update(a,b,v) then raise exception 'completion replay rejected'; end if;
  end loop;
  r:=public.record_plaid_webhook(repeat('a',64),jsonb_build_object('item_id','update-cert-A','environment','sandbox','webhook_type','ITEM','webhook_code','NEW_ACCOUNTS_AVAILABLE'));
  select update_state_version into v from public.plaid_items where id=a;
  r:=public.record_plaid_webhook(repeat('b',64),jsonb_build_object('item_id','update-cert-A','environment','sandbox','webhook_type','ITEM','webhook_code','PENDING_DISCONNECT'));
  if public.complete_plaid_update(a,b,v) then raise exception 'stale completion erased new notice'; end if;
  r:=public.record_plaid_webhook(repeat('b',64),jsonb_build_object('item_id','update-cert-A','environment','sandbox','webhook_type','ITEM','webhook_code','PENDING_DISCONNECT'));
  if not (r->>'duplicate')::boolean then raise exception 'replay not deduplicated'; end if;
  select update_state_version into v from public.plaid_items where id=a;
  perform public.complete_plaid_update(a,b,v);
  r:=public.record_plaid_webhook(repeat('c',64),jsonb_build_object('item_id','update-cert-A','environment','sandbox','webhook_type','ITEM','webhook_code','PENDING_EXPIRATION','_verified_issued_at',now()-interval '30 seconds'));
  if (select update_reason from public.plaid_items where id=a) is not null then raise exception 'old notice resurrected'; end if;
  r:=public.record_plaid_webhook(repeat('d',64),jsonb_build_object('item_id','update-cert-A','environment','sandbox','webhook_type','ITEM','webhook_code','ERROR','error',jsonb_build_object('error_code','ITEM_LOGIN_REQUIRED')));
  if (select connection_status from public.plaid_items where id=a)<>'reconnect_required' then raise exception 'login prompt missing'; end if;
  r:=public.record_plaid_webhook(repeat('e',64),jsonb_build_object('item_id','update-cert-A','environment','sandbox','webhook_type','ITEM','webhook_code','LOGIN_REPAIRED'));
  if not (r->>'shouldSync')::boolean or (select update_reason from public.plaid_items where id=a) is not null then raise exception 'login repair did not clear/sync'; end if;
  if (select connection_status from public.plaid_items where id=healthy)<>'connected' or (select sync_requested_at from public.plaid_items where id=healthy) is not null then raise exception 'other Item modified'; end if;
  r:=public.record_plaid_webhook(repeat('1',64),jsonb_build_object('item_id','update-cert-A','environment','sandbox','webhook_type','ITEM','webhook_code','USER_PERMISSION_REVOKED'));
  r:=public.record_plaid_webhook(repeat('2',64),jsonb_build_object('item_id','update-cert-A','environment','sandbox','webhook_type','ITEM','webhook_code','LOGIN_REPAIRED'));
  if (r->>'shouldSync')::boolean or (select consent_status from public.plaid_items where id=a)<>'revoked' then raise exception 'login repair restored revoked consent'; end if;
  insert into public.account_deletion_requests(business_id,owner_user_id,business_identity_hash,user_identity_hash,reason,status,requested_at,scheduled_for,request_key)
    select b,owner_user_id,repeat('f',64),repeat('a',64),'customer_request','scheduled',now(),now()+interval '7 days','update-mode-cert-'||a from public.businesses where id=b;
  select update_state_version into v from public.plaid_items where id=a;
  if public.complete_plaid_update(a,b,v) then raise exception 'pending deletion allowed repair'; end if;
  r:=public.record_plaid_webhook(repeat('f',64),jsonb_build_object('item_id','update-cert-A','environment','sandbox','webhook_type','ITEM','webhook_code','LOGIN_REPAIRED'));
  if (r->>'shouldSync')::boolean then raise exception 'pending deletion scheduled sync'; end if;
  update public.plaid_items set connection_status='disconnected',consent_status='disconnected' where id=a;
  select update_state_version into v from public.plaid_items where id=a;
  if public.complete_plaid_update(a,b,v) then raise exception 'disconnected completion accepted'; end if;
end $$;
select 'PASS: pending expiration/disconnect, notice survives sync, completion/replay, stale completion/event, login repair/sync, Item isolation, revoked consent, disconnected and deletion guards' as result;

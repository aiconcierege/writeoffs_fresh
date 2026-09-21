-- Run inside a rolled-back transaction after the migration. No customer rows changed.
set local request.jwt.claim.role='service_role';
do $$
declare
  business uuid;
  item uuid:=gen_random_uuid();
  pid text:='synthetic-webhook-'||gen_random_uuid();
  payload jsonb;
  result jsonb;
begin
  select b.id into business from public.businesses b join auth.users u on u.id=b.owner_user_id
    where u.raw_user_meta_data->>'synthetic_ux1'='true' or u.raw_user_meta_data->>'synthetic_guided_contract'='true' limit 1;
  if business is null then raise exception 'Synthetic fixture required'; end if;
  insert into public.plaid_items(id,business_id,plaid_item_id,access_token_ciphertext,environment,connection_status)
    values(item,business,pid,'synthetic-not-a-credential','sandbox','connected');
  payload:=jsonb_build_object('item_id',pid,'environment','sandbox','webhook_type','ITEM','webhook_code','NEW_ACCOUNTS_AVAILABLE');
  result:=public.record_plaid_webhook(repeat('1',64),payload);
  if result->>'itemId'<>item::text or (result->>'shouldSync')::boolean then raise exception 'new account routing'; end if;
  if not (select new_accounts_available and connection_status='needs_attention' from public.plaid_items where id=item) then raise exception 'new account state'; end if;
  result:=public.record_plaid_webhook(repeat('1',64),payload);
  if not (result->>'duplicate')::boolean then raise exception 'replay'; end if;
  update public.plaid_items set connection_status='connected' where id=item;
  if (select connection_status from public.plaid_items where id=item)<>'needs_attention' then raise exception 'sync dismissed consent'; end if;
  result:=public.record_plaid_webhook(repeat('2',64),payload||'{"webhook_type":"TRANSACTIONS","webhook_code":"SYNC_UPDATES_AVAILABLE"}');
  if not (result->>'shouldSync')::boolean or not exists(select 1 from public.plaid_webhook_events where event_hash=repeat('2',64) and processed_at is null) then raise exception 'durable sync'; end if;
  result:=public.record_plaid_webhook(repeat('3',64),payload||'{"environment":"production"}');
  if result->>'itemId' is not null then raise exception 'environment isolation'; end if;
  perform public.record_plaid_webhook(repeat('4',64),payload||'{"webhook_code":"ERROR","error":{"error_code":"ITEM_LOGIN_REQUIRED"}}');
  if (select connection_status from public.plaid_items where id=item)<>'reconnect_required' then raise exception 'login error'; end if;
  perform public.record_plaid_webhook(repeat('5',64),payload||'{"webhook_code":"LOGIN_REPAIRED"}');
  if (select provider_error_code from public.plaid_items where id=item) is not null then raise exception 'login repaired'; end if;
  perform public.record_plaid_webhook(repeat('6',64),payload||'{"webhook_code":"USER_ACCOUNT_REVOKED"}');
  if (select consent_status from public.plaid_items where id=item)<>'active' then raise exception 'unaffected account consent'; end if;
  perform public.record_plaid_webhook(repeat('7',64),payload||'{"webhook_code":"USER_PERMISSION_REVOKED"}');
  if (select consent_status from public.plaid_items where id=item)<>'revoked' then raise exception 'revoked consent'; end if;
  result:=public.record_plaid_webhook(repeat('8',64),payload||'{"webhook_type":"TRANSACTIONS","webhook_code":"SYNC_UPDATES_AVAILABLE"}');
  if (result->>'shouldSync')::boolean then raise exception 'revoked sync'; end if;
  if has_function_privilege('authenticated','public.record_plaid_webhook(text,jsonb)','execute') or has_function_privilege('anon','public.record_plaid_webhook(text,jsonb)','execute') then raise exception 'RPC exposure'; end if;
end $$;
select 'PASS: Item/environment routing, account selection, replay, durable sync, errors, repair, revocation and service-only RPC' as result;

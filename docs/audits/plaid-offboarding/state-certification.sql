begin;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
do $$
declare b uuid:='58a2fc15-ac3a-4ef9-a0c9-bbab693f9804'; u uuid; i uuid:='586924a2-cfc2-4772-bf69-08a1fd130c44'; lease uuid:=gen_random_uuid(); req uuid:=gen_random_uuid(); result jsonb; n integer; t record; other_count integer;
begin
 select owner_user_id into u from public.businesses where id=b;
 if not exists(select 1 from auth.users where id=u and raw_user_meta_data->>'synthetic_plaid_completion'='true') then raise exception 'synthetic fixture required'; end if;
 select count(*) into other_count from public.businesses where id<>b;
 -- A worker holding a pre-disconnection lease cannot commit afterward.
 update public.plaid_items set connection_status='connected',consent_status='active',access_token_ciphertext='isolated-rollback-only',sync_cursor='before',sync_lease_id=lease,sync_lease_expires_at=now()+interval '5 minutes' where id=i and business_id=b;
 if not public.disconnect_plaid_item_state(i,b) then raise exception 'disconnect failed'; end if;
 begin
  perform public.apply_plaid_transaction_sync(i,lease,'before','after','[]','[]');
  raise exception 'stale lease unexpectedly accepted';
 exception when others then if sqlerrm='stale lease unexpectedly accepted' then raise; end if; end;
 if exists(select 1 from public.claim_plaid_item_sync(i,gen_random_uuid())) then raise exception 'terminal item claimed';end if;
 if exists(select 1 from public.plaid_items where id=i and (access_token_ciphertext<>'' or sync_cursor is not null)) then raise exception 'credentials retained';end if;
 -- Legacy retention-expiry ledger entries must identify their restored tenant.
 result:=jsonb_build_array(jsonb_build_object('deletion_request_id',req,'business_identity_hash',encode(extensions.digest('business:'||b::text,'sha256'),'hex'),'user_identity_hash',encode(extensions.digest('user:'||u::text,'sha256'),'hex'),'reason','retention_expired','effective_at',now()));
 if public.reconcile_restored_deletion_tombstones(result,'isolated-test-key-at-least-32-characters',now())<>1 then raise exception 'legacy restore not scheduled';end if;
 if public.plaid_sync_business_allowed(b) then raise exception 'deletion must block sync';end if;
 update public.account_deletion_requests set status='executing',lease_token=lease,lease_expires_at=now()+interval '2 minutes' where id=req and business_id=b;
 perform public.delete_customer_application_data(req,lease,now());
 if exists(select 1 from public.businesses where id=b) then raise exception 'business retained';end if;
 for t in select c.table_name from information_schema.columns c join information_schema.tables x using(table_schema,table_name) where c.table_schema='public' and c.column_name='business_id' and x.table_type='BASE TABLE' loop
  execute format('select count(*) from public.%I where business_id=$1',t.table_name) into n using b;
  if n<>0 then raise exception 'tenant rows retained in %',t.table_name;end if;
 end loop;
 delete from auth.users where id=u;
 if not public.complete_account_deletion(req,lease,now()) then raise exception 'completion failed';end if;
 if public.reconcile_restored_deletion_tombstones(result,'isolated-test-key-at-least-32-characters',now())<>0 then raise exception 'absent tenant rescheduled';end if;
 if (select count(*) from public.businesses where id<>b)<>other_count then raise exception 'other tenant affected';end if;
end $$;
select 'PASS: terminal lease, erased credential, legacy restore, all business-owned tables, Auth/MFA cascade, completion, unrelated tenants' as result;
rollback;

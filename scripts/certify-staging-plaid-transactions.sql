-- Rolled-back, synthetic-only failure/replay certification. No provider events are claimed by this test.
begin;
select set_config('request.jwt.claim.role','service_role',true);
do $$
declare bid uuid:='c6e15980-c3e5-4bb9-9272-bf10d5692055'; iid uuid:=gen_random_uuid(); lid uuid:=gen_random_uuid(); acc jsonb; ev jsonb; r jsonb; n integer; h text; kind text; before_count integer; rejected boolean;
begin
 if not exists(select 1 from public.businesses b join auth.users u on u.id=b.owner_user_id where b.id=bid and (u.raw_user_meta_data->>'synthetic_ux1'='true' or u.raw_user_meta_data->>'synthetic_guided_contract'='true')) then raise exception 'synthetic required';end if;
 insert into public.plaid_items(id,business_id,plaid_item_id,access_token_ciphertext,environment) values(iid,bid,'cert-'||iid,'not-a-credential','sandbox');
 acc:=jsonb_build_array(jsonb_build_object('account_id','cert-'||iid,'display_name','Certification','account_type','checking','account_subtype','checking','currency','USD'));
 for n in 1..4 loop
 h:=case when n in(1,3)then 'a' else 'b' end;kind:=case when n=1 then 'added' else 'modified' end;
 ev:=jsonb_build_array(jsonb_build_object('transaction_id','cert-tx','account_id','cert-'||iid,'event_type',kind,'source_hash',repeat(h,64),'pending',false,'transaction_date','2026-09-20','amount_cents',case when h='a' then -100 else -200 end,'currency','USD','original_description','Synthetic revision'));
 perform public.claim_plaid_item_sync(iid,lid);
 r:=public.apply_plaid_transaction_sync(iid,lid,case when n=1 then null else (n-1)::text end,n::text,acc,ev);
 end loop;
 if (select amount_cents from public.plaid_transaction_versions v where v.plaid_item_record_id=iid and not exists(select 1 from public.plaid_transaction_versions s where s.supersedes_version_id=v.id))<>-200 then raise exception 'CONFIRMED: repeated historical value incorrectly skipped';end if;
 -- Replay current event: no extra version, cursor still advances atomically.
 select count(*) into before_count from public.plaid_transaction_versions where plaid_item_record_id=iid;
 perform public.claim_plaid_item_sync(iid,lid);
 r:=public.apply_plaid_transaction_sync(iid,lid,'4','5',acc,ev);
 if (r->>'duplicates')::integer<>1 or (select count(*) from public.plaid_transaction_versions where plaid_item_record_id=iid)<>before_count then raise exception 'replay duplicated';end if;
 -- Removed -> restored -> removed must leave a removed current leaf.
 for n in 6..8 loop
 ev:=case when n=7 then ev else jsonb_build_array(jsonb_build_object('transaction_id','cert-tx','event_type','removed','source_hash',repeat('c',64))) end;
 if n=7 then ev:=jsonb_build_array(jsonb_build_object('transaction_id','cert-tx','account_id','cert-'||iid,'event_type','modified','source_hash',repeat('b',64),'pending',false,'transaction_date','2026-09-20','amount_cents',-200,'currency','USD','original_description','Synthetic revision'));end if;
 perform public.claim_plaid_item_sync(iid,lid);
 r:=public.apply_plaid_transaction_sync(iid,lid,(n-1)::text,n::text,acc,ev);
 end loop;
 if not exists(select 1 from public.plaid_transaction_versions v where v.plaid_item_record_id=iid and v.event_type='removed' and v.canonical_financial_transaction_id is null and not exists(select 1 from public.plaid_transaction_versions s where s.supersedes_version_id=v.id)) then raise exception 'removal failed';end if;
 -- Invalid source and valid neighbor commit together; correction supersedes rejection.
 perform public.claim_plaid_item_sync(iid,lid);
 ev:=jsonb_build_array(jsonb_build_object('transaction_id','malformed','account_id','cert-'||iid,'event_type','added','source_hash',repeat('f',64),'transaction_date','2026-09-20','amount_cents',null,'pending',false,'rejection_reason','INVALID_SOURCE_FACTS','raw_source',jsonb_build_object('amount',48.2542)),jsonb_build_object('transaction_id','valid-neighbor','account_id','cert-'||iid,'event_type','added','source_hash',repeat('1',64),'transaction_date','2026-09-20','amount_cents',-1234,'pending',false,'currency','USD','original_description','Valid after malformed'));
 r:=public.apply_plaid_transaction_sync(iid,lid,'8','8',acc,ev);
 if (r->>'quarantined')::integer<>1 or (r->>'canonicalized')::integer<>1 then raise exception 'quarantine blocked valid neighbor';end if;
 if not exists(select 1 from public.plaid_transaction_versions where plaid_item_record_id=iid and rejection_reason is not null and amount_cents is null and canonical_financial_transaction_id is null and raw_source->>'amount'='48.2542') then raise exception 'quarantine evidence lost';end if;
 perform public.claim_plaid_item_sync(iid,lid);
 r:=public.apply_plaid_transaction_sync(iid,lid,'8','8',acc,ev);
 if (r->>'duplicates')::integer<>2 then raise exception 'quarantine replay duplicated';end if;
 perform public.claim_plaid_item_sync(iid,lid);
 r:=public.apply_plaid_transaction_sync(iid,lid,'8','8',acc,jsonb_build_array(jsonb_build_object('transaction_id','malformed','account_id','cert-'||iid,'event_type','modified','source_hash',repeat('2',64),'transaction_date','2026-09-20','amount_cents',-4825,'pending',false,'currency','USD','original_description','Provider correction')));
 if (r->>'quarantined')::integer<>0 then raise exception 'provider correction did not recover quarantine';end if;
 -- A pending deletion blocks a claimed sync at commit and blocks future claims.
 perform public.claim_plaid_item_sync(iid,lid);
 insert into public.account_deletion_requests(business_id,owner_user_id,business_identity_hash,user_identity_hash,reason,status,requested_at,scheduled_for,request_key)
 select bid,owner_user_id,repeat('d',64),repeat('e',64),'customer_request','scheduled',now(),now()+interval '7 days','transactions-certification-'||iid from public.businesses where id=bid;
 rejected:=false;
 begin perform public.apply_plaid_transaction_sync(iid,lid,'8','9',acc,'[]'::jsonb);
 exception when others then
   if sqlerrm<>'Plaid sync business is inactive' then raise;end if;
   rejected:=true;
 end;
 if not rejected or (select sync_cursor from public.plaid_items where id=iid)<>'8' then raise exception 'deletion did not block commit';end if;
 update public.plaid_items set sync_lease_id=null,sync_lease_expires_at=null where id=iid;
 if exists(select 1 from public.claim_plaid_item_sync(iid,lid)) then raise exception 'deletion did not block claim';end if;

end $$;
rollback;

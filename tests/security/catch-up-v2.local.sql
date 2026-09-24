-- Entirely synthetic, rollback-only local PostgreSQL certification.
begin;
insert into public.categories(id,key,label) values(900000001,'advertising','Advertising') on conflict do nothing;
do $$ declare uid uuid:=gen_random_uuid(); other_uid uuid:=gen_random_uuid(); bid uuid; other_bid uuid;
 aid uuid:=gen_random_uuid(); tid uuid:=gen_random_uuid(); rid uuid:=gen_random_uuid(); did uuid:=gen_random_uuid();
 request_id uuid:=gen_random_uuid(); doc uuid:=gen_random_uuid(); use_id uuid; items jsonb; before_decisions jsonb;
 response jsonb; failed boolean; scope jsonb; receipt public.receipts%rowtype; receipt_result jsonb; n integer; scope_key text:=repeat('a',64); new_decision uuid;
begin
 insert into auth.users(id,email,raw_user_meta_data) values(uid,'evidence-a@local.invalid','{"synthetic":true}'),(other_uid,'evidence-b@local.invalid','{"synthetic":true}');
 select id into bid from public.businesses where owner_user_id=uid;
 select id into other_bid from public.businesses where owner_user_id=other_uid;
 perform set_config('request.jwt.claims','{"role":"service_role"}',true);
 perform public.create_business_membership_grant(bid,'business',now()-interval '1 day',null,'evidence-local','Synthetic evidence regression','admin',null);
 perform public.create_business_membership_grant(other_bid,'business',now()-interval '1 day',null,'evidence-local-other','Synthetic isolation regression','admin',null);
 insert into public.business_customer_setup(business_id,joined_month,grandfathered_start_date,timezone_name)
 values(bid,'2026-09-01','2026-01-01','America/Phoenix') on conflict(business_id)
 do update set joined_month='2026-09-01',grandfathered_start_date='2026-01-01';
 update public.businesses set catch_up_start_date='2026-01-01' where id=bid;
 scope:=public.bookkeeping_scope_authority(bid);
 if scope->>'currentFrom'<>'2026-08-01' or scope#>>'{catchUp,through}'<>'2026-07-31' then raise exception 'Commercial scope mismatch';end if;
 insert into public.financial_accounts(id,business_id,institution_name,display_name,account_type) values(aid,bid,'Synthetic bank','Synthetic checking','checking');
 insert into public.financial_transactions(id,business_id,financial_account_id,source_fingerprint,import_method,original_description,amount_cents,transaction_date)
 values(tid,bid,aid,'evidence-local-source','csv','CHECK #104 - DESERT PRINT SHOP',-21840,'2026-05-09');
 insert into public.bookkeeping_records(id,business_id,source_kind,ingestion_key,amount_cents,currency,occurred_on)
 values(rid,bid,'financial_transaction','evidence-local',-21840,'USD','2026-05-09');
 insert into public.bookkeeping_financial_sources(business_id,bookkeeping_record_id,financial_transaction_id,provenance) values(bid,rid,tid,'system');
 insert into public.bookkeeping_decisions(id,business_id,bookkeeping_record_id,bookkeeping_nature,treatment,review_status,provenance)
 values(did,bid,rid,'expense','business','needs_review','automation');
 insert into public.bookkeeping_allocations(business_id,bookkeeping_record_id,bookkeeping_decision_id,allocation_kind,amount_cents,tax_category_key)
 values(bid,rid,did,'business',-21840,'advertising');
 perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','authenticated','aal','aal2')::text,true);
 perform public.set_financial_account_use(aid,'business_only',now(),gen_random_uuid());
 select id into use_id from public.current_financial_account_use where financial_account_id=aid;
 items:=jsonb_build_array(jsonb_build_object('recordId',rid,'decisionId',did,'reviewVersion',public.guided_purchase_version(rid),
  'accountUseVersion',use_id,'date','2026-05-09','amountCents',-21840,'transactionId',tid,'merchant','Desert Print Shop'));
 select jsonb_agg(to_jsonb(d)) into before_decisions from public.bookkeeping_decisions d where business_id=bid;

 delete from public.bookkeeping_processing_jobs where business_id=bid;
 response:=public.answer_catch_up_stage(request_id,scope_key,'2026-01-01','2026-07-31','statements','continue','[]','{}','{}');
 if response<>public.answer_catch_up_stage(request_id,scope_key,'2026-01-01','2026-07-31','statements','continue','[]','{}','{}') then raise exception 'Retry failed';end if;
 failed:=false;begin
  perform public.answer_catch_up_stage(request_id,scope_key,'2026-01-01','2026-07-31','statements','later','[]','{}','{}');
 exception when others then failed:=true;end;
 if not failed then raise exception 'Changed retry accepted';end if;
 perform public.answer_catch_up_stage(gen_random_uuid(),scope_key,'2026-01-01','2026-07-31','receipts','none','[]','{}','{}');
 perform public.answer_catch_up_stage(gen_random_uuid(),scope_key,'2026-01-01','2026-07-31','personal','reviewed',items,'{}','{}');
 if before_decisions is distinct from (select jsonb_agg(to_jsonb(d)) from public.bookkeeping_decisions d where business_id=bid) then raise exception 'Review confirmation changed books';end if;
 failed:=false;begin
  perform public.answer_catch_up_stage(gen_random_uuid(),scope_key,'2026-01-01','2026-07-31','nonexpense','reviewed',jsonb_set(items,'{0,reviewVersion}','"stale"'),'{}','{}');
 exception when others then failed:=true;end;
 if not failed then raise exception 'Stale item accepted';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',other_uid,'role','authenticated','aal','aal2')::text,true);
 failed:=false;begin
  perform public.answer_catch_up_stage(gen_random_uuid(),scope_key,'2026-01-01','2026-07-31','personal','reviewed',items,array[rid],'{}');
 exception when others then failed:=true;end;
 if not failed then raise exception 'Cross tenant mutation accepted';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','authenticated','aal','aal2')::text,true);
 perform public.answer_catch_up_stage(gen_random_uuid(),scope_key,'2026-01-01','2026-07-31','nonexpense','reviewed',items,array[rid],'{}');
 select decision_id into new_decision from public.customer_transaction_work where record_id=rid;
 if not exists(select 1 from public.bookkeeping_decisions where id=new_decision and treatment='unresolved' and bookkeeping_nature is null) then raise exception 'Invented exception nature';end if;
 if not exists(select 1 from public.bookkeeping_review_events where bookkeeping_record_id=rid and based_on_decision_id=new_decision and reason='TRANSACTION_TYPE_UNCLEAR' and event_type='opened') then raise exception 'Missing material exception follow-up';end if;
 if (select count(*) from public.financial_transactions where business_id=bid)<>1 then raise exception 'Source changed';end if;
 response:=public.read_betti_work_inputs(bid,now());
 if jsonb_typeof(response#>'{context,catchUpEvents}') is distinct from 'array' then raise exception 'Atomic work inputs lost catch-up history';end if;
 perform set_config('writeoffs.test_owner',uid::text,true);perform set_config('writeoffs.test_other',other_uid::text,true);
 raise notice 'Catch-up stage database guards PASS';
end;$$;
set local role authenticated;
do $$begin
 if not exists(select 1 from public.betti_catch_up_events)then raise exception 'Owner journey read failed';end if;
 if has_table_privilege(current_user,'public.betti_catch_up_events','INSERT')then raise exception 'Direct journey writes exposed';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('writeoffs.test_other'),'role','authenticated','aal','aal2')::text,true);
 if exists(select 1 from public.betti_catch_up_events)then raise exception 'Cross tenant journey exposed';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('writeoffs.test_owner'),'role','authenticated','aal','aal1')::text,true);
 if exists(select 1 from public.betti_catch_up_events)then raise exception 'Journey MFA bypass';end if;
end;$$;
set local role anon;
do $$begin
 if has_table_privilege(current_user,'public.betti_catch_up_events','SELECT')then raise exception 'Anon journey exposed';end if;
end;$$;
rollback;

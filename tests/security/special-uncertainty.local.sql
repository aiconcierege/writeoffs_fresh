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
 values(tid,bid,aid,'evidence-local-source','csv','CHECK #104 - DESERT PRINT SHOP',3210,'2026-05-09');
 insert into public.bookkeeping_records(id,business_id,source_kind,ingestion_key,amount_cents,currency,occurred_on)
 values(rid,bid,'financial_transaction','evidence-local',3210,'USD','2026-05-09');
 insert into public.bookkeeping_financial_sources(business_id,bookkeeping_record_id,financial_transaction_id,provenance) values(bid,rid,tid,'system');
 insert into public.bookkeeping_decisions(id,business_id,bookkeeping_record_id,bookkeeping_nature,treatment,review_status,provenance)
 values(did,bid,rid,'refund','unresolved','needs_review','automation');
 perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','authenticated','aal','aal2')::text,true);
 perform public.set_financial_account_use(aid,'business_only',now(),gen_random_uuid());
 select id into use_id from public.current_financial_account_use where financial_account_id=aid;
 items:=jsonb_build_array(jsonb_build_object('recordId',rid,'decisionId',did,'reviewVersion',public.guided_purchase_version(rid),
  'accountUseVersion',use_id,'date','2026-05-09','amountCents',3210,'transactionId',tid,'merchant','Desert Print Shop'));
 select jsonb_agg(to_jsonb(d)) into before_decisions from public.bookkeeping_decisions d where business_id=bid;


 perform public.record_special_transaction(rid,did,request_id,'unsure',null,null);
 perform public.record_special_transaction(rid,did,request_id,'unsure',null,null);
 if (select count(*) from public.bookkeeping_special_events where business_id=bid and action='unsure')<>1 then raise exception 'Duplicate uncertainty';end if;
 if (select count(*) from public.bookkeeping_special_uncertainty_basis where business_id=bid)<>1 then raise exception 'Missing uncertainty evidence basis';end if;
 response:=public.read_betti_work_inputs(bid,now());
 if jsonb_array_length(response#>'{context,specialUncertainties}')<>1 then raise exception 'Uncertainty not projected';end if;
 if before_decisions is distinct from (select jsonb_agg(to_jsonb(d)) from public.bookkeeping_decisions d where business_id=bid) then raise exception 'Uncertainty changed financial decision';end if;
 -- New source evidence invalidates the hold, without changing the original
 -- customer response. Account-use evidence contributes to this fingerprint.
 perform public.set_financial_account_use(aid,'business_and_personal',now(),gen_random_uuid());
 response:=public.read_betti_work_inputs(bid,now());
 if jsonb_array_length(response#>'{context,specialUncertainties}')<>0 then raise exception 'Changed evidence remained suppressed';end if;
 raise notice 'Special uncertainty exact retry, unchanged books and changed-evidence revisit PASS';
end;$$;
rollback;

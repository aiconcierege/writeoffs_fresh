-- Entirely synthetic, rollback-only local PostgreSQL certification.
begin;
insert into public.categories(id,key,label) values(900000001,'advertising','Advertising') on conflict do nothing;
do $$ declare uid uuid:=gen_random_uuid(); other_uid uuid:=gen_random_uuid(); bid uuid; other_bid uuid;
 aid uuid:=gen_random_uuid(); tid uuid:=gen_random_uuid(); rid uuid:=gen_random_uuid(); did uuid:=gen_random_uuid();
 sweep_id uuid:=gen_random_uuid(); request_id uuid:=gen_random_uuid(); doc uuid:=gen_random_uuid(); use_id uuid; items jsonb; before_decisions jsonb;
 response jsonb; failed boolean; scope jsonb; receipt public.receipts%rowtype; receipt_result jsonb; n integer;
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

 -- A second purchase makes this a real grouped interaction and stale-last-item
 -- rollback test, not a single-row proxy for batching.
 for n in 1..7 loop
  tid:=gen_random_uuid(); rid:=gen_random_uuid(); did:=gen_random_uuid();
  insert into public.financial_transactions(id,business_id,financial_account_id,source_fingerprint,import_method,original_description,amount_cents,transaction_date)
   values(tid,bid,aid,'sweep-'||n,'csv','Synthetic business purchase',-1000,'2026-05-09');
  insert into public.bookkeeping_records(id,business_id,source_kind,ingestion_key,amount_cents,currency,occurred_on)
   values(rid,bid,'financial_transaction','sweep-'||n,-1000,'USD','2026-05-09');
  insert into public.bookkeeping_financial_sources(business_id,bookkeeping_record_id,financial_transaction_id,provenance) values(bid,rid,tid,'system');
  insert into public.bookkeeping_decisions(id,business_id,bookkeeping_record_id,bookkeeping_nature,treatment,review_status,provenance)
   values(did,bid,rid,'expense','business','not_required','automation');
  insert into public.bookkeeping_allocations(business_id,bookkeeping_record_id,bookkeeping_decision_id,allocation_kind,amount_cents,tax_category_key)
   values(bid,rid,did,'business',-1000,'advertising');
  items:=items||jsonb_build_array(jsonb_build_object('recordId',rid,'decisionId',did,'reviewVersion',public.guided_purchase_version(rid),
   'accountUseVersion',use_id,'date','2026-05-09','amountCents',-1000,'transactionId',tid,'merchant','Synthetic business purchase'));
 end loop;
 delete from public.bookkeeping_processing_jobs where business_id=bid; -- local synthetic fixtures only
 select jsonb_agg(to_jsonb(d) order by id) into before_decisions from public.bookkeeping_decisions d where business_id=bid;
 if exists(select 1 from public.customer_transaction_work w join public.businesses b on b.id=w.business_id
   join public.current_financial_account_use u on u.financial_account_id=w.account_id and u.business_id=w.business_id
   where w.business_id=bid and public.guided_purchase_version(w.record_id) is distinct from
    md5(jsonb_build_array(w.decision_id,w.has_receipt,w.receipt_unavailable,
      public.current_bookkeeping_evidence_fingerprint(w.business_id,w.record_id),u.id,b.catch_up_start_date,public.customer_coverage_start(b.id))::text))
 then raise exception 'Version algorithm changed'; end if;
 if has_function_privilege('authenticated','public.guided_purchase_version_from_row(public.customer_transaction_work)','EXECUTE')
 or has_function_privilege('anon','public.guided_purchase_version_from_row(public.customer_transaction_work)','EXECUTE')
 or has_function_privilege('service_role','public.guided_purchase_version_from_row(public.customer_transaction_work)','EXECUTE')
 then raise exception 'Untrusted caller can supply a fabricated snapshot'; end if;
 failed:=false;
 begin
  perform public.answer_betti_guided_work(sweep_id,'personal_exception_sweep','completed',jsonb_set(items,'{7,reviewVersion}','"stale"'),'{}');
 exception when others then failed:=true;end;
 if not failed or exists(select 1 from public.betti_guided_assertions where id=sweep_id) then raise exception 'Stale group did not roll back'; end if;
 response:=public.answer_betti_guided_work(sweep_id,'personal_exception_sweep','completed',items,'{}');
 if jsonb_array_length(response)<>8 or response<>public.answer_betti_guided_work(sweep_id,'personal_exception_sweep','completed',items,'{}')
 or (select count(*) from public.betti_guided_assertions where id=sweep_id)<>1
 then raise exception 'All-business sweep not exactly once'; end if;
 if before_decisions is distinct from (select jsonb_agg(to_jsonb(d) order by id) from public.bookkeeping_decisions d where business_id=bid)
 then raise exception 'All-business sweep changed bookkeeping'; end if;
 failed:=false;
 begin perform public.answer_betti_guided_work(sweep_id,'personal_exception_sweep','completed',items,jsonb_build_object(rid,'{"use":"personal"}'::jsonb));
 exception when others then failed:=true;end;
 if not failed then raise exception 'Changed retry accepted'; end if;
 -- Selected exceptions retain the existing financial correction path, while
 -- the all-business fast path must never swallow a supplied personal answer.
 begin
  perform public.answer_betti_guided_work(gen_random_uuid(),'personal_exception_sweep','completed',items,jsonb_build_object(rid,'{"use":"personal"}'::jsonb));
  if not exists(select 1 from public.customer_transaction_work where record_id=rid and treatment='personal') then raise exception 'Personal exception was ignored';end if;
  raise exception 'ROLLBACK_PERSONAL_CONTROL';
 exception when raise_exception then if sqlerrm<>'ROLLBACK_PERSONAL_CONTROL' then raise;end if;
 end;
 failed:=false;
 begin
  perform public.answer_betti_guided_work(gen_random_uuid(),'personal_exception_sweep','completed',items,jsonb_build_object(rid,'{"use":"business"}'::jsonb));
 exception when others then failed:=true;end;
 if not failed or before_decisions is distinct from (select jsonb_agg(to_jsonb(d) order by id) from public.bookkeeping_decisions d where business_id=bid)
 then raise exception 'Invalid exception changed financial facts';end if;
 response:=public.answer_betti_evidence_opportunity(request_id,items,'none');
 if response<>public.answer_betti_evidence_opportunity(request_id,items,'none') then raise exception 'Receipt retry changed';end if;
 if (select count(*) from public.customer_transaction_work where business_id=bid and receipt_unavailable)<>8 then raise exception 'Not all documentation states persisted';end if;
 if before_decisions is distinct from (select jsonb_agg(to_jsonb(d) order by id) from public.bookkeeping_decisions d where business_id=bid)
 then raise exception 'Receipt availability changed financial decisions';end if;
end; $$;
rollback;

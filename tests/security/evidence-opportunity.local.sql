-- Entirely synthetic, rollback-only local PostgreSQL certification.
begin;
insert into public.categories(id,key,label) values(900000001,'advertising','Advertising') on conflict do nothing;
do $$ declare uid uuid:=gen_random_uuid(); other_uid uuid:=gen_random_uuid(); bid uuid; other_bid uuid;
 aid uuid:=gen_random_uuid(); tid uuid:=gen_random_uuid(); rid uuid:=gen_random_uuid(); did uuid:=gen_random_uuid();
 request_id uuid:=gen_random_uuid(); doc uuid:=gen_random_uuid(); use_id uuid; items jsonb; before_decisions jsonb;
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
 -- Independent subtransaction controls preserve the same starting facts.
 begin
  response:=public.answer_betti_evidence_opportunity(request_id,items,'later');
  if response<>public.answer_betti_evidence_opportunity(request_id,items,'later')
   or not exists(select 1 from public.betti_guided_assertions where id=request_id and disposition='deferred')
   or exists(select 1 from public.customer_transaction_work where record_id=rid and receipt_unavailable)
  then raise exception 'Deferral fabricated unavailable documentation';end if;
  raise exception 'ROLLBACK_LATER_CONTROL';
 exception when raise_exception then if sqlerrm<>'ROLLBACK_LATER_CONTROL' then raise;end if;
 end;
 begin
  perform public.register_customer_document(doc,repeat('e',64),'support.pdf','application/pdf',100);
  response:=public.answer_betti_evidence_opportunity(request_id,items,'provided',array[doc]);
  if response<>public.answer_betti_evidence_opportunity(request_id,items,'provided',array[doc])
   or exists(select 1 from public.customer_transaction_work where record_id=rid and receipt_unavailable)
   or before_decisions is distinct from (select jsonb_agg(to_jsonb(d)) from public.bookkeeping_decisions d where business_id=bid)
  then raise exception 'Upload acknowledgment changed books or documentation facts';end if;
  raise exception 'ROLLBACK_PROVIDED_CONTROL';
 exception when raise_exception then if sqlerrm<>'ROLLBACK_PROVIDED_CONTROL' then raise;end if;
 end;
 failed:=false;
 begin perform public.answer_betti_evidence_opportunity(request_id,items,'provided',array[gen_random_uuid()]);
 exception when others then failed:=true;end;
 if not failed then raise exception 'Unowned document accepted';end if;
 response:=public.answer_betti_evidence_opportunity(request_id,items,'none');
 if response<>public.answer_betti_evidence_opportunity(request_id,items,'none') then raise exception 'Retry not idempotent';end if;
 if (select count(*) from public.betti_guided_assertions where business_id=bid)<>1 then raise exception 'Duplicate acknowledgment';end if;
 if before_decisions is distinct from (select jsonb_agg(to_jsonb(d)) from public.bookkeeping_decisions d where business_id=bid)
  then raise exception 'Receipt availability changed financial decisions';end if;
 if not exists(select 1 from public.customer_transaction_work where record_id=rid and receipt_unavailable)
  then raise exception 'None did not record documentation state';end if;
 failed:=false;
 begin perform public.answer_betti_evidence_opportunity(request_id,items,'later');exception when others then failed:=true;end;
 if not failed then raise exception 'Changed retry accepted';end if;
 failed:=false;
 begin perform public.answer_betti_evidence_opportunity(gen_random_uuid(),items,'invented');exception when others then failed:=true;end;
 if not failed then raise exception 'Invalid response accepted';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',other_uid,'role','authenticated','aal','aal2')::text,true);
 failed:=false;
 begin perform public.answer_betti_evidence_opportunity(gen_random_uuid(),items,'later');exception when others then failed:=true;end;
 if not failed then raise exception 'Cross-tenant acknowledgment accepted';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','authenticated','aal','aal1')::text,true);
 failed:=false;
 begin perform public.answer_betti_evidence_opportunity(gen_random_uuid(),items,'later');exception when others then failed:=true;end;
 if not failed then raise exception 'MFA bypass accepted';end if;
 if has_function_privilege('anon','public.answer_betti_evidence_opportunity(uuid,jsonb,text,uuid[])','EXECUTE')
  or has_table_privilege('anon','public.receipt_source_regions','SELECT') then raise exception 'Anonymous access';end if;
 -- Later documents supersede missing-document availability, accumulate evidence,
 -- and never create duplicate financial activity for an already linked expense.
 perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','authenticated','aal','aal2')::text,true);
 for n in 1..2 loop
  receipt:=public.register_bookkeeping_receipt(gen_random_uuid(),repeat(n::text,64),
   'receipts/'||uid::text||'/'||repeat(n::text,64),'supporting.pdf','application/pdf',42);
  receipt_result:=public.record_bookkeeping_receipt_extraction(receipt.id,'local:v1','google_vision','Desert Print Shop','2026-05-09',21840,
   '{"extractedText":"Desert Print Shop — 500 business cards and promotional flyers"}');
  if receipt_result->>'state'<>'matched' or receipt_result->>'record_id'<>rid::text
   then raise exception 'Supporting receipt did not match: %',receipt_result;end if;
 end loop;
 if (select count(*) from public.bookkeeping_document_links where business_id=bid and bookkeeping_record_id=rid and revoked_at is null)<>2
  then raise exception 'Supporting documents did not accumulate';end if;
 if exists(select 1 from public.bookkeeping_records where business_id=bid and source_kind='receipt')
  then raise exception 'Supporting document created duplicate expense';end if;
 if not exists(select 1 from public.customer_transaction_work where record_id=rid and has_receipt and not receipt_unavailable)
  then raise exception 'Late receipt did not update documentation state';end if;
 if (select sum(amount_cents) from public.bookkeeping_allocations where business_id=bid)<>-21840 then raise exception 'Expense double counted';end if;
end; $$;
rollback;

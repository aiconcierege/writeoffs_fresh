-- Entirely synthetic, rollback-only local PostgreSQL certification.
begin;
insert into public.categories(id,key,label) values(900000001,'advertising','Advertising') on conflict do nothing;
do $$ declare uid uuid:=gen_random_uuid(); other_uid uuid:=gen_random_uuid(); bid uuid; other_bid uuid;
 aid uuid:=gen_random_uuid(); tid uuid:=gen_random_uuid(); rid uuid:=gen_random_uuid(); did uuid:=gen_random_uuid();
 request_id uuid:=gen_random_uuid(); doc uuid:=gen_random_uuid(); use_id uuid; items jsonb; before_decisions jsonb;
 response jsonb; failed boolean; scope jsonb; receipt public.receipts%rowtype; receipt_result jsonb; n integer; scope_key text:=repeat('a',64); new_decision uuid; event_id uuid; event_row public.bookkeeping_review_events%rowtype; remembered_id uuid; tid2 uuid:=gen_random_uuid(); rid2 uuid:=gen_random_uuid(); did2 uuid:=gen_random_uuid(); fingerprint text;
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
 values(tid,bid,aid,'evidence-local-source','csv','STRIPE PAYOUT',73544,'2026-05-09');
 insert into public.bookkeeping_records(id,business_id,source_kind,ingestion_key,amount_cents,currency,occurred_on)
 values(rid,bid,'financial_transaction','evidence-local',73544,'USD','2026-05-09');
 insert into public.bookkeeping_financial_sources(business_id,bookkeeping_record_id,financial_transaction_id,provenance) values(bid,rid,tid,'system');
 insert into public.bookkeeping_decisions(id,business_id,bookkeeping_record_id,bookkeeping_nature,treatment,review_status,provenance)
 values(did,bid,rid,null,'unresolved','needs_review','automation');
 perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','authenticated','aal','aal2')::text,true);
 perform public.set_financial_account_use(aid,'business_only',now(),gen_random_uuid());
 select id into use_id from public.current_financial_account_use where financial_account_id=aid;

 event_id:=public.open_bookkeeping_review_issue_v2(bid,rid,did,'TRANSACTION_TYPE_UNCLEAR','synthetic-payout','synthetic-payout-v1',
 jsonb_build_object('schemaVersion',1,'reason','TRANSACTION_TYPE_UNCLEAR','factType','money_in_source','understanding',jsonb_build_object('kind','customer_payment_candidate','counterparty','STRIPE','sourceId',tid)));
 select * into event_row from public.bookkeeping_review_events where id=event_id;
 response:=public.answer_bookkeeping_transaction_type_review_issue(event_id,event_id,did,event_row.context_fingerprint,event_row.evidence_fingerprint,'{"schemaVersion":1,"activity":"earned_money"}');
 select id into remembered_id from public.current_recurring_payment_facts where business_id=bid and status='active';
 if remembered_id is null then raise exception 'Confirmed payout did not create reusable fact';end if;
 if not exists(select 1 from public.bookkeeping_recurring_payment_facts where id=remembered_id and source_answer_id=(response->>'answered_event_id')::uuid)then raise exception 'Answer lineage lost';end if;
 insert into public.financial_transactions(id,business_id,financial_account_id,source_fingerprint,import_method,original_description,amount_cents,transaction_date)
 values(tid2,bid,aid,'synthetic-payout-second','csv','STRIPE PAYOUT',12345,'2026-06-09');
 insert into public.bookkeeping_records(id,business_id,source_kind,ingestion_key,amount_cents,currency,occurred_on)
 values(rid2,bid,'financial_transaction','synthetic-payout-second',12345,'USD','2026-06-09');
 insert into public.bookkeeping_financial_sources(business_id,bookkeeping_record_id,financial_transaction_id,provenance) values(bid,rid2,tid2,'system');
 insert into public.bookkeeping_decisions(id,business_id,bookkeeping_record_id,bookkeeping_nature,treatment,review_status,provenance)
 values(did2,bid,rid2,null,'unresolved','needs_review','system');
 perform set_config('request.jwt.claims','{"role":"service_role"}',true);
 fingerprint:=public.current_bookkeeping_evidence_fingerprint(bid,rid2);
 failed:=false;begin perform public.apply_remembered_payment(bid,rid2,did2,remembered_id,'stale');exception when others then failed:=true;end;
 if not failed then raise exception 'Stale evidence accepted';end if;
 new_decision:=public.apply_remembered_payment(bid,rid2,did2,remembered_id,fingerprint);
 if not exists(select 1 from public.bookkeeping_decisions where id=new_decision and bookkeeping_nature='business_income' and treatment='business')then raise exception 'Payout treatment wrong';end if;
 if (select sum(amount_cents) from public.bookkeeping_allocations where bookkeeping_decision_id=new_decision)<>12345 then raise exception 'Payout amount wrong';end if;
 if not exists(select 1 from public.bookkeeping_recurring_payment_dependencies where decision_id=new_decision and fact_id=remembered_id)then raise exception 'Dependency missing';end if;
 failed:=false;begin perform public.apply_remembered_payment(bid,rid2,did2,remembered_id,fingerprint);exception when others then failed:=true;end;
 if not failed then raise exception 'Stale repeat created another decision';end if;
 if (select count(*) from public.bookkeeping_decisions where bookkeeping_record_id=rid2)<>2 then raise exception 'Duplicate decision';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',other_uid,'role','authenticated','aal','aal2')::text,true);
 failed:=false;begin perform public.stop_remembered_payment(remembered_id,gen_random_uuid());exception when others then failed:=true;end;
 if not failed then raise exception 'Other customer revoked rule';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','authenticated','aal','aal2')::text,true);
 perform public.stop_remembered_payment(remembered_id,request_id);
 perform public.stop_remembered_payment(remembered_id,request_id);
 if exists(select 1 from public.current_recurring_payment_facts where business_id=bid and status='active')then raise exception 'Revoked rule remains active';end if;
 if (select count(*) from public.bookkeeping_decisions where bookkeeping_record_id=rid2)<>2 then raise exception 'Revocation changed existing books';end if;
 perform set_config('writeoffs.test_owner',uid::text,true);perform set_config('writeoffs.test_other',other_uid::text,true);
 raise notice 'Recurring payment database certification PASS';
end;$$;
set local role authenticated;
do $$begin
 if (select count(*) from public.bookkeeping_recurring_payment_facts)<>2 then raise exception 'Owner fact read failed';end if;
 if has_table_privilege(current_user,'public.bookkeeping_recurring_payment_facts','INSERT') then raise exception 'Direct fact writes exposed';end if;
 if has_function_privilege(current_user,'public.apply_remembered_payment(uuid,uuid,uuid,uuid,text)','EXECUTE')then raise exception 'Worker write exposed';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('writeoffs.test_other'),'role','authenticated','aal','aal2')::text,true);
 if exists(select 1 from public.bookkeeping_recurring_payment_facts)then raise exception 'Cross tenant facts exposed';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('writeoffs.test_owner'),'role','authenticated','aal','aal1')::text,true);
 if exists(select 1 from public.bookkeeping_recurring_payment_facts)then raise exception 'MFA bypass';end if;
end;$$;
set local role anon;
do $$begin
 if has_table_privilege(current_user,'public.bookkeeping_recurring_payment_facts','SELECT')or has_table_privilege(current_user,'public.bookkeeping_recurring_payment_dependencies','SELECT')then raise exception 'Anon facts exposed';end if;
end;$$;
rollback;

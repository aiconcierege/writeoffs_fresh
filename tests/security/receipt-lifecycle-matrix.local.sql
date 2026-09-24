-- Synthetic canonical-function tests, not a claim of live OCR.
begin;
insert into public.categories(key,label) values('office-expense','Office expenses') on conflict(key) do nothing;
do $$ declare uid uuid:=gen_random_uuid(); bid uuid; aid uuid:=gen_random_uuid(); tid uuid:=gen_random_uuid(); rid uuid:=gen_random_uuid(); other_rid uuid:=gen_random_uuid();
 receipt public.receipts%rowtype; extra public.receipts%rowtype; link public.bookkeeping_document_links%rowtype;
 customer_receipt boolean:=coalesce(current_setting('writeoffs.test.customer_receipt',true),'false')::boolean;
 result jsonb; receipt_record uuid; assessed uuid; convergence uuid; event_types text[];associated public.bookkeeping_records%rowtype;failed boolean;
begin
 insert into auth.users(id,email,raw_user_meta_data) values(uid,'receipt-matrix@local.invalid','{"synthetic":true}');
 select id into bid from public.businesses where owner_user_id=uid;
 perform set_config('request.jwt.claims','{"role":"service_role"}',true);
 perform public.create_business_membership_grant(bid,'business',now()-interval '1 day',null,'receipt-matrix','Synthetic receipt lifecycle','admin',null);
 insert into public.business_customer_setup(business_id,joined_month,grandfathered_start_date,timezone_name) values(bid,'2026-09-01','2026-01-01','UTC');
 update public.businesses set catch_up_start_date='2026-01-01' where id=bid;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','authenticated','aal','aal2')::text,true);
 receipt:=public.register_bookkeeping_receipt(gen_random_uuid(),repeat('1',64),'receipts/'||uid::text||'/'||repeat('1',64),'business-supplies.pdf','application/pdf',100);
 result:=public.record_bookkeeping_receipt_extraction(receipt.id,'matrix:v1','google_vision','Corner Supply','2026-05-19',1234,'{"extractedText":"Supplies for business"}');
 if result->>'state'<>'retained' then raise exception 'Unmatched receipt was not retained';end if;
 receipt_record:=(result->>'record_id')::uuid;
 if not exists(select 1 from public.bookkeeping_records where id=receipt_record and source_kind='receipt' and amount_cents=-1234)
  or exists(select 1 from public.bookkeeping_financial_sources where bookkeeping_record_id=receipt_record)
 then raise exception 'Receipt existence depended on bank activity';end if;
 extra:=public.register_bookkeeping_receipt(gen_random_uuid(),repeat('1',64),'receipts/'||uid::text||'/'||repeat('1',64),'business-supplies.pdf','application/pdf',100);
 if extra.id<>receipt.id then raise exception 'Duplicate upload created another receipt';end if;
 perform public.record_bookkeeping_receipt_extraction(receipt.id,'matrix:v1','google_vision','Corner Supply','2026-05-19',1234,'{"extractedText":"Supplies for business"}');
 if (select count(*) from public.bookkeeping_records where business_id=bid)<>1 then raise exception 'Extraction retry duplicated activity';end if;
 -- Receipt was assessed before the later bank import, not merely retained.
 insert into public.bookkeeping_decisions(business_id,bookkeeping_record_id,supersedes_decision_id,bookkeeping_nature,treatment,review_status,provenance,reason,actor_user_id)
 select bid,receipt_record,id,'expense','business','resolved',case when customer_receipt then 'user' else 'automation' end,'Evidence supports business supplies',case when customer_receipt then uid else null end from public.bookkeeping_decisions where bookkeeping_record_id=receipt_record returning id into assessed;
 insert into public.bookkeeping_allocations(business_id,bookkeeping_record_id,bookkeeping_decision_id,allocation_kind,amount_cents,tax_category_key)
 values(bid,receipt_record,assessed,'business',-1234,'office-expense');
 set constraints all immediate;
 set constraints all deferred;
 insert into public.financial_accounts(id,business_id,institution_name,display_name,account_type) values(aid,bid,'Synthetic','Checking','checking');
 insert into public.financial_transactions(id,business_id,financial_account_id,source_fingerprint,import_method,original_description,amount_cents,transaction_date)
 values(tid,bid,aid,'later-bank-source','csv','Corner Supply',-1234,'2026-05-19');
 if customer_receipt then
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  associated:=public.ensure_bookkeeping_record(bid,'financial_transaction',tid,'import','later-bank-customer',-1234,'USD','2026-05-19');
  if associated.id<>receipt_record or (select count(*) from public.bookkeeping_records where business_id=bid)<>1 then raise exception 'Later bank source duplicated a customer-treated receipt';end if;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','authenticated','aal','aal2')::text,true);
  failed:=false;begin perform public.associate_later_bank_receipt(gen_random_uuid(),tid);exception when others then failed:=true;end;
  if not failed then raise exception 'Cross-tenant association accepted';end if;
  perform public.ensure_initial_bookkeeping_decision(bid,associated.id);
  associated:=public.ensure_bookkeeping_record(bid,'financial_transaction',tid,'import','later-bank-customer',-1234,'USD','2026-05-19');
  if associated.id<>receipt_record or (select count(*) from public.bookkeeping_decisions where bookkeeping_record_id=receipt_record)<>2 then raise exception 'Association changed customer decision history';end if;
  if not exists(select 1 from public.bookkeeping_financial_sources where bookkeeping_record_id=receipt_record and financial_transaction_id=tid and revoked_at is null) then raise exception 'Bank evidence not associated';end if;
  failed:=false;begin perform public.ensure_bookkeeping_record(bid,'financial_transaction',tid,'import','later-bank-customer',-1,'USD','2026-05-19');exception when others then failed:=true;end;
  if not failed then raise exception 'Changed source facts accepted';end if;
  return;
 end if;
 insert into public.bookkeeping_records(id,business_id,source_kind,ingestion_key,amount_cents,currency,occurred_on)
 values(rid,bid,'financial_transaction','later-bank',-1234,'USD','2026-05-19'),(other_rid,bid,'manual','rematch-control',-1500,'USD','2026-05-20');
 -- Match the canonical ingestion boundary: every new financial record starts
 -- with its system unresolved decision before receipt convergence is attempted.
 insert into public.bookkeeping_decisions(business_id,bookkeeping_record_id,treatment,review_status,provenance)
 values(bid,rid,'unresolved','needs_review','system'),(bid,other_rid,'unresolved','needs_review','system');
 insert into public.bookkeeping_financial_sources(business_id,bookkeeping_record_id,financial_transaction_id,provenance) values(bid,rid,tid,'system');
 perform set_config('request.jwt.claims','{"role":"service_role"}',true);
 convergence:=public.attempt_bookkeeping_receipt_convergence(bid,rid);
 if customer_receipt then
  if convergence is not null or not exists(select 1 from public.bookkeeping_decisions where id=assessed and provenance='user') then raise exception 'Automatic convergence overrode customer treatment';end if;
  return;
 end if;
 if convergence is null or not exists(select 1 from public.current_bookkeeping_record_convergences where business_id=bid and survivor_record_id=rid and absorbed_record_id=receipt_record)
 then raise exception 'Later bank activity did not converge with receipt-only source';end if;
 if (select sum(a.amount_cents) from public.bookkeeping_allocations a join public.bookkeeping_decisions d on d.id=a.bookkeeping_decision_id
 where a.business_id=bid and a.bookkeeping_record_id=rid and not exists(select 1 from public.bookkeeping_decisions n where n.supersedes_decision_id=d.id))<>-1234
 then raise exception 'Established expense disappeared during convergence';end if;
 if not exists(select 1 from public.bookkeeping_decisions where id=assessed) then raise exception 'Receipt decision history erased';end if;
 if convergence<>public.attempt_bookkeeping_receipt_convergence(bid,rid) then raise exception 'Convergence retry duplicated history';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','authenticated','aal','aal2')::text,true);
 extra:=public.register_bookkeeping_receipt(gen_random_uuid(),repeat('2',64),'receipts/'||uid::text||'/'||repeat('2',64),'supporting-note.pdf','application/pdf',100);
 link:=public.attach_bookkeeping_receipt_journey(other_rid,extra.id);
 perform public.revoke_bookkeeping_receipt_journey(link.id,'Wrong transaction selected in synthetic control');
 link:=public.attach_bookkeeping_receipt_journey(rid,extra.id);
 if link.bookkeeping_record_id<>rid then raise exception 'Rematch failed';end if;
 select array_agg(event_type order by sequence_number) into event_types from public.bookkeeping_receipt_events where receipt_id=extra.id;
 if event_types<>array['uploaded','matched','unmatched','matched'] then raise exception 'Rematch history not preserved';end if;
 -- Convergence preserves the original receipt link on its historical record;
 -- the canonical reader follows both evidence identities to one survivor.
 if (select count(*) from public.bookkeeping_document_links where business_id=bid and bookkeeping_record_id in(rid,receipt_record) and revoked_at is null)<>2 then raise exception 'Second supporting document duplicated or replaced the first';end if;
 extra:=public.register_bookkeeping_receipt(gen_random_uuid(),repeat('3',64),'receipts/'||uid::text||'/'||repeat('3',64),'irrelevant.pdf','application/pdf',100);
 perform public.discard_unmatched_bookkeeping_receipt(extra.id);
 perform public.discard_unmatched_bookkeeping_receipt(extra.id);
 if exists(select 1 from public.bookkeeping_records where business_id=bid and ingestion_key='receipt:'||extra.id::text)
  or (select count(*) from public.bookkeeping_receipt_events where receipt_id=extra.id and event_type='discarded')<>1
 then raise exception 'Discard duplicated facts or created an expense';end if;
end; $$;
set constraints all immediate;
rollback;

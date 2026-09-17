-- Dedicated staging only; execute inside BEGIN ... ROLLBACK with the migration.
-- Entirely transaction-local synthetic tenants, never a manual customer.
insert into auth.users(id,email,raw_user_meta_data)
values('8777c5e3-b615-4acd-a4dd-01056a1251dd','shared-evidence-a@example.invalid','{}'),
 ('be9ec1e8-7d61-422c-a20c-60d589440b04','shared-evidence-b@example.invalid','{}');
update public.businesses set id='8205b373-c03f-4099-a3ef-1b57b48fff2d' where owner_user_id='8777c5e3-b615-4acd-a4dd-01056a1251dd';
update public.businesses set id='6fe00fc0-16f9-4966-b4b5-ccad657aedfc' where owner_user_id='be9ec1e8-7d61-422c-a20c-60d589440b04';
insert into public.receipts(id,business_id,user_id,storage_path,mime_type,bytes)
values('f1000000-0000-4000-8000-000000000001','8205b373-c03f-4099-a3ef-1b57b48fff2d',
 '8777c5e3-b615-4acd-a4dd-01056a1251dd','isolated-rollback/no-object','image/png',1);
insert into public.bookkeeping_records(id,business_id,source_kind,ingestion_key,amount_cents,currency,occurred_on)
values('f2000000-0000-4000-8000-000000000001','8205b373-c03f-4099-a3ef-1b57b48fff2d','manual','shared-evidence-rollback',-954,'USD','2026-09-08');
insert into public.bookkeeping_decisions(id,business_id,bookkeeping_record_id,bookkeeping_nature,treatment,review_status,provenance,business_purpose,actor_user_id)
values('f3000000-0000-4000-8000-000000000001','8205b373-c03f-4099-a3ef-1b57b48fff2d',
 'f2000000-0000-4000-8000-000000000001','expense','business','needs_review','user','food','8777c5e3-b615-4acd-a4dd-01056a1251dd');
insert into public.bookkeeping_allocations(business_id,bookkeeping_record_id,bookkeeping_decision_id,allocation_kind,amount_cents,tax_category_key)
values('8205b373-c03f-4099-a3ef-1b57b48fff2d','f2000000-0000-4000-8000-000000000001','f3000000-0000-4000-8000-000000000001','business',-954,'meals');
insert into public.bookkeeping_document_links(business_id,bookkeeping_record_id,receipt_id,provenance)
values('8205b373-c03f-4099-a3ef-1b57b48fff2d','f2000000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000001','automation');
insert into public.bookkeeping_receipt_extractions(id,business_id,receipt_id,extraction_key,provider,merchant,occurred_on,total_amount_cents,raw_payload,quality_status,quality_policy_version,created_at)
values('f4000000-0000-4000-8000-000000000001','8205b373-c03f-4099-a3ef-1b57b48fff2d','f1000000-0000-4000-8000-000000000001',
 'ocr-one','google_vision','Independent Restaurant','2026-09-08',954,'{"extractedText":"Restaurant Coffee Sandwich"}','usable','test:v1',now()-interval '1 minute'),
 ('f4000000-0000-4000-8000-000000000002','8205b373-c03f-4099-a3ef-1b57b48fff2d','f1000000-0000-4000-8000-000000000001',
 'ocr-two','google_vision','Independent Restaurant','2026-09-08',954,'{"extractedText":"Restaurant Coffee Sandwich corrected"}','usable','test:v1',now());
do $$ begin
 if (select count(*) from public.current_bookkeeping_receipt_extractions where receipt_id='f1000000-0000-4000-8000-000000000001')<>1
 then raise exception 'latest extraction view duplicated'; end if;
 if not exists(select 1 from public.current_bookkeeping_receipt_extractions where id='f4000000-0000-4000-8000-000000000002')
 then raise exception 'latest correction not selected'; end if;
 if (select count(*) from public.bookkeeping_processing_jobs where bookkeeping_record_id='f2000000-0000-4000-8000-000000000001'
 and target_fingerprint like '%:receipt-extraction:%')<>2 then raise exception 'extractions did not schedule bounded jobs'; end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"8777c5e3-b615-4acd-a4dd-01056a1251dd","role":"authenticated","aal":"aal2"}',true);
do $$ begin
 if (select count(*) from public.current_bookkeeping_receipt_extractions where receipt_id='f1000000-0000-4000-8000-000000000001')<>1
 then raise exception 'owner cannot read extraction'; end if;
end $$;
select set_config('request.jwt.claims','{"sub":"be9ec1e8-7d61-422c-a20c-60d589440b04","role":"authenticated","aal":"aal2"}',true);
do $$ begin
 if exists(select 1 from public.current_bookkeeping_receipt_extractions where receipt_id='f1000000-0000-4000-8000-000000000001')
 then raise exception 'cross-tenant extraction leak'; end if;
end $$;
reset role;
-- Current customer-authored business use is a valid meal-context prerequisite.
insert into public.bookkeeping_business_context_assessments(id,business_id,bookkeeping_record_id,assessment_state,assessment_basis,economic_context,evaluator_version,evidence_fingerprint,evidence_references)
values('f5000000-0000-4000-8000-000000000001','8205b373-c03f-4099-a3ef-1b57b48fff2d','f2000000-0000-4000-8000-000000000001',
 'customer_authoritative','customer_correction','restaurant_meal','bookkeeping-business-context:v1',repeat('a',64),'[]');
select public.open_bookkeeping_review_issue_v2('8205b373-c03f-4099-a3ef-1b57b48fff2d','f2000000-0000-4000-8000-000000000001',
 'f3000000-0000-4000-8000-000000000001','BUSINESS_PURPOSE_NEEDED','prior-purchase-description',repeat('d',64),
 '{"schemaVersion":1,"reason":"BUSINESS_PURPOSE_NEEDED","factType":"ordinary_expense_purpose"}');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"8777c5e3-b615-4acd-a4dd-01056a1251dd","role":"authenticated","aal":"aal2"}',true);
do $$ declare e public.bookkeeping_review_events%rowtype; begin
 select * into e from public.bookkeeping_review_events where issue_key='prior-purchase-description';
 perform public.answer_bookkeeping_business_purpose_review_issue(e.review_issue_id,e.id,e.based_on_decision_id,
 e.context_fingerprint,e.evidence_fingerprint,'{"schemaVersion":1,"businessPurpose":"food"}');
end $$;
reset role;
do $$ declare current_decision uuid; begin
 select id into current_decision from public.bookkeeping_decisions d where d.bookkeeping_record_id='f2000000-0000-4000-8000-000000000001'
 and not exists(select 1 from public.bookkeeping_decisions successor where successor.supersedes_decision_id=d.id);
 perform public.open_bookkeeping_review_issue_v2('8205b373-c03f-4099-a3ef-1b57b48fff2d','f2000000-0000-4000-8000-000000000001',
 current_decision,'BUSINESS_PURPOSE_NEEDED','shared-evidence-meal',repeat('b',64),
 '{"schemaVersion":1,"reason":"BUSINESS_PURPOSE_NEEDED","factType":"meal_attendee_relationship","businessContextAssessmentId":"f5000000-0000-4000-8000-000000000001"}');
end $$;
do $$ declare prior public.bookkeeping_review_events%rowtype; refreshed uuid; retried uuid; begin
 select * into prior from public.bookkeeping_review_events where issue_key='shared-evidence-meal';
 refreshed:=public.open_bookkeeping_review_issue_v2(prior.business_id,prior.bookkeeping_record_id,prior.based_on_decision_id,
 prior.reason,prior.issue_key,repeat('e',64),prior.question_context);
 retried:=public.open_bookkeeping_review_issue_v2(prior.business_id,prior.bookkeeping_record_id,prior.based_on_decision_id,
 prior.reason,prior.issue_key,repeat('e',64),prior.question_context);
 if refreshed=prior.id or retried<>refreshed or not exists(select 1 from public.bookkeeping_review_events
 where id=refreshed and review_issue_id=prior.review_issue_id and supersedes_event_id=prior.id and event_type='reopened')
 then raise exception 'evidence refresh lost stable identity or idempotency'; end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"8777c5e3-b615-4acd-a4dd-01056a1251dd","role":"authenticated","aal":"aal2"}',true);
do $$ declare e public.bookkeeping_review_events%rowtype; result jsonb; begin
 select * into e from public.bookkeeping_review_events x where issue_key='shared-evidence-meal'
 and not exists(select 1 from public.bookkeeping_review_events successor where successor.supersedes_event_id=x.id);
 result:=public.answer_bookkeeping_business_context_meal_issue(e.review_issue_id,e.id,e.based_on_decision_id,
 e.context_fingerprint,e.evidence_fingerprint,'Client Alex','meal-answer-understanding:v1','Client Alex',null);
 if result->>'remaining_fact_type' is distinct from 'receipt_meal_business_purpose' then
 raise exception 'food description incorrectly accepted as business-meal purpose'; end if;
 select * into e from public.bookkeeping_review_events where id=(result->>'follow_up_event_id')::uuid;
 perform public.answer_bookkeeping_business_purpose_review_issue(e.review_issue_id,e.id,e.based_on_decision_id,
 e.context_fingerprint,e.evidence_fingerprint,'{"schemaVersion":1,"businessPurpose":"Discussed project milestones with client"}');
end $$;
reset role;
-- Reassessment retries cannot reopen an answered issue.
do $$ declare event_id uuid; current_decision uuid; begin
 select id into current_decision from public.bookkeeping_decisions d where d.bookkeeping_record_id='f2000000-0000-4000-8000-000000000001'
 and not exists(select 1 from public.bookkeeping_decisions successor where successor.supersedes_decision_id=d.id);
 event_id:=public.open_bookkeeping_review_issue_v2('8205b373-c03f-4099-a3ef-1b57b48fff2d','f2000000-0000-4000-8000-000000000001',
 current_decision,'BUSINESS_PURPOSE_NEEDED','shared-evidence-meal',repeat('c',64),
 '{"factType":"meal_attendee_relationship"}');
 if (select event_type from public.bookkeeping_review_events where id=event_id)<>'resolved' then raise exception 'answered question reopened'; end if;
end $$;
do $$ declare current_decision uuid; opened uuid; skipped uuid; retried uuid; begin
 select id into current_decision from public.bookkeeping_decisions d where d.bookkeeping_record_id='f2000000-0000-4000-8000-000000000001'
 and not exists(select 1 from public.bookkeeping_decisions successor where successor.supersedes_decision_id=d.id);
 opened:=public.open_bookkeeping_review_issue_v2('8205b373-c03f-4099-a3ef-1b57b48fff2d','f2000000-0000-4000-8000-000000000001',
 current_decision,'BUSINESS_PURPOSE_NEEDED','deferred-evidence-check',repeat('f',64),'{"factType":"meal_attendee_relationship"}');
 skipped:=public.skip_bookkeeping_review_issue('8205b373-c03f-4099-a3ef-1b57b48fff2d',opened,opened,now()+interval '1 day');
 retried:=public.open_bookkeeping_review_issue_v2('8205b373-c03f-4099-a3ef-1b57b48fff2d','f2000000-0000-4000-8000-000000000001',
 current_decision,'BUSINESS_PURPOSE_NEEDED','deferred-evidence-check',repeat('0',64),'{"factType":"meal_attendee_relationship"}');
 if retried<>skipped then raise exception 'evidence refresh reopened customer deferral'; end if;
end $$;
select 'shared_receipt_evidence_rollback_passed' as result;

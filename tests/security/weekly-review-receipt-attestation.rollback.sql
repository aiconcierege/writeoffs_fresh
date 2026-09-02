-- Run after the receipt-attestation migration in the same transaction; caller rolls back.
insert into public.financial_accounts(id,business_id,institution_name,display_name,account_type)
values('53000000-0000-4000-8000-000000000001','8205b373-c03f-4099-a3ef-1b57b48fff2d',
 'Rollback Bank','Receipt attestation','checking');
insert into public.financial_transactions(id,business_id,financial_account_id,source_fingerprint,import_method,
 merchant_name,original_description,amount_cents,transaction_date)
values
 ('53000000-0000-4000-8000-000000000002','8205b373-c03f-4099-a3ef-1b57b48fff2d',
  '53000000-0000-4000-8000-000000000001','receipt-attestation-yes','csv','SUPPLY YES','SUPPLY YES',-4716,'2099-02-02'),
 ('53000000-0000-4000-8000-000000000003','8205b373-c03f-4099-a3ef-1b57b48fff2d',
  '53000000-0000-4000-8000-000000000001','receipt-attestation-no','csv','SUPPLY NO','SUPPLY NO',-2275,'2099-02-03');
insert into public.bookkeeping_records(id,business_id,source_kind,ingestion_key,amount_cents,currency,occurred_on)
values
 ('53000000-0000-4000-8000-000000000004','8205b373-c03f-4099-a3ef-1b57b48fff2d','financial_transaction','rollback-receipt-yes',-4716,'USD','2099-02-02'),
 ('53000000-0000-4000-8000-000000000005','8205b373-c03f-4099-a3ef-1b57b48fff2d','financial_transaction','rollback-receipt-no',-2275,'USD','2099-02-03');
insert into public.bookkeeping_financial_sources(id,business_id,bookkeeping_record_id,financial_transaction_id,provenance)
values
 ('53000000-0000-4000-8000-000000000006','8205b373-c03f-4099-a3ef-1b57b48fff2d','53000000-0000-4000-8000-000000000004','53000000-0000-4000-8000-000000000002','import'),
 ('53000000-0000-4000-8000-000000000007','8205b373-c03f-4099-a3ef-1b57b48fff2d','53000000-0000-4000-8000-000000000005','53000000-0000-4000-8000-000000000003','import');
insert into public.bookkeeping_decisions(id,business_id,bookkeeping_record_id,bookkeeping_nature,treatment,
 review_status,provenance,reason)
values
 ('53000000-0000-4000-8000-000000000008','8205b373-c03f-4099-a3ef-1b57b48fff2d','53000000-0000-4000-8000-000000000004','expense','mixed_use','resolved','automation','Established mixed supplies.'),
 ('53000000-0000-4000-8000-000000000009','8205b373-c03f-4099-a3ef-1b57b48fff2d','53000000-0000-4000-8000-000000000005','expense','business','resolved','automation','Established supplies.');
insert into public.bookkeeping_allocations(id,business_id,bookkeeping_record_id,bookkeeping_decision_id,
 allocation_kind,amount_cents,tax_category_key)
values
 ('53000000-0000-4000-8000-000000000010','8205b373-c03f-4099-a3ef-1b57b48fff2d','53000000-0000-4000-8000-000000000004','53000000-0000-4000-8000-000000000008','business',-3000,'supplies'),
 ('53000000-0000-4000-8000-000000000011','8205b373-c03f-4099-a3ef-1b57b48fff2d','53000000-0000-4000-8000-000000000005','53000000-0000-4000-8000-000000000009','business',-2275,'supplies');
insert into public.bookkeeping_allocations(id,business_id,bookkeeping_record_id,bookkeeping_decision_id,
 allocation_kind,amount_cents)
values('53000000-0000-4000-8000-000000000017','8205b373-c03f-4099-a3ef-1b57b48fff2d',
 '53000000-0000-4000-8000-000000000004','53000000-0000-4000-8000-000000000008','personal',-1716);

insert into public.business_review_cadence_events(id,business_id,check_in_weekday,timezone_name,effective_from,provenance)
values('53000000-0000-4000-8000-000000000012','8205b373-c03f-4099-a3ef-1b57b48fff2d',6,'America/Phoenix','2099-01-01','system');
insert into public.bookkeeping_review_periods(id,business_id,period_start,period_end,check_in_date,cadence_event_id,membership_scope)
values('53000000-0000-4000-8000-000000000013','8205b373-c03f-4099-a3ef-1b57b48fff2d','2099-02-01','2099-02-07','2099-02-08','53000000-0000-4000-8000-000000000012','business');
insert into public.bookkeeping_weekly_review_workflow_events(id,business_id,review_period_id,stage,event_type,details,
 actor_user_id,request_id)
values('53000000-0000-4000-8000-000000000014','8205b373-c03f-4099-a3ef-1b57b48fff2d','53000000-0000-4000-8000-000000000013',
 'mixed','stage_completed','{"flowVersion":3,"resolvedCount":0}','8777c5e3-b615-4acd-a4dd-01056a1251dd','53000000-0000-4000-8000-000000000114');

insert into public.bookkeeping_documentation_events(id,business_id,bookkeeping_record_id,documentation_issue_id,
 sequence_number,event_type,reason,issue_key,context_fingerprint,evidence_fingerprint,question_context,provenance)
values
 ('53000000-0000-4000-8000-000000000015','8205b373-c03f-4099-a3ef-1b57b48fff2d','53000000-0000-4000-8000-000000000004','53000000-0000-4000-8000-000000000015',1,'request_opened','MISSING_SUPPORTING_DOCUMENTATION','rollback-receipt-yes','rollback-receipt-yes:v1',public.current_bookkeeping_evidence_fingerprint('8205b373-c03f-4099-a3ef-1b57b48fff2d','53000000-0000-4000-8000-000000000004'),'{"schemaVersion":1,"reason":"MISSING_SUPPORTING_DOCUMENTATION","requirement":{"type":"receipt_for_record","version":1}}','automation'),
 ('53000000-0000-4000-8000-000000000016','8205b373-c03f-4099-a3ef-1b57b48fff2d','53000000-0000-4000-8000-000000000005','53000000-0000-4000-8000-000000000016',1,'request_opened','MISSING_SUPPORTING_DOCUMENTATION','rollback-receipt-no','rollback-receipt-no:v1',public.current_bookkeeping_evidence_fingerprint('8205b373-c03f-4099-a3ef-1b57b48fff2d','53000000-0000-4000-8000-000000000005'),'{"schemaVersion":1,"reason":"MISSING_SUPPORTING_DOCUMENTATION","requirement":{"type":"receipt_for_record","version":1}}','automation');

set local role authenticated;
select set_config('request.jwt.claim.sub','8777c5e3-b615-4acd-a4dd-01056a1251dd',true);
do $$ declare denied boolean:=false; begin
 begin perform public.complete_weekly_missing_documentation_decision(
  '53000000-0000-4000-8000-000000000013','53000000-0000-4000-8000-000000000014',
  '53000000-0000-4000-8000-000000000099','include_missing',
  array['53000000-0000-4000-8000-000000000004'::uuid],false);
 exception when others then denied:=position('explicit receipt-unavailable business-use answer' in sqlerrm)>0; end;
 if not denied then raise exception 'legacy v3 include-missing path remained callable'; end if;
end $$;
do $$ declare yes_result jsonb; retry_result jsonb; no_result jsonb; yes_decision public.bookkeeping_decisions%rowtype;
 no_decision public.bookkeeping_decisions%rowtype; event_types text[]; denied boolean:=false; before_count integer; begin
 yes_result:=public.attest_weekly_receipt_unavailable('53000000-0000-4000-8000-000000000013',
  '53000000-0000-4000-8000-000000000014','53000000-0000-4000-8000-000000000100',
  '53000000-0000-4000-8000-000000000002','53000000-0000-4000-8000-000000000008',
  '53000000-0000-4000-8000-000000000015','business');
 retry_result:=public.attest_weekly_receipt_unavailable('53000000-0000-4000-8000-000000000013',
  '53000000-0000-4000-8000-000000000014','53000000-0000-4000-8000-000000000100',
  '53000000-0000-4000-8000-000000000002','53000000-0000-4000-8000-000000000008',
  '53000000-0000-4000-8000-000000000015','business');
 if yes_result->>'decision_id' is distinct from retry_result->>'decision_id'
  or retry_result->>'idempotent'<>'true' then raise exception 'receipt attestation retry was not idempotent'; end if;
 select * into yes_decision from public.bookkeeping_decisions where id=(yes_result->>'decision_id')::uuid;
 if yes_decision.treatment<>'mixed_use' or yes_decision.provenance<>'user'
  or yes_decision.supersedes_decision_id<>'53000000-0000-4000-8000-000000000008' then
  raise exception 'business attestation decision is incorrect'; end if;
 if not exists(select 1 from public.bookkeeping_allocations where bookkeeping_decision_id=yes_decision.id
  and allocation_kind='business' and amount_cents=-3000 and tax_category_key='supplies')
  or not exists(select 1 from public.bookkeeping_allocations where bookkeeping_decision_id=yes_decision.id
  and allocation_kind='personal' and amount_cents=-1716) then
  raise exception 'business allocation/category was not preserved'; end if;

 no_result:=public.attest_weekly_receipt_unavailable('53000000-0000-4000-8000-000000000013',
  '53000000-0000-4000-8000-000000000014','53000000-0000-4000-8000-000000000101',
  '53000000-0000-4000-8000-000000000003','53000000-0000-4000-8000-000000000009',
  '53000000-0000-4000-8000-000000000016','personal');
 select * into no_decision from public.bookkeeping_decisions where id=(no_result->>'decision_id')::uuid;
 if no_decision.treatment<>'personal' or no_decision.provenance<>'user'
  or not exists(select 1 from public.bookkeeping_allocations where bookkeeping_decision_id=no_decision.id
    and allocation_kind='personal' and amount_cents=-2275) then
  raise exception 'not-business attestation decision is incorrect'; end if;
 select array_agg(event_type order by sequence_number) into event_types
  from public.bookkeeping_documentation_events where documentation_issue_id='53000000-0000-4000-8000-000000000015';
 if event_types<>array['request_opened','receipt_lost','resolved'] then
  raise exception 'receipt-unavailable history is incorrect'; end if;

 select count(*) into before_count from public.bookkeeping_weekly_documentation_batches;
 begin perform public.attest_weekly_receipt_unavailable('53000000-0000-4000-8000-000000000013',
  '53000000-0000-4000-8000-000000000014','53000000-0000-4000-8000-000000000102',
  '53000000-0000-4000-8000-000000000002','53000000-0000-4000-8000-000000000008',
  '53000000-0000-4000-8000-000000000015','business');
 exception when others then denied:=true; end;
 if not denied or (select count(*) from public.bookkeeping_weekly_documentation_batches)<>before_count then
  raise exception 'stale attestation did not roll back atomically'; end if;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','be9ec1e8-7d61-422c-a20c-60d589440b04',true);
do $$ declare denied boolean:=false; begin
 begin perform public.attest_weekly_receipt_unavailable('53000000-0000-4000-8000-000000000013',
  '53000000-0000-4000-8000-000000000014','53000000-0000-4000-8000-000000000103',
  '53000000-0000-4000-8000-000000000002','53000000-0000-4000-8000-000000000008',
  '53000000-0000-4000-8000-000000000015','business');
 exception when others then denied:=true; end;
 if not denied then raise exception 'cross-tenant receipt attestation was allowed'; end if;
end $$;
reset role;

do $$ declare public_execute boolean; begin
 select exists(select 1 from pg_proc p cross join lateral
  aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl
  where p.oid='public.attest_weekly_receipt_unavailable(uuid,uuid,uuid,uuid,uuid,uuid,text)'::regprocedure
    and acl.grantee=0 and acl.privilege_type='EXECUTE') into public_execute;
 if public_execute
  or has_function_privilege('anon','public.attest_weekly_receipt_unavailable(uuid,uuid,uuid,uuid,uuid,uuid,text)','EXECUTE')
  or not has_function_privilege('authenticated','public.attest_weekly_receipt_unavailable(uuid,uuid,uuid,uuid,uuid,uuid,text)','EXECUTE')
  or has_function_privilege('service_role','public.attest_weekly_receipt_unavailable(uuid,uuid,uuid,uuid,uuid,uuid,text)','EXECUTE')
 then raise exception 'receipt attestation ACL contract is incorrect'; end if;
end $$;

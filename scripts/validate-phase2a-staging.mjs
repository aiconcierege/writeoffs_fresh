// Staging-only transactional proofs. No real customer is selected or modified.
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {homedir} from 'node:os'
import {join} from 'node:path'
assert(process.env.WRITEOFFS_ENVIRONMENT==='staging')
const f=JSON.parse(await readFile(process.argv.includes('--validation')?'/private/tmp/writeoffs-phase2a-validation.json':'/private/tmp/writeoffs-phase2a-fixture.json','utf8'))
const other=JSON.parse(await readFile('/private/tmp/writeoffs-check-in-fixture.json','utf8'))
for(const id of [f.userId,f.businessId,other.userId,other.businessId,...f.records.flatMap(r=>[r.recordId,r.decisionId,r.transactionId])])assert(/^[0-9a-f-]{36}$/.test(id))
const items=indices=>JSON.stringify(indices.map(i=>({recordId:f.records[i].recordId,decisionId:f.records[i].decisionId})))
const receipt='11111111-2222-4333-8444-555555555555'
const query=`begin;set local statement_timeout='45s';
do $$ begin if not exists(select 1 from auth.users where id='${f.userId}' and raw_user_meta_data->>'synthetic_phase2a_validation'='true') or not exists(select 1 from auth.users where id='${other.userId}' and raw_user_meta_data->>'synthetic_check_in_validation'='true') then raise exception 'synthetic fixtures required';end if;end $$;
insert into public.receipts(id,user_id,business_id,storage_path,mime_type,bytes,original_name) values('${receipt}','${f.userId}','${f.businessId}','synthetic/no-object.pdf','application/pdf',10,'Synthetic evidence');
select set_config('request.jwt.claims','{"sub":"${f.userId}","aal":"aal1","role":"authenticated"}',true);
set local role authenticated;
do $$ begin
 if exists(select 1 from public.customer_transaction_work) then raise exception 'aal1 read escaped';end if;
 begin perform public.apply_guided_review(gen_random_uuid(),'receipt_unavailable','receipts','${items([0])}');raise exception 'aal1 mutation escaped';exception when others then if sqlerrm='aal1 mutation escaped' then raise;end if;end;
end $$;reset role;
select set_config('request.jwt.claims','{"sub":"${f.userId}","aal":"aal2","role":"authenticated"}',true);set local role authenticated;
do $$ declare before_count int; after_count int; answer_count int; request_id uuid:=gen_random_uuid(); result jsonb; again jsonb; removal jsonb; begin
 if not exists(select 1 from public.list_customer_transaction_work('receipt-only') where source_kind='receipt_evidence') then raise exception 'unmatched receipt omitted';end if;
 if (select count(*) from public.list_customer_transaction_work())<>51 then raise exception 'bounded page missing';end if;
 if exists(select 1 from public.list_customer_transaction_work() where business_id<>'${f.businessId}') then raise exception 'bounded query tenant escaped';end if;
 if exists(select 1 from public.customer_transaction_work where business_id<>'${f.businessId}') then raise exception 'tenant read escaped';end if;
 if exists(select 1 from public.bookkeeping_guided_review_batches where business_id<>'${f.businessId}') then raise exception 'batch read escaped';end if;
 if public.bookkeeping_question_is_historical_documentation('BUSINESS_PURPOSE_NEEDED','{"factType":"meal_attendee_relationship"}','2026-08-17','2026-09-15') then raise exception '29 day suppressed';end if;
 if public.bookkeeping_question_is_historical_documentation('BUSINESS_PURPOSE_NEEDED','{"factType":"meal_attendee_relationship"}','2026-08-16','2026-09-15') then raise exception '30 day suppressed';end if;
 if not public.bookkeeping_question_is_historical_documentation('BUSINESS_PURPOSE_NEEDED','{"factType":"receipt_meal_business_purpose"}','2026-08-15','2026-09-15') then raise exception '31 day not suppressed';end if;
 if public.bookkeeping_question_is_historical_documentation('BUSINESS_PURPOSE_NEEDED','{"factType":"ordinary_expense_purpose"}','2026-01-01','2026-09-15') then raise exception 'useful fact suppressed';end if;
 if public.bookkeeping_activity_day('${f.businessId}','2026-09-15T02:00:00Z')<>'2026-09-14' then raise exception 'timezone boundary';end if;
 select count(*) into before_count from public.list_current_evidence_question_event_ids();
 select count(*) into after_count from public.list_current_askable_bookkeeping_question_event_ids();
 if before_count<>28 or after_count<>7 then raise exception 'unexpected fixture queue: % / %',before_count,after_count;end if;
 if exists(select 1 from public.bookkeeping_review_events where business_id='${f.businessId}' and event_type in ('answered','resolved')) then raise exception 'suppression changed evidence';end if;
 result:=public.apply_guided_review(request_id,'receipt_unavailable','receipts','${items([0,20,30])}');
 again:=public.apply_guided_review(request_id,'receipt_unavailable','receipts','${items([0,20,30])}');
 if result<>again then raise exception 'retry changed result';end if;
 if (select count(*) from public.bookkeeping_guided_review_batches where id=request_id)<>1 then raise exception 'duplicate batch';end if;
 if (select count(*) from public.bookkeeping_documentation_events where event_type='receipt_lost')<>3 then raise exception 'duplicate receipt assertions';end if;
 if exists(select 1 from public.customer_transaction_work where record_id in ('${f.records[0].recordId}','${f.records[20].recordId}','${f.records[30].recordId}') and (not receipt_unavailable or treatment<>'business')) then raise exception 'receipt changed business treatment';end if;
 if not exists(select 1 from public.customer_transaction_work where record_id='${f.records[20].recordId}' and needs_fact) then raise exception 'unrelated fact removed';end if;
 perform public.attach_bookkeeping_receipt_journey('${f.records[0].recordId}','${receipt}');
 if not exists(select 1 from public.customer_transaction_work where record_id='${f.records[0].recordId}' and has_receipt and not receipt_unavailable) then raise exception 'later receipt did not supersede unavailable';end if;
 perform public.apply_guided_review(gen_random_uuid(),'reviewed','historical','${items([21])}');
 removal:=public.apply_guided_review(gen_random_uuid(),'remove_business','historical','${items([1,21])}');
 if exists(select 1 from public.customer_transaction_work where record_id in ('${f.records[1].recordId}','${f.records[21].recordId}') and treatment<>'personal') then raise exception 'removal failed';end if;
 if exists(select 1 from public.list_current_askable_bookkeeping_question_event_ids() q join public.bookkeeping_review_events e on e.id=q.event_id where e.bookkeeping_record_id='${f.records[21].recordId}') then raise exception 'removed question reappeared';end if;
 if (select count(*) from public.bookkeeping_decisions where bookkeeping_record_id='${f.records[1].recordId}')<>3 then raise exception 'decision history lost';end if;
 perform public.correct_imported_transaction_personal_scope('${f.records[21].transactionId}',(select (entry->'result'->>'decision_id')::uuid from jsonb_array_elements(removal) entry where entry->>'recordId'='${f.records[21].recordId}'),gen_random_uuid(),'restore_previous');
 if not exists(select 1 from public.customer_transaction_work where record_id='${f.records[21].recordId}' and sweep_reviewed) then raise exception 'customer sweep lost after later correction';end if;
end $$;
reset role;
select set_config('request.jwt.claims','{"sub":"${other.userId}","aal":"aal2","role":"authenticated"}',true);set local role authenticated;
do $$ begin
 if exists(select 1 from public.customer_transaction_work where business_id='${f.businessId}') then raise exception 'cross tenant work visible';end if;
 begin perform public.apply_guided_review(gen_random_uuid(),'remove_business','all','${items([2])}');raise exception 'cross tenant removal escaped';exception when others then if sqlerrm='cross tenant removal escaped' then raise;end if;end;
 begin perform public.apply_guided_review(gen_random_uuid(),'receipt_unavailable','receipts','${items([2])}');raise exception 'cross tenant receipt escaped';exception when others then if sqlerrm='cross tenant receipt escaped' then raise;end if;end;
end $$;
reset role;rollback;select 'phase2a_integrity_passed' as result;`
const token=(await readFile(join(homedir(),'.supabase','access-token'),'utf8')).trim()
const response=await fetch('https://api.supabase.com/v1/projects/sgrqrrxrlglhjuetdtps/database/query',{method:'POST',headers:{Authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({query}),signal:AbortSignal.timeout(55000)})
const data=await response.json()
if(!response.ok){console.error(String(data.message??'Staging checks failed').replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi,'[id]'));process.exitCode=1}else console.log('Passed: 29/30/31 days, timezone, 28→7 conversational questions, preserved evidence, bounded bulk assertions, retry/history, later receipt, removal/restoration, MFA and cross-tenant rejection. All mutations rolled back.')

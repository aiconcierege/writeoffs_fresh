-- Run after v3 meal migrations in one transaction; caller always rolls back.
set local role authenticated;
select set_config('request.jwt.claim.sub','8777c5e3-b615-4acd-a4dd-01056a1251dd',true);
select public.register_bookkeeping_receipt('40000000-0000-4000-8000-000000000001',repeat('a',64),
 'receipts/8777c5e3-b615-4acd-a4dd-01056a1251dd/'||repeat('a',64),'meal.jpg','image/jpeg',100);
select public.record_bookkeeping_receipt_extraction('40000000-0000-4000-8000-000000000001','customer:v1','customer',
 'Test Restaurant','2026-08-31',18642,null);
reset role;

set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select public.worker_record_receipt_meal_candidate('8205b373-c03f-4099-a3ef-1b57b48fff2d',
 '40000000-0000-4000-8000-000000000001',repeat('a',64),'meal_line_items',
 '[{"page":1,"region":"body","visibleText":"Dinner entree"}]'::jsonb,'receipt-understanding:r1.2');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','8777c5e3-b615-4acd-a4dd-01056a1251dd',true);
do $$ declare projected jsonb; record_id uuid; d public.bookkeeping_decisions%rowtype; issue_count integer; allocation_count integer;
begin
 projected:=public.project_receipt_meal_candidate_questions('40000000-0000-4000-8000-000000000001');
 if projected->>'state'<>'waiting_for_transaction' then raise exception 'receipt-only candidate was not deferred safely: %',projected; end if;
 record_id:=(projected->>'record_id')::uuid;
 select * into d from public.bookkeeping_decisions x where x.bookkeeping_record_id=record_id
   and not exists(select 1 from public.bookkeeping_decisions s where s.supersedes_decision_id=x.id);
 if d.bookkeeping_nature is not null or d.treatment<>'unresolved' then raise exception 'candidate manufactured receipt-only treatment'; end if;
 select count(*) into allocation_count from public.bookkeeping_allocations where bookkeeping_decision_id=d.id;
 if allocation_count<>0 then raise exception 'candidate manufactured allocation'; end if;
 select count(*) into issue_count from public.bookkeeping_review_events e where e.bookkeeping_record_id=record_id
   and e.reason='BUSINESS_USE_UNCLEAR' and not exists(select 1 from public.bookkeeping_review_events s where s.supersedes_event_id=e.id);
 if issue_count<>0 then raise exception 'receipt-only candidate opened a premature question'; end if;
 perform public.project_receipt_meal_candidate_questions('40000000-0000-4000-8000-000000000001');
 select count(*) into issue_count from public.bookkeeping_review_events where bookkeeping_record_id=record_id and reason='BUSINESS_USE_UNCLEAR';
 if issue_count<>0 then raise exception 'candidate projection was not safely idempotent'; end if;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','be9ec1e8-7d61-422c-a20c-60d589440b04',true);
do $$ declare denied boolean:=false;begin
 begin perform public.project_receipt_meal_candidate_questions('40000000-0000-4000-8000-000000000001');exception when others then denied:=true;end;
 if not denied then raise exception 'cross-tenant receipt candidate access allowed';end if;
end $$;
reset role;

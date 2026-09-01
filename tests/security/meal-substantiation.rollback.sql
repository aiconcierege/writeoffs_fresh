-- Run only after the meal migration in the same transaction; the caller rolls back.
insert into public.bookkeeping_records(id,business_id,source_kind,ingestion_key,amount_cents,currency,occurred_on)
values
 ('10000000-0000-4000-8000-000000000001','8205b373-c03f-4099-a3ef-1b57b48fff2d','manual','meal-rollback-a',-14235,'USD','2026-08-20'),
 ('10000000-0000-4000-8000-000000000002','6fe00fc0-16f9-4966-b4b5-ccad657aedfc','manual','meal-rollback-b',-5000,'USD','2026-08-20');
insert into public.bookkeeping_decisions(id,business_id,bookkeeping_record_id,bookkeeping_nature,treatment,review_status,
 provenance,reason,business_purpose)
values
 ('20000000-0000-4000-8000-000000000001','8205b373-c03f-4099-a3ef-1b57b48fff2d','10000000-0000-4000-8000-000000000001','expense','business','resolved','system','test','Discussed listing strategy'),
 ('20000000-0000-4000-8000-000000000002','6fe00fc0-16f9-4966-b4b5-ccad657aedfc','10000000-0000-4000-8000-000000000002','expense','business','resolved','system','test','Discussed project scope');
insert into public.bookkeeping_allocations(business_id,bookkeeping_record_id,bookkeeping_decision_id,allocation_kind,amount_cents,tax_category_key)
values
 ('8205b373-c03f-4099-a3ef-1b57b48fff2d','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','business',-14235,'meals'),
 ('6fe00fc0-16f9-4966-b4b5-ccad657aedfc','10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','business',-5000,'meals');
insert into public.bookkeeping_meal_substantiation_facts(id,business_id,bookkeeping_record_id,attendee_relationship,actor_user_id)
values('30000000-0000-4000-8000-000000000002','6fe00fc0-16f9-4966-b4b5-ccad657aedfc',
 '10000000-0000-4000-8000-000000000002','Foreign customer, client','be9ec1e8-7d61-422c-a20c-60d589440b04');

do $$ declare public_execute boolean; mutation_denied boolean:=false; begin
 select exists(
   select 1 from pg_proc p
   cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl
   where p.oid='public.reject_meal_substantiation_mutation()'::regprocedure
     and acl.grantee=0 and acl.privilege_type='EXECUTE'
 ) into public_execute;
 if public_execute
   or has_function_privilege('anon','public.reject_meal_substantiation_mutation()','EXECUTE')
   or has_function_privilege('authenticated','public.reject_meal_substantiation_mutation()','EXECUTE')
   or has_function_privilege('service_role','public.reject_meal_substantiation_mutation()','EXECUTE')
 then raise exception 'meal trigger helper retained direct API-role execution'; end if;
 begin
   update public.bookkeeping_meal_substantiation_facts set attendee_relationship='Changed in place'
     where id='30000000-0000-4000-8000-000000000002';
 exception when others then mutation_denied:=true; end;
 if not mutation_denied then raise exception 'meal fact mutation was not blocked by the trigger'; end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub','8777c5e3-b615-4acd-a4dd-01056a1251dd',true);
do $$ declare n integer; foreign_count integer; begin
 n:=public.ensure_current_meal_substantiation_questions();
 if n<>1 then raise exception 'expected one own meal question, got %',n; end if;
 select count(*) into foreign_count from public.bookkeeping_review_events where bookkeeping_record_id='10000000-0000-4000-8000-000000000002';
 if foreign_count<>0 then raise exception 'foreign meal question was opened'; end if;
end $$;

do $$ declare e public.bookkeeping_review_events%rowtype; result jsonb; fact_count integer; begin
 select * into e from public.bookkeeping_review_events where bookkeeping_record_id='10000000-0000-4000-8000-000000000001'
   and issue_key='meal-attendee:10000000-0000-4000-8000-000000000001';
 result:=public.answer_bookkeeping_meal_substantiation_issue(e.review_issue_id,e.id,e.based_on_decision_id,
   e.context_fingerprint,e.evidence_fingerprint,'Sarah Jones, client; Luis Garcia, prospective customer');
 select count(*) into fact_count from public.current_bookkeeping_meal_substantiation_facts
   where bookkeeping_record_id='10000000-0000-4000-8000-000000000001'
     and attendee_relationship like '%Sarah Jones%Luis Garcia%';
 if fact_count<>1 then raise exception 'current meal fact was not retained'; end if;
end $$;

do $$ declare current_id uuid; corrected_id uuid; history_count integer; denied boolean:=false; begin
 select id into current_id from public.current_bookkeeping_meal_substantiation_facts
   where bookkeeping_record_id='10000000-0000-4000-8000-000000000001';
 corrected_id:=public.correct_bookkeeping_meal_substantiation(current_id,current_id,'Sarah Jones, client');
 select count(*) into history_count from public.bookkeeping_meal_substantiation_facts
   where bookkeeping_record_id='10000000-0000-4000-8000-000000000001';
 if history_count<>2 or corrected_id=current_id then raise exception 'meal correction did not preserve history'; end if;
 begin perform public.correct_bookkeeping_meal_substantiation(
   '30000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000002','Foreign');
 exception when others then denied:=true; end;
 if not denied then raise exception 'cross-tenant correction was not denied'; end if;
end $$;

reset role;
set local role anon;
do $$ declare denied boolean:=false; begin
 begin perform public.ensure_current_meal_substantiation_questions(); exception when others then denied:=true; end;
 if not denied then raise exception 'anon meal projection was not denied'; end if;
end $$;
reset role;

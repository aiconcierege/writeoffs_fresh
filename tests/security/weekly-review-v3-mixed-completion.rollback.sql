-- Run after the mixed-completion migration in the same transaction; caller rolls back.
insert into public.business_review_cadence_events(id,business_id,check_in_weekday,timezone_name,effective_from,provenance)
select '51000000-0000-4000-8000-000000000000','8205b373-c03f-4099-a3ef-1b57b48fff2d',4,
 'America/Phoenix','2098-01-01','system'
where not exists(select 1 from public.current_business_review_cadence
 where business_id='8205b373-c03f-4099-a3ef-1b57b48fff2d');
insert into public.bookkeeping_review_periods(id,business_id,period_start,period_end,check_in_date,
 cadence_event_id,membership_scope)
select '51000000-0000-4000-8000-000000000001','8205b373-c03f-4099-a3ef-1b57b48fff2d',
 '2099-01-01','2099-01-07','2099-01-08',id,'business'
from public.current_business_review_cadence
where business_id='8205b373-c03f-4099-a3ef-1b57b48fff2d';

insert into public.bookkeeping_records(id,business_id,source_kind,ingestion_key,amount_cents,currency,occurred_on)
values('51000000-0000-4000-8000-000000000002','8205b373-c03f-4099-a3ef-1b57b48fff2d',
 'manual','mixed-completion-rollback',-14235,'USD','2099-01-03');
insert into public.bookkeeping_decisions(id,business_id,bookkeeping_record_id,bookkeeping_nature,treatment,
 review_status,provenance,reason)
values('51000000-0000-4000-8000-000000000003','8205b373-c03f-4099-a3ef-1b57b48fff2d',
 '51000000-0000-4000-8000-000000000002',null,'unresolved','needs_review','system','Rollback fixture.');
insert into public.bookkeeping_review_events(id,business_id,bookkeeping_record_id,review_issue_id,
 sequence_number,event_type,reason,based_on_decision_id,issue_key,context_fingerprint,evidence_fingerprint,
 question_context,provenance)
values('51000000-0000-4000-8000-000000000004','8205b373-c03f-4099-a3ef-1b57b48fff2d',
 '51000000-0000-4000-8000-000000000002','51000000-0000-4000-8000-000000000004',1,'opened',
 'MIXED_USE_CLARIFICATION','51000000-0000-4000-8000-000000000003','rollback:mixed','rollback:mixed:v1',
 public.current_bookkeeping_evidence_fingerprint('8205b373-c03f-4099-a3ef-1b57b48fff2d',
  '51000000-0000-4000-8000-000000000002'),
 '{"schemaVersion":1,"reason":"MIXED_USE_CLARIFICATION","businessUse":"mixed"}',
 'system');
insert into public.bookkeeping_weekly_review_workflow_events(id,business_id,review_period_id,stage,event_type,
 details,actor_user_id,request_id)
values('51000000-0000-4000-8000-000000000005','8205b373-c03f-4099-a3ef-1b57b48fff2d',
 '51000000-0000-4000-8000-000000000001','personal','stage_completed','{"flowVersion":3}',
 '8777c5e3-b615-4acd-a4dd-01056a1251dd','51000000-0000-4000-8000-000000000105');
insert into public.bookkeeping_weekly_review_workflow_events(id,business_id,review_period_id,supersedes_event_id,
 stage,event_type,details,actor_user_id,request_id)
values('51000000-0000-4000-8000-000000000006','8205b373-c03f-4099-a3ef-1b57b48fff2d',
 '51000000-0000-4000-8000-000000000001','51000000-0000-4000-8000-000000000005','mixed',
 'stage_reopened','{"flowVersion":3,"phase":"mixed_followups"}',
 '8777c5e3-b615-4acd-a4dd-01056a1251dd','51000000-0000-4000-8000-000000000106');

set local role authenticated;
select set_config('request.jwt.claim.sub','8777c5e3-b615-4acd-a4dd-01056a1251dd',true);
do $$ declare denied boolean:=false; begin
 begin perform public.append_weekly_review_workflow_event(
  '51000000-0000-4000-8000-000000000001','51000000-0000-4000-8000-000000000006',
  'mixed','stage_completed','{}','51000000-0000-4000-8000-000000000107');
 exception when others then denied:=position('still needs its business portion' in sqlerrm)>0; end;
 if not denied then raise exception 'unresolved mixed issue did not stop mixed completion'; end if;
end $$;
reset role;

-- Reproduce the historical invalid leaf through owner-level fixture insertion.
insert into public.bookkeeping_weekly_review_workflow_events(id,business_id,review_period_id,supersedes_event_id,
 stage,event_type,details,actor_user_id,request_id)
values('51000000-0000-4000-8000-000000000007','8205b373-c03f-4099-a3ef-1b57b48fff2d',
 '51000000-0000-4000-8000-000000000001','51000000-0000-4000-8000-000000000006','mixed',
 'stage_completed','{"flowVersion":3,"resolvedCount":0}',
 '8777c5e3-b615-4acd-a4dd-01056a1251dd','51000000-0000-4000-8000-000000000108');

set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
do $$ declare repaired uuid; retried uuid; history_count integer; issue_count integer; denied boolean:=false; begin
 repaired:=public.recover_weekly_review_v3_mixed_stage(
  '8205b373-c03f-4099-a3ef-1b57b48fff2d','51000000-0000-4000-8000-000000000001',
  '51000000-0000-4000-8000-000000000007','51000000-0000-4000-8000-000000000109');
 retried:=public.recover_weekly_review_v3_mixed_stage(
  '8205b373-c03f-4099-a3ef-1b57b48fff2d','51000000-0000-4000-8000-000000000001',
  '51000000-0000-4000-8000-000000000007','51000000-0000-4000-8000-000000000109');
 if repaired is distinct from retried then raise exception 'mixed recovery was not idempotent'; end if;
 select count(*) into history_count from public.bookkeeping_weekly_review_workflow_events
  where review_period_id='51000000-0000-4000-8000-000000000001';
 if history_count<>4 then raise exception 'append-only workflow history was not preserved'; end if;
 select count(*) into issue_count from public.bookkeeping_review_events
  where review_issue_id='51000000-0000-4000-8000-000000000004';
 if issue_count<>1 then raise exception 'recovery duplicated or removed the mixed issue'; end if;
 begin perform public.recover_weekly_review_v3_mixed_stage(
  '6fe00fc0-16f9-4966-b4b5-ccad657aedfc','51000000-0000-4000-8000-000000000001',
  repaired,'51000000-0000-4000-8000-000000000110');
 exception when others then denied:=true; end;
 if not denied then raise exception 'cross-tenant mixed recovery was allowed'; end if;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','8777c5e3-b615-4acd-a4dd-01056a1251dd',true);
do $$ declare leaf uuid; completed uuid; selected_evidence text; begin
 select evidence_fingerprint into selected_evidence from public.bookkeeping_review_events
  where id='51000000-0000-4000-8000-000000000004';
 perform public.answer_bookkeeping_mixed_use_review_issue(
  '51000000-0000-4000-8000-000000000004','51000000-0000-4000-8000-000000000004',
  '51000000-0000-4000-8000-000000000003','rollback:mixed:v1',selected_evidence,
  '{"schemaVersion":1,"businessAmountCents":5000}');
 select id into leaf from public.bookkeeping_weekly_review_workflow_events event
  where review_period_id='51000000-0000-4000-8000-000000000001'
    and not exists(select 1 from public.bookkeeping_weekly_review_workflow_events successor
      where successor.supersedes_event_id=event.id);
 completed:=public.append_weekly_review_workflow_event(
  '51000000-0000-4000-8000-000000000001',leaf,'mixed','stage_completed','{"resolvedCount":1}',
  '51000000-0000-4000-8000-000000000111');
 if completed is null then raise exception 'mixed completion did not succeed after resolution'; end if;
end $$;
reset role;

do $$ declare public_execute boolean; begin
 select exists(select 1 from pg_proc p cross join lateral
  aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl
  where p.oid='public.recover_weekly_review_v3_mixed_stage(uuid,uuid,uuid,uuid)'::regprocedure
    and acl.grantee=0 and acl.privilege_type='EXECUTE') into public_execute;
 if public_execute
  or has_function_privilege('anon','public.recover_weekly_review_v3_mixed_stage(uuid,uuid,uuid,uuid)','EXECUTE')
  or has_function_privilege('authenticated','public.recover_weekly_review_v3_mixed_stage(uuid,uuid,uuid,uuid)','EXECUTE')
  or not has_function_privilege('service_role','public.recover_weekly_review_v3_mixed_stage(uuid,uuid,uuid,uuid)','EXECUTE')
 then raise exception 'mixed recovery ACL contract is incorrect'; end if;
end $$;

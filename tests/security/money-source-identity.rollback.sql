-- Supply writeoffs.test_business_id / writeoffs.test_user_id for an isolated
-- synthetic staging customer containing the controlled +$600 cash deposit.
begin;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
create function pg_temp.verify_money_source_identity() returns jsonb language plpgsql as $$
declare r record; a uuid; b uuid; c uuid; issue uuid; n integer; fp text; initially_deferred boolean;
begin
 if not exists(select 1 from auth.users where id=current_setting('writeoffs.test_user_id')::uuid
  and raw_user_meta_data->>'synthetic_guided_contract'='true') then raise exception 'synthetic tenant required';end if;
 select br.id,br.business_id,d.id decision_id into strict r from public.bookkeeping_records br
 join public.bookkeeping_decisions d on d.bookkeeping_record_id=br.id and d.business_id=br.business_id
 where br.business_id=current_setting('writeoffs.test_business_id')::uuid and br.amount_cents=60000
 and not exists(select 1 from public.bookkeeping_decisions s where s.supersedes_decision_id=d.id);
 -- Reproduce both historical generators through their original canonical command.
 a:=public.open_bookkeeping_review_issue_v2_before_money_source_identity(r.business_id,r.id,r.decision_id,
 'TRANSACTION_TYPE_UNCLEAR','legacy-identity-proof-a',repeat('a',64),'{"schemaVersion":1,"factType":"money_in_source"}');
 b:=public.open_bookkeeping_review_issue_v2_before_money_source_identity(r.business_id,r.id,r.decision_id,
 'TRANSACTION_TYPE_UNCLEAR','legacy-identity-proof-b',repeat('b',64),'{"schemaVersion":1,"factType":"money_in_source"}');
 if a=b then raise exception 'duplicate fixture missing';end if;
 a:=public.open_bookkeeping_review_issue_v2(r.business_id,r.id,r.decision_id,'TRANSACTION_TYPE_UNCLEAR',
 'third-generator',repeat('c',64),'{"schemaVersion":1,"factType":"money_in_source"}');
 b:=public.open_bookkeeping_review_issue_v2(r.business_id,r.id,r.decision_id,'TRANSACTION_TYPE_UNCLEAR',
 'fourth-generator',repeat('d',64),'{"schemaVersion":1,"factType":"money_in_source"}');
 if a<>b then raise exception 'generators did not converge';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','aal','aal2',
  'sub',current_setting('writeoffs.test_user_id'))::text,true);
 select count(*) into n from public.list_current_evidence_question_event_ids(now()) q
 join public.bookkeeping_review_events e on e.id=q.event_id where e.bookkeeping_record_id=r.id;
 select event_type='skipped' and deferred_until>now() into initially_deferred from public.bookkeeping_review_events where id=a;
 if n<>(case when initially_deferred then 0 else 1 end) then raise exception 'wrong current material-question count: %',n;end if;
 select review_issue_id into issue from public.bookkeeping_review_events where id=a;
 if initially_deferred then c:=a;else c:=public.skip_bookkeeping_review_issue(r.business_id,issue,a,now()+interval '7 days');end if;
 if exists(select 1 from public.list_current_evidence_question_event_ids(now()) q
 join public.bookkeeping_review_events e on e.id=q.event_id where e.bookkeeping_record_id=r.id)
 then raise exception 'deferral exposed equivalent historical question';end if;
 select count(*) into n from public.list_current_evidence_question_event_ids(now()+interval '8 days') q
 join public.bookkeeping_review_events e on e.id=q.event_id where e.bookkeeping_record_id=r.id;
 if n<>1 then raise exception 'expiry did not restore exactly one fact';end if;
 perform set_config('request.jwt.claims','{"role":"service_role"}',true);
 if public.open_bookkeeping_review_issue_v2(r.business_id,r.id,r.decision_id,'TRANSACTION_TYPE_UNCLEAR',
 'another-generator',repeat('e',64),'{"schemaVersion":1,"factType":"money_in_source"}')<>c
 then raise exception 'generator bypassed customer deferral';end if;
 b:=public.resolve_bookkeeping_review_issue(r.business_id,issue,c);
 if public.open_bookkeeping_review_issue_v2(r.business_id,r.id,r.decision_id,'TRANSACTION_TYPE_UNCLEAR',
 'yet-another-generator',repeat('f',64),'{"schemaVersion":1,"factType":"money_in_source"}')<>b
 then raise exception 'generator reopened resolved fact';end if;
 if has_function_privilege('authenticated','public.current_money_source_question_event(uuid,uuid,uuid,text)','EXECUTE')
 or has_function_privilege('authenticated','public.open_bookkeeping_review_issue_v2_before_money_source_identity(uuid,uuid,uuid,text,text,text,jsonb)','EXECUTE')
 then raise exception 'internal helper exposed';end if;
 if exists(select 1 from pg_depend dep join pg_rewrite rw on rw.oid=dep.objid
 join pg_class c on c.oid=rw.ev_class join pg_proc f on f.oid=dep.refobjid
 where dep.refclassid='pg_proc'::regclass and dep.classid='pg_rewrite'::regclass and c.relkind='v'
 and f.proname like 'list_current_evidence_question_event_ids_before_money_source%')
 then raise exception 'view still binds obsolete eligibility function';end if;
 return '{"singleFact":true,"generatorConvergence":true,"deferralAcrossLegacyIssues":true,"expiryRestoresOne":true,"resolvedPreserved":true,"internalHelpersRestricted":true,"rollback":true}'::jsonb;
end;$$;
select pg_temp.verify_money_source_identity() validation;
rollback;

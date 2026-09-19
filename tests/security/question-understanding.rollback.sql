-- Caller supplies test.business_id and test.user_id for an isolated synthetic
-- customer. All evidence-version checks and fixture mutations roll back.
begin;
set local statement_timeout='8s';
set local lock_timeout='500ms';
select set_config('request.jwt.claims','{"role":"service_role"}',true);
create function pg_temp.verify_question_understanding() returns jsonb language plpgsql as $$
declare r record; first_id uuid; enriched uuid; repeated uuid; skipped uuid; issue uuid; ctx jsonb;
begin
 if not exists(select 1 from auth.users where id=current_setting('test.user_id')::uuid
   and (raw_user_meta_data->>'synthetic_ux1'='true' or raw_user_meta_data->>'synthetic_guided_contract'='true'))
 then raise exception 'Synthetic fixture required';end if;
 select br.id,br.business_id,d.id decision_id into strict r from public.bookkeeping_records br
 join public.bookkeeping_decisions d on d.bookkeeping_record_id=br.id and d.business_id=br.business_id
 where br.business_id=current_setting('test.business_id')::uuid and br.amount_cents=73544
 and d.treatment='unresolved' and not exists(select 1 from public.bookkeeping_decisions n where n.supersedes_decision_id=d.id);
 ctx:='{"schemaVersion":1,"reason":"TRANSACTION_TYPE_UNCLEAR","factType":"money_in_source"}';
 first_id:=public.open_bookkeeping_review_issue_v2(r.business_id,r.id,r.decision_id,'TRANSACTION_TYPE_UNCLEAR','generic-generator','generic',ctx);
 enriched:=public.open_bookkeeping_review_issue_v2(r.business_id,r.id,r.decision_id,'TRANSACTION_TYPE_UNCLEAR','worker-generator','worker',ctx||
 '{"understanding":{"kind":"customer_payment_candidate","counterparty":"STRIPE","basis":"inferred","confidence":0.8,"sourceId":"test-source","evidenceFingerprint":"test-fingerprint"}}');
 if first_id=enriched then raise exception 'Worker understanding was discarded';end if;
 select review_issue_id into issue from public.bookkeeping_review_events where id=enriched;
 if issue<>(select review_issue_id from public.bookkeeping_review_events where id=first_id)
 then raise exception 'Enrichment duplicated the fact';end if;
 repeated:=public.open_bookkeeping_review_issue_v2(r.business_id,r.id,r.decision_id,'TRANSACTION_TYPE_UNCLEAR','generic-generator','generic',ctx);
 if repeated<>enriched then raise exception 'Generic generator erased context or churned version';end if;
 if (select question_context#>>'{understanding,kind}' from public.bookkeeping_review_events where id=repeated)<>'customer_payment_candidate'
 then raise exception 'Understanding missing';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','aal','aal2','sub',current_setting('test.user_id'))::text,true);
 begin
  perform public.skip_bookkeeping_review_issue(r.business_id,issue,first_id,now()+interval '7 days');
  raise exception 'Stale answer accepted' using errcode='P0002';
 exception when sqlstate 'P0002' then raise; when others then null;end;
 skipped:=public.skip_bookkeeping_review_issue(r.business_id,issue,enriched,now()+interval '7 days');
 perform set_config('request.jwt.claims','{"role":"service_role"}',true);
 repeated:=public.open_bookkeeping_review_issue_v2(r.business_id,r.id,r.decision_id,'TRANSACTION_TYPE_UNCLEAR','generic-generator','generic',ctx);
 if repeated<>skipped then raise exception 'Customer deferral bypassed';end if;
 if has_function_privilege('authenticated','public.open_bookkeeping_review_issue_v2(uuid,uuid,uuid,text,text,text,jsonb)','execute')
 or has_function_privilege('anon','public.open_bookkeeping_review_issue_v2(uuid,uuid,uuid,text,text,text,jsonb)','execute')
 then raise exception 'Worker context API exposed';end if;
 return '{"enrichment":true,"singleFact":true,"idempotentGenericRefresh":true,"staleVersionRejected":true,"deferralPreserved":true,"workerOnly":true}'::jsonb;
end;$$;
select pg_temp.verify_question_understanding() validation;
rollback;

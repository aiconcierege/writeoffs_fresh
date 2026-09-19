-- Caller supplies test.business_id / test.user_id for an explicitly synthetic fixture.
-- Run inside BEGIN/ROLLBACK. No fixture deletion/reset and no Rick accounts.
do $test$
declare bid uuid:=current_setting('test.business_id')::uuid; uid uuid:=current_setting('test.user_id')::uuid;
 original jsonb; selected jsonb; lookup jsonb; args jsonb; saved jsonb; again jsonb; next_work jsonb;
 question_id uuid; question_version uuid; n integer; before_events integer; after_events integer;
 lease uuid:=gen_random_uuid(); revision_before bigint; stale_publish boolean; summary_before timestamptz; available_before timestamptz;
begin
 if not exists(select 1 from auth.users where id=uid and (raw_user_meta_data->>'synthetic_guided_contract'='true' or raw_user_meta_data->>'synthetic_ux1'='true')) then raise exception 'Synthetic fixture required';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','authenticated','aal','aal1')::text,true);
 begin perform public.read_betti_action_index(bid);raise exception 'AAL1 accepted';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','authenticated','aal','aal2')::text,true);
 begin perform public.read_betti_action_index(gen_random_uuid());raise exception 'Foreign tenant accepted';exception when insufficient_privilege then null;end;
 begin perform public.claim_betti_action_index_refresh(gen_random_uuid(),bid);raise exception 'Customer claimed worker';exception when insufficient_privilege then null;end;
 select revision into revision_before from public.betti_action_index_state where business_id=bid;
 original:=public.read_betti_action_index(bid);
 if not (original->'index'->>'summaryCurrent')::boolean then raise exception 'Settled fixture required';end if;
 select a into selected from jsonb_array_elements(original->'customer'->'actionable')a
 where a->'question'->>'source'='bookkeeping' and a->'question'->>'kind'='transaction_type'
  and (a->'question'->'transaction'->>'amountCents')::bigint>0 limit 1;
 if selected is null then raise exception 'Fixture needs an incoming material question';end if;
 -- Expired processing summaries request a real refresh without withdrawing an
 -- independent action whose own eligibility deadline has not expired.
 select summary_valid_until,available_at into summary_before,available_before from public.betti_action_index_state where business_id=bid;
 update public.betti_action_index_state set summary_valid_until=now()-interval '1 second',available_at=now()-interval '1 second' where business_id=bid;
 next_work:=public.read_betti_action_index(bid);
 if next_work->'nextAction' is distinct from original->'nextAction' then raise exception 'Summary expiry blocked independent action';end if;
 if (next_work->'index'->>'summaryCurrent')::boolean then raise exception 'Expired summary claimed fresh';end if;
 update public.betti_action_index_state set summary_valid_until=summary_before,available_at=available_before where business_id=bid;
 question_id:=(selected->'question'->>'id')::uuid;question_version:=(selected->'question'->>'version')::uuid;
 lookup:=public.read_betti_indexed_question(bid,question_id,question_version);
 if lookup->'commandItem' is null then raise exception 'Command context missing';end if;
 if revision_before<>(select revision from public.betti_action_index_state where business_id=bid) then raise exception 'Read mutated state';end if;
 args:=jsonb_build_object('p_review_issue_id',question_id,'p_expected_current_event_id',question_version,
  'p_expected_current_decision_id',lookup->'commandItem'->'decision'->>'id',
  'p_expected_context_fingerprint',lookup->'commandItem'->'event'->>'contextFingerprint',
  'p_expected_evidence_fingerprint',coalesce(lookup->'commandItem'->'event'->>'evidenceFingerprint',''),
  'p_answer',jsonb_build_object('schemaVersion',1,'activity','earned_money'));
 begin
  perform public.execute_betti_indexed_question(bid,question_id,question_version,'answer_bookkeeping_transaction_type_review_issue',args,null,false);
  raise exception 'Changed processing configuration accepted';
 exception when serialization_failure then null;end;
 select count(*) into before_events from public.bookkeeping_review_events where business_id=bid;
 saved:=public.execute_betti_indexed_question(bid,question_id,question_version,'answer_bookkeeping_transaction_type_review_issue',args);
 next_work:=saved->'_guidedIndex';
 if next_work is null then raise exception 'Next action missing';end if;
 if next_work->'nextAction'->>'id'=selected->>'id' then raise exception 'Answered question returned';end if;
 if (next_work->'customer'->>'actionableCount')::integer<1 then raise exception 'Unrelated work was blocked';end if;
 if not exists(select 1 from public.betti_action_index_invalidations i where i.business_id=bid and i.record_id=(lookup->'commandItem'->'record'->>'id')::uuid)
 then raise exception 'Fact did not invalidate its record';end if;
 select count(*) into after_events from public.bookkeeping_review_events where business_id=bid;
 if after_events<=before_events then raise exception 'Answer did not append history';end if;
 again:=public.execute_betti_indexed_question(bid,question_id,question_version,'answer_bookkeeping_transaction_type_review_issue',args);
 if again-'_guidedIndex'<>saved-'_guidedIndex' then raise exception 'Exact retry changed result';end if;
 if after_events<>(select count(*) from public.bookkeeping_review_events where business_id=bid) then raise exception 'Retry duplicated history';end if;
 begin
  perform public.execute_betti_indexed_question(bid,question_id,question_version,'answer_bookkeeping_transaction_type_review_issue',
   jsonb_set(args,'{p_answer,activity}','"moved_money"'));
  raise exception 'Changed retry accepted';
 exception when serialization_failure then null;end;
 -- Worker publication from an older generation cannot erase the committed answer.
 perform set_config('request.jwt.claims','{"role":"service_role"}',true);
 perform public.claim_betti_action_index_refresh(lease,bid);
 select revision into revision_before from public.betti_action_index_state where business_id=bid;
 perform public.invalidate_betti_action_index(bid,null);
 stale_publish:=public.publish_betti_action_index(bid,lease,revision_before,original,'[]',now()+interval '1 minute','business','betti-action-index:v1',true);
 if stale_publish then raise exception 'Stale publisher accepted';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','authenticated','aal','aal2')::text,true);
 next_work:=public.read_betti_action_index(bid);
 if next_work->'nextAction'<>'null'::jsonb or (next_work->'readiness'->>'doneForNow')::boolean then raise exception 'Invalidated business claimed ready/done';end if;
 if (next_work->'betti'->>'queued')::integer+(next_work->'betti'->>'genuinelyProcessing')::integer<1 then raise exception 'Missing durable refresh state';end if;
 select count(*) into n from pg_catalog.pg_class c join pg_catalog.pg_namespace ns on ns.oid=c.relnamespace
 where ns.nspname='public' and c.relkind='r' and c.relname not like 'betti_action_index_%'
 and (c.relname='businesses' or exists(select 1 from pg_catalog.pg_attribute a where a.attrelid=c.oid and a.attname='business_id' and not a.attisdropped))
 and not exists(select 1 from pg_catalog.pg_trigger t where t.tgrelid=c.oid and t.tgname='betti_action_index_invalidate' and t.tgenabled<>'D');
 if n<>0 then raise exception 'Canonical write tables lack invalidation triggers';end if;
end;$test$;
select 'PASS: MFA, tenant, read-only, persist, invalidate, continue, retry, stale publisher, coverage' as result;

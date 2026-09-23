-- Run only in the data-free local schema clone; all synthetic writes roll back.
\set ON_ERROR_STOP on
begin;
do $$ begin
 if current_database()<>'routing_certification_local' then raise exception 'Isolated local schema clone required';end if;
end $$;
do $test$
declare uid uuid:=gen_random_uuid(); bid uuid; second_uid uuid:=gen_random_uuid(); second_bid uuid;
 items jsonb; before_state jsonb; claimed uuid; n integer; result_text text;
begin
 if pg_get_functiondef('public.read_betti_action_index(uuid,uuid,text,boolean)'::regprocedure) not like '%betti-action-index:v3-specific-facts%'
 or pg_get_functiondef('public.execute_betti_indexed_question(uuid,uuid,uuid,text,jsonb,uuid,boolean)'::regprocedure) not like '%betti-action-index:v3-specific-facts%'
 then raise exception 'Reader and command routing versions disagree';end if;
 insert into auth.users(id,email,raw_user_meta_data) values(uid,'routing-a@local.invalid','{"synthetic_routing":true}'),(second_uid,'routing-b@local.invalid','{"synthetic_routing":true}');
 select id into bid from public.businesses where owner_user_id=uid;
 select id into second_bid from public.businesses where owner_user_id=second_uid;
 if bid is null or second_bid is null then raise exception 'Synthetic provisioning failed';end if;
 perform set_config('request.jwt.claims','{"role":"service_role"}',true);
 perform public.create_business_membership_grant(bid,'business',now()-interval '1 day',null,'routing-test','Synthetic local test','admin',null);
 select jsonb_agg(jsonb_build_object('recordId',gen_random_uuid())) into items from generate_series(1,100);
 -- The table accepts 100 personal exceptions, but every other stage retains 8.
 insert into public.betti_guided_assertions(id,business_id,actor_user_id,action,disposition,items,answers,result)
 values(gen_random_uuid(),bid,uid,'personal_exception_sweep','completed',items,'{}','[]');
 begin
  insert into public.betti_guided_assertions(id,business_id,actor_user_id,action,disposition,items,answers,result)
  values(gen_random_uuid(),bid,uid,'receipt_upload_sweep','completed',items,'{}','[]');
  raise exception 'Receipt bound lost';
 exception when check_violation then null;end;
 begin
  insert into public.betti_guided_assertions(id,business_id,actor_user_id,action,disposition,items,answers,result)
  values(gen_random_uuid(),bid,uid,'personal_exception_sweep','completed',items||'[{}]','{}','[]');
  raise exception 'Personal bound lost';
 exception when check_violation then null;end;
 -- The actual answer function accepts the larger shape, then rejects nonexistent
 -- records (rather than bypassing its existing per-record stale/tenant checks).
 perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','authenticated','aal','aal2')::text,true);
 begin
  perform public.answer_betti_guided_work(gen_random_uuid(),'personal_exception_sweep','deferred',items,'{}');
  raise exception 'Missing records accepted';
 exception when raise_exception then
  get stacked diagnostics result_text=message_text;
  if result_text<>'Stale or unavailable purchase' then raise exception 'Unexpected personal guard: %',result_text;end if;
 end;
 begin
  perform public.answer_betti_guided_work(gen_random_uuid(),'receipt_upload_sweep','deferred',items,'{}');
  raise exception 'Receipt API bound lost';
 exception when raise_exception then
  get stacked diagnostics result_text=message_text;
  if result_text<>'Invalid guided snapshot' then raise exception 'Unexpected receipt guard: %',result_text;end if;
 end;
 begin
  perform public.claim_betti_action_index_refresh_excluding(gen_random_uuid(),bid);
  raise exception 'Customer claimed worker';
 exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claims','{"role":"service_role"}',true);
 update public.betti_action_index_state set available_at=now()+interval '1 day',engine_version='betti-action-index:v2-render-ready',last_error=null where business_id in(bid,second_bid);
 select to_jsonb(s) into before_state from public.betti_action_index_state s where business_id=bid;
 select business_id into claimed from public.claim_betti_action_index_refresh_excluding(gen_random_uuid(),bid,p_excluded_business_ids=>array[bid]);
 if claimed is not null or before_state is distinct from (select to_jsonb(s) from public.betti_action_index_state s where business_id=bid) then raise exception 'Frozen state mutated';end if;
 select business_id into claimed from public.claim_betti_action_index_refresh_excluding(gen_random_uuid(),second_bid,p_excluded_business_ids=>array[bid]);
 if claimed is distinct from second_bid then raise exception 'Other tenant was frozen';end if;
 select count(*) into n from public.claim_betti_action_index_refresh_excluding(gen_random_uuid(),second_bid,p_excluded_business_ids=>array[bid]);
 if n<>0 then raise exception 'Lease claimed twice';end if;
 update public.betti_action_index_state set lease_id=null,lease_expires_at=null,last_error='synthetic_retry',available_at=now()+interval '1 hour' where business_id=second_bid;
 select count(*) into n from public.claim_betti_action_index_refresh_excluding(gen_random_uuid(),second_bid,p_excluded_business_ids=>array[bid]);
 if n<>0 then raise exception 'Version change bypassed failure backoff';end if;
 -- Exercise the real indexed reader: a huge optional batch's numeric score
 -- cannot override a specific question's canonical routing tier.
 update public.betti_action_index_state set published_revision=100000,revision=100000,global_revision=100000,
  engine_version='betti-action-index:v3-specific-facts',processing_enabled=true,
  valid_until=now()+interval '1 day',summary_valid_until=now()+interval '1 day',built_at=now(),
  projection='{"businessId":"local","progress":{"catchUp":{},"current":{}},"betti":{},"scope":{},"readiness":{}}'
 where business_id=bid;
 insert into public.betti_action_index_entries(business_id,action_id,action_version,published_revision,record_ids,action,base_score,continuity_priority)
 values
 (bid,'optional','v1',100000,array[uid],'{"id":"optional","type":"personal_exception_sweep","status":"actionable","affects":["catch_up"],"priority":{"score":9999,"routingTier":0}}',9999,'{"score":10000,"routingTier":0}'),
 (bid,'specific','v1',100000,array[uid],'{"id":"specific","type":"material_question","status":"actionable","affects":["catch_up"],"priority":{"score":1,"routingTier":1}}',1,'{"score":2,"routingTier":1}');
 perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','authenticated','aal','aal2')::text,true);
 if public.read_betti_action_index(bid)->'nextAction'->>'id'<>'specific'
 or public.read_betti_action_index(bid,uid)->'nextAction'->>'id'<>'specific'
 then raise exception 'Indexed order diverged from canonical order';end if;
 begin
  perform public.execute_betti_indexed_question(bid,gen_random_uuid(),gen_random_uuid(),'answer_bookkeeping_transaction_type_review_issue','{}');
  raise exception 'Invalid indexed command accepted';
 exception when invalid_parameter_value then null;end;
 if has_function_privilege('anon','public.claim_betti_action_index_refresh_excluding(uuid,uuid,text,boolean,uuid[])','execute')
 or has_function_privilege('authenticated','public.claim_betti_action_index_refresh_excluding(uuid,uuid,text,boolean,uuid[])','execute')
 then raise exception 'Worker permission leaked';end if;
end;$test$;
select 'PASS: personal/receipt limits, stale checks, tenant freeze, worker privileges, lease fencing, indexed routing order' as result;
rollback;

-- Rebuild derived actions with shared evidence readiness before serving them.
-- Old publications fail closed; normal leased workers rebuild them.
create or replace function public.read_betti_action_index(p_business_id uuid,p_continuity_record_id uuid default null,p_view text default 'full',p_processing_enabled boolean default true)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare s public.betti_action_index_state; result jsonb; ready jsonb; deferred jsonb; waiting jsonb;
 next_action jsonb; pending boolean; refresh_state text; invalid_all boolean; catch_count integer; current_count integer;
begin
 if auth.uid() is null or coalesce(auth.jwt()->>'aal','')<>'aal2'
  or not exists(select 1 from public.businesses where id=p_business_id and owner_user_id=auth.uid())
 then raise exception 'Business unavailable' using errcode='42501';end if;
 if p_view not in('full','guided') then raise exception 'Invalid index view';end if;
 select * into s from public.betti_action_index_state where business_id=p_business_id;
 if s.projection is null or s.engine_version is distinct from 'betti-action-index:v2-render-ready'
  or s.processing_enabled is distinct from p_processing_enabled then return null;end if;
 invalid_all:=s.global_revision>s.published_revision or s.valid_until<=now();
 pending:=s.revision<>s.published_revision or invalid_all or s.summary_valid_until<=now();
 refresh_state:=case when s.lease_expires_at>now() then 'processing' when s.last_error is not null then 'retry_scheduled' else 'queued' end;
 with eligible as materialized (
  select case when p_continuity_record_id=any(e.record_ids) then jsonb_set(e.action,'{priority}',e.continuity_priority) else e.action end action,
   case when p_continuity_record_id=any(e.record_ids) then (e.continuity_priority->>'score')::integer else e.base_score end score,e.action_id
  from public.betti_action_index_entries e where e.business_id=p_business_id and not invalid_all
   and e.published_revision=s.published_revision
   and not exists(select 1 from public.betti_action_index_invalidations i where i.business_id=e.business_id
    and i.revision>e.published_revision and (i.record_id=any(e.record_ids)
     or e.action->>'type' in ('personal_exception_sweep','mixed_use_sweep','receipt_upload_sweep','receipt_availability')))
 ) select coalesce(jsonb_agg(action order by score desc,action_id) filter(where action->>'status'='actionable'),'[]'),
  coalesce(jsonb_agg(action order by score desc,action_id) filter(where action->>'status'='deferred'),'[]'),
  coalesce(jsonb_agg(action order by score desc,action_id) filter(where action->>'status'='waiting'),'[]')
 into ready,deferred,waiting from eligible;
 next_action:=ready->0;
 select count(*) filter(where a->'affects' ? 'catch_up'),count(*) filter(where a->'affects' ? 'current') into catch_count,current_count from jsonb_array_elements(ready)a;
 result:=s.projection||jsonb_build_object('asOf',now(),'nextAction',next_action,
  'index',jsonb_build_object('version',1,'revision',s.revision,'publishedRevision',s.published_revision,
   'summaryCurrent',not pending,'summaryAsOf',s.built_at,'state',case when pending then refresh_state else 'ready' end),
  'customer',jsonb_build_object('actionable',ready,'deferred',deferred,'actionableCount',jsonb_array_length(ready),
   'deferredCount',jsonb_array_length(deferred),'sharedCount',(select count(*) from jsonb_array_elements(ready)a where a->>'workstream'='shared')));
 result:=jsonb_set(result,'{progress,catchUp,customerActions}',to_jsonb(catch_count));
 result:=jsonb_set(result,'{progress,current,customerActions}',to_jsonb(current_count));
 result:=jsonb_set(result,'{betti,waiting}',waiting);
 if pending then
  -- Old job status/completion metrics are not presented as current. A real durable
  -- index refresh owns this state; independent ready actions remain available.
  result:=jsonb_set(result,'{betti}',jsonb_build_object('jobs','[]'::jsonb,'outsideScopeJobs','[]'::jsonb,
   'waiting',waiting,'systemHeld','[]'::jsonb,'missingJobs','[]'::jsonb,'failures','[]'::jsonb,
   'genuinelyProcessing',case when refresh_state='processing' then 1 else 0 end,
   'queued',case when refresh_state='queued' then 1 else 0 end,
   'retryScheduled',case when refresh_state='retry_scheduled' then 1 else 0 end));
  result:=jsonb_set(result,'{readiness,doneForNow}','false');
  result:=jsonb_set(result,'{readiness,knownAccountsOrganizedThrough}','null');
  result:=jsonb_set(result,'{readiness,booksCurrentThrough}','null');
  result:=jsonb_set(result,'{readiness,phase}',to_jsonb(case when jsonb_array_length(ready)>0 then 'customer_action' when refresh_state='processing' then 'processing' else 'received' end));
  result:=jsonb_set(result,'{readiness,catchUp}',to_jsonb(case when result->'scope'->>'historicalAuthorized'='true' then 'work_remaining' else 'not_requested' end));
 end if;
 if p_view='guided' then
  result:=result-'scope'-'customer'-'betti'||jsonb_build_object(
   'scope',jsonb_build_object('bookkeepingStart',s.projection->'scope'->'bookkeepingStart'),
   'customer',(result->'customer')-'actionable'-'deferred',
   'betti',(result->'betti')-'jobs'-'outsideScopeJobs'-'waiting');
 end if;
 return result;
end;$$;
revoke all on function public.read_betti_action_index(uuid,uuid,text,boolean) from public,anon;
grant execute on function public.read_betti_action_index(uuid,uuid,text,boolean) to authenticated;


create or replace function public.execute_betti_indexed_question(p_business_id uuid,p_question_id uuid,p_question_version uuid,p_function_name text,p_arguments jsonb,p_continuity_record_id uuid default null,p_processing_enabled boolean default true)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.betti_action_index_state; entry jsonb; saved public.betti_action_index_commands; fn record;
 call_args text; raw_result jsonb; result jsonb; decision_id uuid; bid uuid;
begin
 if auth.uid() is null or coalesce(auth.jwt()->>'aal','')<>'aal2'
  or not exists(select 1 from public.businesses where id=p_business_id and owner_user_id=auth.uid())
  or not public.customer_has_active_membership()
  or exists(select 1 from public.current_customer_membership where business_id=p_business_id and deletion_status is not null)
 then raise exception 'Business unavailable' using errcode='42501';end if;
 if p_function_name not in('skip_bookkeeping_review_issue','answer_bookkeeping_business_purpose_review_issue',
  'answer_bookkeeping_meal_substantiation_issue_v2','answer_bookkeeping_business_context_meal_issue',
  'answer_bookkeeping_business_use_review_issue','answer_bookkeeping_mixed_use_review_issue',
  'answer_bookkeeping_mixed_use_percentage','answer_bookkeeping_customer_not_sure',
  'answer_bookkeeping_mixed_use_all_business','answer_bookkeeping_mixed_use_personal_amount',
  'answer_bookkeeping_transaction_type_review_issue','answer_bookkeeping_conflicting_evidence_review_issue')
  or jsonb_typeof(p_arguments)<>'object'
  or p_arguments->>'p_review_issue_id' is distinct from p_question_id::text
  or p_arguments->>'p_expected_current_event_id' is distinct from p_question_version::text
  or (p_arguments ? 'p_business_id' and p_arguments->>'p_business_id' is distinct from p_business_id::text)
 then raise exception 'Invalid indexed command' using errcode='22023';end if;
 -- Serialize publication/invalidation with validation and the existing write RPC.
 -- Existing record/evidence/answer guards still execute inside that RPC.
 select * into s from public.betti_action_index_state where business_id=p_business_id for update;
 select * into saved from public.betti_action_index_commands where business_id=p_business_id and question_id=p_question_id and question_version=p_question_version;
 if found then
  if saved.function_name<>p_function_name or saved.arguments<>p_arguments then raise exception 'Question changed: retry differs' using errcode='40001';end if;
  return saved.result||jsonb_build_object('_guidedIndex',public.read_betti_action_index(p_business_id,p_continuity_record_id,'guided',p_processing_enabled));
 end if;
 if s.engine_version is distinct from 'betti-action-index:v2-render-ready' or s.processing_enabled is distinct from p_processing_enabled
 then raise exception 'Question changed: index configuration changed' using errcode='40001';end if;
 entry:=public.read_betti_indexed_question(p_business_id,p_question_id,p_question_version);
 if entry->'action' is null or entry->'action'='null'::jsonb or entry->'commandItem' is null or entry->'commandItem'='null'::jsonb
 then raise exception 'Question changed: index is no longer current' using errcode='40001';end if;
 select p.oid,p.proargnames,p.proargtypes,p.pronargs into strict fn from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=p_function_name;
 if not has_function_privilege('authenticated',fn.oid,'EXECUTE')
  or (select count(*) from jsonb_object_keys(p_arguments))<>fn.pronargs
  or exists(select 1 from unnest(fn.proargnames) name where not p_arguments ? name)
 then raise exception 'Invalid canonical command arguments';end if;
 select string_agg(format('%I => %s',fn.proargnames[i+1],
  case when fn.proargtypes[i]='jsonb'::regtype then format('($1->%L)',fn.proargnames[i+1])
   else format('($1->>%L)::%s',fn.proargnames[i+1],pg_catalog.format_type(fn.proargtypes[i],null)) end),',' order by i)
 into call_args from generate_series(0,fn.pronargs-1)i;
 execute format('select to_jsonb(public.%I(%s))',p_function_name,call_args) into raw_result using p_arguments;
 if jsonb_typeof(raw_result)='string' then
  select jsonb_build_object('_indexEvent',to_jsonb(e)) into result from public.bookkeeping_review_events e
   where e.business_id=p_business_id and e.id=(raw_result#>>'{}')::uuid;
 else
  result:=raw_result;
  if raw_result->>'business_id' is not null and raw_result->>'business_id'<>p_business_id::text then raise exception 'Unowned command result';end if;
  decision_id:=nullif(raw_result->>'decision_id','')::uuid;
  if decision_id is not null then
   result:=result||jsonb_build_object('_indexHydration',jsonb_build_object(
    'answeredEvent',(select to_jsonb(e) from public.bookkeeping_review_events e where e.business_id=p_business_id and e.id=(raw_result->>'answered_event_id')::uuid),
    'resolvedEvent',(select to_jsonb(e) from public.bookkeeping_review_events e where e.business_id=p_business_id and e.id=(raw_result->>'resolved_event_id')::uuid),
    'followUpEvent',(select to_jsonb(e) from public.bookkeeping_review_events e where e.business_id=p_business_id and e.id=(raw_result->>'follow_up_event_id')::uuid),
    'decision',(select to_jsonb(d) from public.bookkeeping_decisions d where d.business_id=p_business_id and d.id=decision_id),
    'allocations',(select coalesce(jsonb_agg(to_jsonb(a)),'[]') from public.bookkeeping_allocations a where a.business_id=p_business_id and a.bookkeeping_decision_id=decision_id)));
  end if;
 end if;
 if result is null then raise exception 'Canonical command returned no result';end if;
 result:=result||jsonb_build_object('_indexBackgroundSafe',exists(
  select 1 from public.bookkeeping_decisions d join public.bookkeeping_processing_jobs j
   on j.business_id=d.business_id and j.bookkeeping_record_id=d.bookkeeping_record_id
  where d.business_id=p_business_id and d.id=decision_id and d.bookkeeping_nature='expense'
   and j.processing_reason='deterministic_evaluation'
   and j.target_fingerprint='bookkeeping-evaluator:v1:record:'||d.bookkeeping_record_id::text||':schedule-c-decision:'||d.id::text
   and j.state in('pending','processing','retryable')));
 insert into public.betti_action_index_commands(business_id,question_id,question_version,function_name,arguments,result,command_item,action)
 values(p_business_id,p_question_id,p_question_version,p_function_name,p_arguments,result,entry->'commandItem',entry->'action');
 return result||jsonb_build_object('_guidedIndex',public.read_betti_action_index(p_business_id,p_continuity_record_id,'guided',p_processing_enabled));
end;$$;
revoke all on function public.execute_betti_indexed_question(uuid,uuid,uuid,text,jsonb,uuid,boolean) from public,anon,service_role;
grant execute on function public.execute_betti_indexed_question(uuid,uuid,uuid,text,jsonb,uuid,boolean) to authenticated;


-- A configuration refresh must not wait until an old daily expiry.
-- This schedules only derived index work; customer facts are unchanged.
update public.betti_action_index_state set available_at=least(available_at,now())
where engine_version is distinct from 'betti-action-index:v2-render-ready';

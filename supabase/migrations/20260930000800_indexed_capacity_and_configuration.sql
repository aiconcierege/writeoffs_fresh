-- Do not impose a 1,000-action ceiling below the existing canonical input bounds.
-- The trusted producer retains its original record/question/document limits.
create or replace function public.publish_betti_action_index(p_business_id uuid,p_lease_id uuid,p_revision bigint,p_projection jsonb,p_entries jsonb,p_valid_until timestamptz,p_plan text,p_engine_version text,p_processing_enabled boolean)
returns boolean language plpgsql security definer set search_path='' as $$
declare s public.betti_action_index_state; summary_until timestamptz;
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'Worker required' using errcode='42501';end if;
 select * into s from public.betti_action_index_state where business_id=p_business_id for update;
 if s.lease_id is distinct from p_lease_id or s.lease_expires_at<=now() then return false;end if;
 if s.revision<>p_revision then
  update public.betti_action_index_state set lease_id=null,lease_expires_at=null,available_at=now() where business_id=p_business_id;return false;
 end if;
 summary_until:=coalesce((p_projection->>'_indexSummaryValidUntil')::timestamptz,p_valid_until);
 if summary_until<=now() or summary_until>p_valid_until then raise exception 'Invalid summary deadline';end if;
 if p_projection->>'businessId' is distinct from p_business_id::text or jsonb_typeof(p_entries)<>'array'
  or jsonb_array_length(p_entries)>20000 or p_valid_until<=now() or p_valid_until>now()+interval '25 hours'
  or p_plan not in('business','expenses') then raise exception 'Invalid index publication';end if;
 if exists(select 1 from jsonb_array_elements(p_entries)e where e->'action'->>'id' is null or e->'action'->>'version' is null
  or exists(select 1 from jsonb_array_elements_text(e->'action'->'recordIds')rid where not exists(select 1 from public.bookkeeping_records r where r.id=rid::uuid and r.business_id=p_business_id)))
 then raise exception 'Unowned index publication';end if;
 delete from public.betti_action_index_entries where business_id=p_business_id;
 insert into public.betti_action_index_entries(business_id,action_id,action_version,published_revision,record_ids,action,command_item,base_score,continuity_priority)
 select p_business_id,e->'action'->>'id',e->'action'->>'version',p_revision,
  array(select value::uuid from jsonb_array_elements_text(e->'action'->'recordIds')),e->'action',nullif(e->'commandItem','null'::jsonb),
  (e->'action'->'priority'->>'score')::integer,e->'continuityPriority' from jsonb_array_elements(p_entries)e;
 update public.betti_action_index_state set published_revision=p_revision,projection=p_projection-'_indexSummaryValidUntil',valid_until=p_valid_until,summary_valid_until=summary_until,
  plan=p_plan,engine_version=p_engine_version,processing_enabled=p_processing_enabled,built_at=now(),available_at=least(p_valid_until,summary_until),
  lease_id=null,lease_expires_at=null,attempts=0,last_error=null,updated_at=now() where business_id=p_business_id;
 delete from public.betti_action_index_invalidations where business_id=p_business_id and revision<=p_revision;
 return true;
end;$$;
revoke all on function public.publish_betti_action_index(uuid,uuid,bigint,jsonb,jsonb,timestamptz,text,text,boolean) from public,anon,authenticated;
grant execute on function public.publish_betti_action_index(uuid,uuid,bigint,jsonb,jsonb,timestamptz,text,text,boolean) to service_role;


-- Config changes must also fail closed on the mutation path, not only reads.
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
 if s.engine_version is distinct from 'betti-action-index:v1' or s.processing_enabled is distinct from p_processing_enabled
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


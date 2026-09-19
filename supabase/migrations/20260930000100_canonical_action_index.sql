-- Derived orchestration only. No bookkeeping facts are backfilled or changed.
-- Publication uses an MVCC input revision and compare-and-swap under a short lock.
create table public.betti_action_index_state (
 business_id uuid primary key references public.businesses(id) on delete cascade,
 revision bigint not null default 1,
 published_revision bigint not null default 0,
 global_revision bigint not null default 1,
 projection jsonb,
 plan text,
 engine_version text,
 processing_enabled boolean,
 built_at timestamptz,
 valid_until timestamptz,
 available_at timestamptz not null default now(),
 lease_id uuid,
 lease_expires_at timestamptz,
 attempts integer not null default 0,
 last_error text,
 updated_at timestamptz not null default now()
);
create table public.betti_action_index_invalidations (
 business_id uuid not null references public.betti_action_index_state(business_id) on delete cascade,
 record_id uuid not null,
 revision bigint not null,
 primary key(business_id,record_id)
);
create table public.betti_action_index_entries (
 business_id uuid not null references public.betti_action_index_state(business_id) on delete cascade,
 action_id text not null,
 action_version text not null,
 published_revision bigint not null,
 record_ids uuid[] not null,
 action jsonb not null,
 command_item jsonb,
 base_score integer not null,
 continuity_priority jsonb not null,
 primary key(business_id,action_id)
);
create index betti_action_index_ready_order on public.betti_action_index_entries(business_id,base_score desc,action_id);
alter table public.betti_action_index_state enable row level security;
alter table public.betti_action_index_invalidations enable row level security;
alter table public.betti_action_index_entries enable row level security;
revoke all on public.betti_action_index_state,public.betti_action_index_invalidations,public.betti_action_index_entries from public,anon,authenticated;
grant all on public.betti_action_index_state,public.betti_action_index_invalidations,public.betti_action_index_entries to service_role;

-- Internal invalidation. Fallback is business-wide whenever independence is not proven.
create function public.invalidate_betti_action_index(p_business_id uuid,p_records uuid[] default null)
returns void language plpgsql security definer set search_path='' as $$
declare next_revision bigint;
begin
 if p_business_id is null or not exists(select 1 from public.businesses where id=p_business_id) then return; end if;
 insert into public.betti_action_index_state(business_id) values(p_business_id)
 on conflict(business_id) do update set revision=betti_action_index_state.revision+1,
  available_at=least(betti_action_index_state.available_at,now()),updated_at=now()
 returning revision into next_revision;
 if coalesce(cardinality(p_records),0)=0 then
  update public.betti_action_index_state set global_revision=next_revision where business_id=p_business_id;
 else
  insert into public.betti_action_index_invalidations(business_id,record_id,revision)
  select p_business_id,r,next_revision from unnest(p_records) r where r is not null
  on conflict(business_id,record_id) do update set revision=excluded.revision;
 end if;
end;$$;
revoke all on function public.invalidate_betti_action_index(uuid,uuid[]) from public,anon,authenticated;

create function public.invalidate_betti_action_index_from_fact() returns trigger
language plpgsql security definer set search_path='' as $$
declare row_value jsonb; bid uuid; records uuid[]; previous_bid uuid;
begin
 row_value:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
 bid:=case when tg_table_name='businesses' then (row_value->>'id')::uuid else (row_value->>'business_id')::uuid end;
 -- Only these append-only, record-local facts have a proven narrow dependency.
 -- Shared/unknown sources deliberately invalidate the business, never guess independence.
 if tg_table_name in ('bookkeeping_review_events','bookkeeping_decisions','bookkeeping_documentation_events',
  'bookkeeping_processing_jobs','bookkeeping_mixed_use_answer_provenance') then
  if row_value->>'bookkeeping_record_id' is not null then records:=array[(row_value->>'bookkeeping_record_id')::uuid]; end if;
 elsif tg_table_name='bookkeeping_allocations' then
  select array[d.bookkeeping_record_id] into records from public.bookkeeping_decisions d
   where d.business_id=bid and d.id=(row_value->>'bookkeeping_decision_id')::uuid;
 end if;
 perform public.invalidate_betti_action_index(bid,records);
 if tg_op='UPDATE' and to_jsonb(old)->>'business_id' is distinct from row_value->>'business_id' then
  previous_bid:=(to_jsonb(old)->>'business_id')::uuid;
  perform public.invalidate_betti_action_index(previous_bid,null);
 end if;
 return case when tg_op='DELETE' then old else new end;
end;$$;
revoke all on function public.invalidate_betti_action_index_from_fact() from public,anon,authenticated;

-- Conservative coverage: every existing business-owned base table participates.
-- This does not run bookkeeping or publish index data inside a fact transaction.
-- Future business-owned tables must add the trigger; a schema contract test enforces it.
do $$declare t record;begin
 for t in select c.relname from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind='r' and c.relname not like 'betti_action_index_%'
   and (c.relname='businesses' or exists(select 1 from pg_catalog.pg_attribute a where a.attrelid=c.oid and a.attname='business_id' and not a.attisdropped))
 loop execute format('create trigger betti_action_index_invalidate after insert or update or delete on public.%I for each row execute function public.invalidate_betti_action_index_from_fact()',t.relname);end loop;
end;$$;
insert into public.betti_action_index_state(business_id) select id from public.businesses on conflict do nothing;

create function public.claim_betti_action_index_refresh(p_lease_id uuid,p_business_id uuid default null,p_engine_version text default 'betti-action-index:v1',p_processing_enabled boolean default true)
returns setof public.betti_action_index_state language plpgsql security definer set search_path='' as $$
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'Worker required' using errcode='42501';end if;
 return query with candidate as (
  select s.business_id from public.betti_action_index_state s
  where (p_business_id is null or s.business_id=p_business_id)
   and (s.published_revision<>s.revision or s.projection is null or s.valid_until<=now()
    or s.engine_version is distinct from p_engine_version or s.processing_enabled is distinct from p_processing_enabled)
   and s.available_at<=now() and (s.lease_expires_at is null or s.lease_expires_at<=now())
  order by s.available_at,s.business_id for update skip locked limit 1
 ) update public.betti_action_index_state s set lease_id=p_lease_id,lease_expires_at=now()+interval '30 seconds',
  attempts=s.attempts+1,updated_at=now() from candidate c where s.business_id=c.business_id returning s.*;
end;$$;
revoke all on function public.claim_betti_action_index_refresh(uuid,uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.claim_betti_action_index_refresh(uuid,uuid,text,boolean) to service_role;

-- Service-only, narrowly scoped read of the owner's canonical snapshot. Claims are
-- transaction-local and restored on success/error. No session or credentials are minted.
-- Existing owner/AAL2 canonical readers execute unchanged; no customer can invoke this.
create function public.read_betti_action_index_build(p_business_id uuid,p_lease_id uuid,p_as_of timestamptz)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.betti_action_index_state; owner_id uuid; saved_claims text; result jsonb; membership jsonb;
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'Worker required' using errcode='42501';end if;
 select * into s from public.betti_action_index_state where business_id=p_business_id and lease_id=p_lease_id and lease_expires_at>now();
 if not found then raise exception 'Index lease changed' using errcode='40001';end if;
 select owner_user_id into owner_id from public.businesses where id=p_business_id;
 if owner_id is null then raise exception 'Business unavailable';end if;
 saved_claims:=current_setting('request.jwt.claims',true);
 begin
  perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated','aal','aal2')::text,true);
  result:=public.read_betti_work_inputs(p_business_id,p_as_of);
  select to_jsonb(m) into membership from public.current_customer_membership m where m.business_id=p_business_id;
  perform set_config('request.jwt.claims',coalesce(saved_claims,''),true);
 exception when others then
  perform set_config('request.jwt.claims',coalesce(saved_claims,''),true);raise;
 end;
 return jsonb_build_object('revision',s.revision,'snapshot',result,'membership',membership);
end;$$;
revoke all on function public.read_betti_action_index_build(uuid,uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.read_betti_action_index_build(uuid,uuid,timestamptz) to service_role;

create function public.publish_betti_action_index(p_business_id uuid,p_lease_id uuid,p_revision bigint,p_projection jsonb,p_entries jsonb,p_valid_until timestamptz,p_plan text,p_engine_version text,p_processing_enabled boolean)
returns boolean language plpgsql security definer set search_path='' as $$
declare s public.betti_action_index_state;
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'Worker required' using errcode='42501';end if;
 select * into s from public.betti_action_index_state where business_id=p_business_id for update;
 if s.lease_id is distinct from p_lease_id or s.lease_expires_at<=now() then return false;end if;
 if s.revision<>p_revision then
  update public.betti_action_index_state set lease_id=null,lease_expires_at=null,available_at=now() where business_id=p_business_id;return false;
 end if;
 if p_projection->>'businessId' is distinct from p_business_id::text or jsonb_typeof(p_entries)<>'array'
  or jsonb_array_length(p_entries)>1000 or p_valid_until<=now() or p_valid_until>now()+interval '25 hours'
  or p_plan not in('business','expenses') then raise exception 'Invalid index publication';end if;
 if exists(select 1 from jsonb_array_elements(p_entries)e where e->'action'->>'id' is null or e->'action'->>'version' is null
  or exists(select 1 from jsonb_array_elements_text(e->'action'->'recordIds')rid where not exists(select 1 from public.bookkeeping_records r where r.id=rid::uuid and r.business_id=p_business_id)))
 then raise exception 'Unowned index publication';end if;
 delete from public.betti_action_index_entries where business_id=p_business_id;
 insert into public.betti_action_index_entries(business_id,action_id,action_version,published_revision,record_ids,action,command_item,base_score,continuity_priority)
 select p_business_id,e->'action'->>'id',e->'action'->>'version',p_revision,
  array(select value::uuid from jsonb_array_elements_text(e->'action'->'recordIds')),e->'action',nullif(e->'commandItem','null'::jsonb),
  (e->'action'->'priority'->>'score')::integer,e->'continuityPriority' from jsonb_array_elements(p_entries)e;
 update public.betti_action_index_state set published_revision=p_revision,projection=p_projection,valid_until=p_valid_until,
  plan=p_plan,engine_version=p_engine_version,processing_enabled=p_processing_enabled,built_at=now(),available_at=p_valid_until,
  lease_id=null,lease_expires_at=null,attempts=0,last_error=null,updated_at=now() where business_id=p_business_id;
 delete from public.betti_action_index_invalidations where business_id=p_business_id and revision<=p_revision;
 return true;
end;$$;
revoke all on function public.publish_betti_action_index(uuid,uuid,bigint,jsonb,jsonb,timestamptz,text,text,boolean) from public,anon,authenticated;
grant execute on function public.publish_betti_action_index(uuid,uuid,bigint,jsonb,jsonb,timestamptz,text,text,boolean) to service_role;

create function public.retry_betti_action_index_refresh(p_business_id uuid,p_lease_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'Worker required' using errcode='42501';end if;
 update public.betti_action_index_state set lease_id=null,lease_expires_at=null,last_error='refresh_failed',
  available_at=now()+interval '10 seconds',updated_at=now() where business_id=p_business_id and lease_id=p_lease_id;
end;$$;
revoke all on function public.retry_betti_action_index_refresh(uuid,uuid) from public,anon,authenticated;
grant execute on function public.retry_betti_action_index_refresh(uuid,uuid) to service_role;

-- Both Home and guided work use this one selector over current derived entries.
-- Scores/continuity variants were produced by the canonical engine, not SQL rules.
create function public.read_betti_action_index(p_business_id uuid,p_continuity_record_id uuid default null,p_view text default 'full',p_processing_enabled boolean default true)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare s public.betti_action_index_state; result jsonb; ready jsonb; deferred jsonb; waiting jsonb;
 next_action jsonb; pending boolean; refresh_state text; invalid_all boolean; catch_count integer; current_count integer;
begin
 if auth.uid() is null or coalesce(auth.jwt()->>'aal','')<>'aal2'
  or not exists(select 1 from public.businesses where id=p_business_id and owner_user_id=auth.uid())
 then raise exception 'Business unavailable' using errcode='42501';end if;
 if p_view not in('full','guided') then raise exception 'Invalid index view';end if;
 select * into s from public.betti_action_index_state where business_id=p_business_id;
 if s.projection is null or s.engine_version is distinct from 'betti-action-index:v1'
  or s.processing_enabled is distinct from p_processing_enabled then return null;end if;
 invalid_all:=s.global_revision>s.published_revision or s.valid_until<=now();
 pending:=s.revision<>s.published_revision or invalid_all;
 refresh_state:=case when s.lease_expires_at>now() then 'processing' when s.last_error is not null then 'retry_scheduled' else 'queued' end;
 with eligible as materialized (
  select case when p_continuity_record_id=any(e.record_ids) then jsonb_set(e.action,'{priority}',e.continuity_priority) else e.action end action,
   case when p_continuity_record_id=any(e.record_ids) then (e.continuity_priority->>'score')::integer else e.base_score end score,e.action_id
  from public.betti_action_index_entries e where e.business_id=p_business_id and not invalid_all
   and e.published_revision=s.published_revision
   and not exists(select 1 from public.betti_action_index_invalidations i where i.business_id=e.business_id
    and i.revision>e.published_revision and i.record_id=any(e.record_ids))
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

create table public.betti_action_index_commands (
 business_id uuid not null references public.businesses(id) on delete cascade,
 question_id uuid not null,question_version uuid not null,
 function_name text not null,arguments jsonb not null,result jsonb not null,
 command_item jsonb not null,action jsonb not null,
 committed_at timestamptz not null default now(),
 primary key(business_id,question_id,question_version)
);
alter table public.betti_action_index_commands enable row level security;
revoke all on public.betti_action_index_commands from public,anon,authenticated;
grant all on public.betti_action_index_commands to service_role;

create function public.read_betti_indexed_question(p_business_id uuid,p_question_id uuid,p_question_version uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare s public.betti_action_index_state; e public.betti_action_index_entries;
begin
 if auth.uid() is null or coalesce(auth.jwt()->>'aal','')<>'aal2'
  or not exists(select 1 from public.businesses where id=p_business_id and owner_user_id=auth.uid())
 then raise exception 'Business unavailable' using errcode='42501';end if;
 select * into s from public.betti_action_index_state where business_id=p_business_id;
 if s.projection is null then return jsonb_build_object('initialized',false);end if;
 select * into e from public.betti_action_index_entries a where a.business_id=p_business_id
  and a.action->'question'->>'id'=p_question_id::text and a.action->'question'->>'version'=p_question_version::text
  and a.action->>'status'='actionable' and a.published_revision=s.published_revision
  and a.published_revision>=s.global_revision and s.valid_until>now()
  and not exists(select 1 from public.betti_action_index_invalidations i where i.business_id=a.business_id
   and i.revision>a.published_revision and i.record_id=any(a.record_ids));
 if e.action is null then
  return coalesce((select jsonb_build_object('initialized',true,'action',c.action,'commandItem',c.command_item,
   'replay',jsonb_build_object('functionName',c.function_name,'arguments',c.arguments))
   from public.betti_action_index_commands c where c.business_id=p_business_id and c.question_id=p_question_id and c.question_version=p_question_version),
   jsonb_build_object('initialized',true,'action',null,'commandItem',null));
 end if;
 return jsonb_build_object('initialized',true,'action',e.action,'commandItem',e.command_item);
end;$$;
revoke all on function public.read_betti_indexed_question(uuid,uuid,uuid) from public,anon;
grant execute on function public.read_betti_indexed_question(uuid,uuid,uuid) to authenticated;

create function public.execute_betti_indexed_question(p_business_id uuid,p_question_id uuid,p_question_version uuid,p_function_name text,p_arguments jsonb,p_continuity_record_id uuid default null,p_processing_enabled boolean default true)
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
 insert into public.betti_action_index_commands(business_id,question_id,question_version,function_name,arguments,result,command_item,action)
 values(p_business_id,p_question_id,p_question_version,p_function_name,p_arguments,result,entry->'commandItem',entry->'action');
 return result||jsonb_build_object('_guidedIndex',public.read_betti_action_index(p_business_id,p_continuity_record_id,'guided',p_processing_enabled));
end;$$;
revoke all on function public.execute_betti_indexed_question(uuid,uuid,uuid,text,jsonb,uuid,boolean) from public,anon,service_role;
grant execute on function public.execute_betti_indexed_question(uuid,uuid,uuid,text,jsonb,uuid,boolean) to authenticated;

-- Explicit leased worker preparation, never called by a GET. This preserves the
-- existing reconciliation command when an after-response notification was lost.
create function public.prepare_betti_action_index_refresh(p_business_id uuid,p_lease_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare owner_id uuid; saved_claims text;
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'Worker required' using errcode='42501';end if;
 if not exists(select 1 from public.betti_action_index_state where business_id=p_business_id and lease_id=p_lease_id and lease_expires_at>now())
 then raise exception 'Index lease changed' using errcode='40001';end if;
 select owner_user_id into owner_id from public.businesses where id=p_business_id;
 saved_claims:=current_setting('request.jwt.claims',true);
 begin
  perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated','aal','aal2')::text,true);
  perform public.reconcile_current_betti_questions();
  perform set_config('request.jwt.claims',coalesce(saved_claims,''),true);
 exception when others then perform set_config('request.jwt.claims',coalesce(saved_claims,''),true);raise;end;
end;$$;
revoke all on function public.prepare_betti_action_index_refresh(uuid,uuid) from public,anon,authenticated;
grant execute on function public.prepare_betti_action_index_refresh(uuid,uuid) to service_role;

-- Processing clocks cannot expire unrelated ready customer actions.
alter table public.betti_action_index_state add column summary_valid_until timestamptz;
update public.betti_action_index_state set summary_valid_until=valid_until;
create or replace function public.claim_betti_action_index_refresh(p_lease_id uuid,p_business_id uuid default null,p_engine_version text default 'betti-action-index:v1',p_processing_enabled boolean default true)
returns setof public.betti_action_index_state language plpgsql security definer set search_path='' as $$
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'Worker required' using errcode='42501';end if;
 return query with candidate as (
  select s.business_id from public.betti_action_index_state s
  where (p_business_id is null or s.business_id=p_business_id)
   and (s.published_revision<>s.revision or s.projection is null or s.valid_until<=now() or s.summary_valid_until<=now()
    or s.engine_version is distinct from p_engine_version or s.processing_enabled is distinct from p_processing_enabled)
   and s.available_at<=now() and (s.lease_expires_at is null or s.lease_expires_at<=now())
  order by s.available_at,s.business_id for update skip locked limit 1
 ) update public.betti_action_index_state s set lease_id=p_lease_id,lease_expires_at=now()+interval '30 seconds',
  attempts=s.attempts+1,updated_at=now() from candidate c where s.business_id=c.business_id returning s.*;
end;$$;
revoke all on function public.claim_betti_action_index_refresh(uuid,uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.claim_betti_action_index_refresh(uuid,uuid,text,boolean) to service_role;

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
 update public.betti_action_index_state set published_revision=p_revision,projection=p_projection-'_indexSummaryValidUntil',valid_until=p_valid_until,summary_valid_until=summary_until,
  plan=p_plan,engine_version=p_engine_version,processing_enabled=p_processing_enabled,built_at=now(),available_at=least(p_valid_until,summary_until),
  lease_id=null,lease_expires_at=null,attempts=0,last_error=null,updated_at=now() where business_id=p_business_id;
 delete from public.betti_action_index_invalidations where business_id=p_business_id and revision<=p_revision;
 return true;
end;$$;
revoke all on function public.publish_betti_action_index(uuid,uuid,bigint,jsonb,jsonb,timestamptz,text,text,boolean) from public,anon,authenticated;
grant execute on function public.publish_betti_action_index(uuid,uuid,bigint,jsonb,jsonb,timestamptz,text,text,boolean) to service_role;

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
 if s.projection is null or s.engine_version is distinct from 'betti-action-index:v1'
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


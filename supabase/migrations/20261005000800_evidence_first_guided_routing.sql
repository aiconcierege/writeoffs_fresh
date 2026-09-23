-- Presentation-only capacity change. Existing financial facts are untouched.
-- Personal exception review is one account-scoped interaction up to the existing
-- bulk-review safety bound. Other guided assertions retain their eight-item bound.
alter table public.betti_guided_assertions
 drop constraint betti_guided_assertions_items_check;
alter table public.betti_guided_assertions
 add constraint betti_guided_assertions_items_check check (
  jsonb_typeof(items)='array' and jsonb_array_length(items) between 1 and
   case when action='personal_exception_sweep' then 100 else 8 end);

do $$ declare original text;updated text;begin
 original:=pg_get_functiondef('public.answer_betti_guided_work(uuid,text,text,jsonb,jsonb)'::regprocedure);
 updated:=replace(original,
  'jsonb_array_length(p_items) not between 1 and 8',
  'jsonb_array_length(p_items) not between 1 and (case when p_action=''personal_exception_sweep'' then 100 else 8 end)');
 if updated=original then raise exception 'Expected guided assertion capacity guard missing';end if;
 execute updated;
end;$$;

-- New worker signature keeps old deployments compatible during rollout. Only
-- service-role callers can exclude businesses; customer commands cannot freeze work.
create or replace function public.claim_betti_action_index_refresh_excluding(p_lease_id uuid,p_business_id uuid default null,p_engine_version text default 'betti-action-index:v1',p_processing_enabled boolean default true,p_excluded_business_ids uuid[] default '{}')
returns setof public.betti_action_index_state language plpgsql security definer set search_path='' as $$
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'Worker required' using errcode='42501';end if;
 return query with candidate as (
  select s.business_id from public.betti_action_index_state s
  where not (s.business_id=any(coalesce(p_excluded_business_ids,'{}'::uuid[])))
   and (p_business_id is null or s.business_id=p_business_id)
   and (s.published_revision<>s.revision or s.projection is null or s.valid_until<=now() or s.summary_valid_until<=now()
    or s.engine_version is distinct from p_engine_version or s.processing_enabled is distinct from p_processing_enabled)
   and s.available_at<=now() and (s.lease_expires_at is null or s.lease_expires_at<=now())
  order by (s.built_at is not null) desc,s.available_at,s.business_id for update skip locked limit 1
 ) update public.betti_action_index_state s set lease_id=p_lease_id,lease_expires_at=now()+interval '30 seconds',
  attempts=s.attempts+1,updated_at=now() from candidate c where s.business_id=c.business_id returning s.*;
end;$$;
revoke all on function public.claim_betti_action_index_refresh_excluding(uuid,uuid,text,boolean,uuid[]) from public,anon,authenticated;
grant execute on function public.claim_betti_action_index_refresh_excluding(uuid,uuid,text,boolean,uuid[]) to service_role;

-- Reader and answer-command contracts advance together. Neither may accept an
-- older cached routing policy. This does not invalidate/update customer rows.
do $$ declare original text;updated text;ranked text;signature text;begin
 foreach signature in array array[
  'public.read_betti_action_index(uuid,uuid,text,boolean)',
  'public.execute_betti_indexed_question(uuid,uuid,uuid,text,jsonb,uuid,boolean)'
 ] loop
  original:=pg_get_functiondef(signature::regprocedure);
  updated:=replace(original,'betti-action-index:v2-render-ready','betti-action-index:v3-specific-facts');
  if updated=original then raise exception 'Expected action-index version missing: %',signature;end if;
  if signature='public.read_betti_action_index(uuid,uuid,text,boolean)' then
   -- Priority is computed by the canonical TypeScript projector, then persisted.
   -- The fast reader must retain that same ordering, including continuity reads.
   ranked:=replace(updated,'else e.base_score end score,e.action_id',
    'else e.base_score end score,coalesce((e.action#>>''{priority,routingTier}'')::integer,0) routing_tier,e.action_id');
   if ranked=updated then raise exception 'Expected indexed score selection missing';end if;
   updated:=replace(ranked,'order by score desc,action_id','order by routing_tier desc,score desc,action_id');
   if updated=ranked then raise exception 'Expected indexed ordering missing';end if;
  end if;
  execute updated;
 end loop;
end;$$;

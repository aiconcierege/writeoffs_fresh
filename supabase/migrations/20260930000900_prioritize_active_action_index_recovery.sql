-- Recover established conversations before bootstrapping dormant indexes.
-- This changes refresh scheduling only, never customer action priority/eligibility.
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
  order by (s.built_at is not null) desc,s.available_at,s.business_id for update skip locked limit 1
 ) update public.betti_action_index_state s set lease_id=p_lease_id,lease_expires_at=now()+interval '30 seconds',
  attempts=s.attempts+1,updated_at=now() from candidate c where s.business_id=c.business_id returning s.*;
end;$$;
revoke all on function public.claim_betti_action_index_refresh(uuid,uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.claim_betti_action_index_refresh(uuid,uuid,text,boolean) to service_role;

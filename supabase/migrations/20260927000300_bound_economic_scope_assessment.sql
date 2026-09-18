-- Evaluate commercial scope once per eligible business, not once for every historical
-- decision/record during a global scan. The existing canonical scope function remains
-- authoritative; no duplicated coverage or pricing logic.
-- Versioned upgrade work, never a read-path side effect. Canonical workers
-- evaluate evidence; this function does not classify or answer anything.
create or replace function public.enqueue_economic_evidence_reassessment(p_limit integer default 12,p_business_id uuid default null)
returns integer language plpgsql security definer set search_path='' as $$
declare r record; n integer:=0;
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'trusted bookkeeping worker required';end if;
 if p_limit not between 1 and 100 then raise exception 'invalid reassessment limit';end if;
 for r in with eligible as materialized (
 select b.id,b.business_id,b.occurred_on,b.created_at,d.id decision_id from public.bookkeeping_records b
 join public.bookkeeping_decisions d on d.bookkeeping_record_id=b.id and d.business_id=b.business_id
 where b.source_kind='financial_transaction' and d.treatment='unresolved' and d.provenance<>'user'
 and (p_business_id is null or b.business_id=p_business_id)
 and not exists(select 1 from public.bookkeeping_decisions successor where successor.supersedes_decision_id=d.id)
 and not exists(select 1 from public.bookkeeping_processing_jobs j where j.business_id=b.business_id
   and j.bookkeeping_record_id=b.id and j.processing_reason='source_economic_evidence_v1')
) , scopes as materialized (
 select tenants.business_id,(public.bookkeeping_scope_authority(tenants.business_id)->>'authorizedStart')::date start_date
 from (select distinct business_id from eligible) tenants
 ) select e.id,e.business_id,e.decision_id from eligible e join scopes s on s.business_id=e.business_id
 where e.occurred_on>=s.start_date order by e.created_at,e.id limit p_limit loop
  perform public.request_bookkeeping_processing(r.business_id,r.id,'source_economic_evidence_v1',
    'source-economic:v1:record:'||r.id::text||':decision:'||r.decision_id::text);
  n:=n+1;
 end loop;
 return n;
end;$$;
revoke all on function public.enqueue_economic_evidence_reassessment(integer,uuid) from public,anon,authenticated;
grant execute on function public.enqueue_economic_evidence_reassessment(integer,uuid) to service_role;

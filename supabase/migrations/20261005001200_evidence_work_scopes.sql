-- Work orchestration only. No coverage purchase, customer fact, financial row,
-- projection publication or worker exclusion is changed by this migration.
-- Joining-month coverage is fixed; the operational recent window lives in the
-- projector and cannot authorize or bill historical activity.
create or replace function public.bookkeeping_scope_authority(p_business_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 with authority as (
  select b.id,b.catch_up_start_date selected_start,
   case when b.onboarding_state='completed' then (b.onboarding_completed_at at time zone 'UTC')::date end activation,
   (s.joined_month-interval '1 month')::date included_start,public.customer_coverage_start(b.id) coverage_start
  from public.businesses b left join public.business_customer_setup s on s.business_id=b.id where b.id=p_business_id
 ), scope as (
  select *,case when selected_start is not null and coverage_start is not null then greatest(selected_start,coverage_start) end active_start,
   coalesce(selected_start<included_start and coverage_start<=selected_start,false) historical from authority
 )
 select jsonb_build_object('businessId',id,'selectedStart',selected_start,'authorizedStart',active_start,
  'includedStart',included_start,'activation',activation,'historicalAuthorized',historical,
  'currentFrom',case when active_start is not null and included_start is not null then greatest(active_start,included_start) end,
  'catchUp',case when historical and included_start>active_start then jsonb_build_object('from',active_start,'through',included_start-1) end)
 from scope
$$;
revoke all on function public.bookkeeping_scope_authority(uuid) from public,anon,authenticated;
grant execute on function public.bookkeeping_scope_authority(uuid) to service_role;


-- Reject cached projections from the former routing policy. No mass refresh:
-- the existing worker exclusion and normal lease protocol remain authoritative.
do $$ declare original text; updated text; signature text; begin
 foreach signature in array array[
  'public.read_betti_action_index(uuid,uuid,text,boolean)',
  'public.execute_betti_indexed_question(uuid,uuid,uuid,text,jsonb,uuid,boolean)'
 ] loop
  original:=pg_get_functiondef(signature::regprocedure);
  updated:=replace(original,'betti-action-index:v3-specific-facts','betti-action-index:v4-evidence-scopes');
  if updated=original then raise exception 'Expected action-index version missing: %',signature; end if;
  if signature='public.read_betti_action_index(uuid,uuid,text,boolean)' then
   updated:=replace(updated,'''receipt_upload_sweep'',''receipt_availability''',
    '''receipt_upload_sweep'',''receipt_availability'',''evidence_opportunity''');
   if position('''evidence_opportunity''' in updated)=0 then raise exception 'Expected grouped-action invalidation missing';end if;
  end if;
  execute updated;
 end loop;
end; $$;

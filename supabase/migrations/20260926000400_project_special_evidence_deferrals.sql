-- Expose the existing seven-day special-workflow deferral without creating questions.
-- Only the current decision's explicit deferral applies; history remains immutable.
alter function public.read_betti_work_context(uuid) rename to read_betti_work_context_before_special_guidance;
revoke all on function public.read_betti_work_context_before_special_guidance(uuid) from authenticated;
create function public.read_betti_work_context(p_business_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb; begin
 result:=public.read_betti_work_context_before_special_guidance(p_business_id);
 return result||jsonb_build_object('specialDeferrals',coalesce((
  select jsonb_agg(to_jsonb(d)) from (
   select distinct on(s.bookkeeping_record_id) s.business_id,s.id,
    s.bookkeeping_record_id as record_id,s.decision_id,s.created_at
   from public.bookkeeping_special_events s
   join public.customer_transaction_work w on w.record_id=s.bookkeeping_record_id
    and w.business_id=s.business_id and w.decision_id=s.decision_id
   where s.business_id=p_business_id and s.action='defer'
    and exists(select 1 from jsonb_array_elements(result->'records') r where r->>'record_id'=s.bookkeeping_record_id::text)
   order by s.bookkeeping_record_id,s.created_at desc,s.id desc
  ) d),'[]'::jsonb));
end;$$;
revoke all on function public.read_betti_work_context(uuid) from public,anon;
grant execute on function public.read_betti_work_context(uuid) to authenticated;

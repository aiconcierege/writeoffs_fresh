-- Dedicated staging only. Restore the preceding app deployment first.
-- Removes only the new command wrapper and restores prior read definitions; no customer data changes.
begin;
create or replace function public.read_betti_work_context_before_special_guidance(p_business_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb; begin
 result:=public.read_betti_work_context_before_guided(p_business_id); -- owner + MFA boundary
 result:=jsonb_set(result,'{records}',coalesce((select jsonb_agg(r || jsonb_build_object(
  'merchant',w.merchant,'transaction_id',w.transaction_id,'review_version',public.guided_purchase_version(w.record_id),
  'customer_authored',exists(select 1 from public.bookkeeping_decisions d where d.bookkeeping_record_id=w.record_id and d.actor_user_id is not null)))
  from jsonb_array_elements(result->'records') r left join public.customer_transaction_work w
  on w.record_id=(r->>'record_id')::uuid and w.business_id=p_business_id),'[]'));
 result:=jsonb_set(result,'{accounts}',coalesce((select jsonb_agg(a || jsonb_build_object('display_name',f.display_name,'mask',f.mask_last_four))
  from jsonb_array_elements(result->'accounts') a join public.financial_accounts f on f.id=(a->>'id')::uuid and f.business_id=p_business_id),'[]'));
 return result || jsonb_build_object('guidedReviews',coalesce((select jsonb_agg(to_jsonb(g) order by g.created_at,g.id)
  from public.betti_guided_assertions g where g.business_id=p_business_id),'[]'));
end;$$;
revoke all on function public.read_betti_work_context_before_special_guidance(uuid) from public,anon,authenticated;

create or replace function public.read_betti_work_context(p_business_id uuid) returns jsonb
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

drop function if exists public.reconcile_current_betti_questions();
commit;

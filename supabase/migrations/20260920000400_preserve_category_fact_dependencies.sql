-- Category-only enrichment must retain the reusable factual dependencies of the
-- allocation it copies. Otherwise a later corrected percentage cannot reassess it.
create function public.preserve_category_enrichment_fact_dependencies()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.provenance='automation' and new.reason like 'Schedule C operating-expense classification:%' then
   insert into public.bookkeeping_decision_deduction_fact_dependencies(
     business_id,bookkeeping_record_id,bookkeeping_decision_id,fact_event_id,fact_type,scope_kind,scope_key)
   select dep.business_id,dep.bookkeeping_record_id,new.id,dep.fact_event_id,dep.fact_type,dep.scope_kind,dep.scope_key
   from public.bookkeeping_decision_deduction_fact_dependencies dep
   where dep.business_id=new.business_id and dep.bookkeeping_record_id=new.bookkeeping_record_id
     and dep.bookkeeping_decision_id=new.supersedes_decision_id
   on conflict(bookkeeping_decision_id,fact_event_id) do nothing;
 end if;
 return new;
end; $$;
revoke all on function public.preserve_category_enrichment_fact_dependencies() from public,anon,authenticated;
create trigger category_enrichment_fact_dependencies after insert on public.bookkeeping_decisions
for each row execute function public.preserve_category_enrichment_fact_dependencies();

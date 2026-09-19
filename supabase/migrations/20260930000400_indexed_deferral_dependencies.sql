-- Deferring one special record and reviewing a versioned visible group do not
-- invalidate unrelated ordinary questions. All sweeps still refresh on any local
-- change, since group membership and guided-review evidence can change.
create or replace function public.invalidate_betti_action_index_from_fact() returns trigger
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
 elsif tg_table_name='bookkeeping_special_events' and row_value->>'action'='defer' then
  records:=array[(row_value->>'bookkeeping_record_id')::uuid];
 elsif tg_table_name='betti_guided_assertions' then
  select array_agg((item->>'recordId')::uuid) into records
   from jsonb_array_elements(row_value->'items') item;
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


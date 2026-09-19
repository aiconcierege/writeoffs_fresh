-- Known relationship/account commands invalidate their proven dependency set,
-- preserving unrelated ready work. Unknown sources remain business-wide.
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
 elsif tg_table_name='bookkeeping_special_events' then
  -- Include both relationship ends, including a previous purchase on unlink.
  select array_agg(distinct r) into records from (
   select (row_value->>'bookkeeping_record_id')::uuid r
   union all select nullif(row_value->>'original_record_id','')::uuid
   union all select e.original_record_id from public.bookkeeping_special_events e
    where e.business_id=bid and e.bookkeeping_record_id=(row_value->>'bookkeeping_record_id')::uuid
  ) affected where r is not null;
 elsif tg_table_name='financial_account_use_events' then
  select array_agg(distinct f.bookkeeping_record_id) into records
  from public.bookkeeping_financial_sources f join public.financial_transactions t
   on t.id=f.financial_transaction_id and t.business_id=f.business_id
  where f.business_id=bid and t.financial_account_id=(row_value->>'financial_account_id')::uuid;
 elsif tg_table_name='betti_guided_assertions' then
  select array_agg((item->>'recordId')::uuid) into records
   from jsonb_array_elements(row_value->'items') item;
 elsif tg_table_name='bookkeeping_allocations' then
  select array[d.bookkeeping_record_id] into records from public.bookkeeping_decisions d
   where d.business_id=bid and d.id=(row_value->>'bookkeeping_decision_id')::uuid;
 end if;
 -- A moved dependency must invalidate its old partition too. Normal append-only
 -- fact writers never take this conservative UPDATE branch.
 if tg_op='UPDATE' and (to_jsonb(old)->>'bookkeeping_record_id' is distinct from row_value->>'bookkeeping_record_id'
  or to_jsonb(old)->>'bookkeeping_decision_id' is distinct from row_value->>'bookkeeping_decision_id') then records:=null;end if;
 perform public.invalidate_betti_action_index(bid,records);
 if tg_op='UPDATE' and to_jsonb(old)->>'business_id' is distinct from row_value->>'business_id' then
  previous_bid:=(to_jsonb(old)->>'business_id')::uuid;
  perform public.invalidate_betti_action_index(previous_bid,null);
 end if;
 return case when tg_op='DELETE' then old else new end;
end;$$;
revoke all on function public.invalidate_betti_action_index_from_fact() from public,anon,authenticated;


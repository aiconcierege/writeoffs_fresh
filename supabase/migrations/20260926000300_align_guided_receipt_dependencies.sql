-- Receipt availability uses the same current canonical document work as the
-- projection, not unrelated delivery/derivative jobs in the underlying queue.
create function public.guided_receipt_work_pending(p_business_id uuid) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare ctx jsonb:=public.read_betti_work_context(p_business_id); j jsonb; linked uuid[];begin
 for j in select value from jsonb_array_elements(ctx->'jobs') where value->>'kind'='document'
  and value->>'state' in ('pending','processing','retryable') loop
  select array_agg(distinct id) into linked from (
   select (l->>'record_id')::uuid id from jsonb_array_elements(ctx->'documentRecords') l where l->>'document_id'=j->>'document_id'
   union all
   select (l->>'record_id')::uuid from jsonb_array_elements(ctx->'links') l where l->>'receipt_id'=j->>'receipt_id'
    or exists(select 1 from jsonb_array_elements(ctx->'documents') d where d->>'id'=j->>'document_id' and d->>'receipt_id'=l->>'receipt_id')
  ) ids;
  if linked is null or exists(select 1 from public.bookkeeping_records r where r.business_id=p_business_id and r.id=any(linked)
   and public.bookkeeping_activity_in_scope(p_business_id,r.occurred_on)) then return true;end if;
 end loop;
 return false;
end;$$;
revoke all on function public.guided_receipt_work_pending(uuid) from public,anon,authenticated;

do $$ declare original text;updated text;begin
 original:=pg_get_functiondef('public.answer_betti_guided_work(uuid,text,text,jsonb,jsonb)'::regprocedure);
 updated:=replace(original,
  $old$exists(select 1 from public.receipt_processing_jobs j where j.business_id=bid and j.state in ('pending','processing','retryable'))$old$,
  'public.guided_receipt_work_pending(bid)');
 if updated=original then raise exception 'Expected receipt dependency guard missing';end if;
 execute updated;
end;$$;

-- Receipt availability needs status fields for the existing result contract.
-- Load them once for the bounded group after acquiring all existing record locks,
-- rather than evaluating the same tenant-wide question functions per purchase.
do $$ declare original text; updated text; begin
 original:=pg_get_functiondef('public.apply_guided_review(uuid,text,text,jsonb)'::regprocedure);
 updated:=replace(original,
  $old$ -- Validate every ID and expected version before any change. All mutations share one transaction.$old$,
  $new$ if p_action='receipt_unavailable' then
  for item in select value from jsonb_array_elements(p_items) order by value->>'recordId' loop
   perform pg_advisory_xact_lock(hashtextextended('bookkeeping-record:'||(item->>'recordId'),0));
   perform pg_advisory_xact_lock(hashtextextended(item->>'recordId',41));
  end loop;
  select array_agg(v) into validated_rows from public.customer_transaction_work v
   where v.business_id=bid and v.record_id in(select (i->>'recordId')::uuid from jsonb_array_elements(p_items) i);
 end if;
 -- Validate every ID and expected version before any change. All mutations share one transaction.$new$);
 if updated=original then raise exception 'Expected review validation boundary missing'; end if;
 original:=updated;
 updated:=replace(original,
  $old$  select * into w from public.customer_transaction_work where business_id=bid and record_id=(item->>'recordId')::uuid;
  if not found$old$,
  $new$  if p_action='receipt_unavailable' then
   select v.* into w from unnest(validated_rows) v where v.record_id=(item->>'recordId')::uuid;
  else
   select * into w from public.customer_transaction_work where business_id=bid and record_id=(item->>'recordId')::uuid;
  end if;
  if not found$new$);
 if updated=original then raise exception 'Expected review row validation missing'; end if;
 original:=updated;
 updated:=replace(original,
  $old$  if p_action='receipt_unavailable' then validated_rows:=array_append(validated_rows,w); end if;$old$,'');
 if updated=original then raise exception 'Expected row cache missing'; end if;
 original:=updated;
 updated:=replace(original,'row_index:=row_index+1; w:=validated_rows[row_index];',
  'select v.* into w from unnest(validated_rows) v where v.record_id=(item->>''recordId'')::uuid;');
 if updated=original then raise exception 'Expected receipt mutation cache missing'; end if;
 execute updated;
end; $$;

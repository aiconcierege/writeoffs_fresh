-- Batch reassessment changes action eligibility, not financial facts. Reject an
-- older cached conversation; refresh still honors the staging worker exclusion.
do $$ declare original text; updated text; signature text; begin
 foreach signature in array array[
  'public.read_betti_action_index(uuid,uuid,text,boolean)',
  'public.execute_betti_indexed_question(uuid,uuid,uuid,text,jsonb,uuid,boolean)'
 ] loop
  original:=pg_get_functiondef(signature::regprocedure);
  updated:=replace(original,'betti-action-index:v5-evidence-batches','betti-action-index:v6-initial-evidence-batches');
  if updated=original then raise exception 'Expected evidence scope index missing: %',signature;end if;
  execute updated;
 end loop;
end; $$;

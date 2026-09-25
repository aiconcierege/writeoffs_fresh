-- The displayed journey and its command must use the same authoritative
-- document dependencies. Write-disabled shadow analysis is not a customer gate.
do $$ declare original text; updated text; begin
 original:=pg_get_functiondef('public.answer_catch_up_stage(uuid,text,date,date,text,text,jsonb,uuid[],uuid[])'::regprocedure);
 updated:=replace(original,
  $old$exists(
  select 1 from public.receipt_processing_jobs j where j.business_id=bid and j.state in ('pending','processing','retryable'))$old$,
  'public.guided_receipt_work_pending(bid)');
 if updated=original then raise exception 'Expected catch-up document guard missing';end if;
 execute updated;
end;$$;

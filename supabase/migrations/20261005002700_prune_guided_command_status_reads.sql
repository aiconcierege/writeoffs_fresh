-- Column-prune command snapshots: SELECT * evaluates unrelated question views.
-- Keep the public version function's original narrow SQL expression so passing
-- a composite row does not force evaluation of unused work/status columns.
CREATE OR REPLACE FUNCTION public.guided_purchase_version(p_record uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select md5(jsonb_build_array(w.decision_id,w.has_receipt,w.receipt_unavailable,
   public.current_bookkeeping_evidence_fingerprint(w.business_id,w.record_id),u.id,b.catch_up_start_date,
   public.customer_coverage_start(b.id))::text)
 from public.customer_transaction_work w join public.businesses b on b.id=w.business_id
 left join public.current_financial_account_use u on u.financial_account_id=w.account_id and u.business_id=w.business_id
 where w.record_id=p_record and b.owner_user_id=auth.uid() and auth.jwt()->>'aal'='aal2';
$function$
;
do $$ declare original text; updated text; signature text; begin
 foreach signature in array array[
  'public.answer_betti_guided_work(uuid,text,text,jsonb,jsonb)',
  'public.answer_betti_evidence_opportunity(uuid,jsonb,text,uuid[])'
 ] loop
  original:=pg_get_functiondef(signature::regprocedure);
  updated:=replace(original,
   $old$select * into w from public.customer_transaction_work where business_id=bid and record_id=(item->>'recordId')::uuid;$old$,
   $new$select snapshot.* into w from public.customer_transaction_work v cross join lateral jsonb_populate_record(null::public.customer_transaction_work,jsonb_build_object(
    'business_id',v.business_id,'record_id',v.record_id,'decision_id',v.decision_id,
    'transaction_id',v.transaction_id,'account_id',v.account_id,'source_kind',v.source_kind,
    'activity_date',v.activity_date,'amount_cents',v.amount_cents,'bookkeeping_nature',v.bookkeeping_nature,
    'treatment',v.treatment,'has_receipt',v.has_receipt,'receipt_unavailable',v.receipt_unavailable)) snapshot
   where v.business_id=bid and v.record_id=(item->>'recordId')::uuid;$new$);
  if updated=original then raise exception 'Expected guided snapshot lookup missing: %',signature; end if;
  execute updated;
 end loop;
end; $$;

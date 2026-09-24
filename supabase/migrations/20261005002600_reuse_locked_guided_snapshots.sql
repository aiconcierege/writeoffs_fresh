-- Reuse already validated, transaction-locked purchase rows. No new financial
-- mutation or answer path; all owner/MFA/version checks and locks stay in place.
create or replace function public.guided_purchase_version_from_row(w public.customer_transaction_work)
returns text language sql stable security definer set search_path='' as $$
 select md5(jsonb_build_array(w.decision_id,w.has_receipt,w.receipt_unavailable,
   public.current_bookkeeping_evidence_fingerprint(w.business_id,w.record_id),u.id,b.catch_up_start_date,
   public.customer_coverage_start(b.id))::text)
 from public.businesses b
 left join public.current_financial_account_use u on u.financial_account_id=w.account_id and u.business_id=w.business_id
 where b.id=w.business_id and b.owner_user_id=auth.uid() and auth.jwt()->>'aal'='aal2';
$$;
-- Only canonical SECURITY DEFINER functions may pass a previously loaded row.
revoke all on function public.guided_purchase_version_from_row(public.customer_transaction_work) from public,anon,authenticated,service_role;

create or replace function public.guided_purchase_version(p_record uuid) returns text
language sql stable security definer set search_path='' as $$
 select public.guided_purchase_version_from_row(w)
 from public.customer_transaction_work w
 where w.record_id=p_record;
$$;

do $$ declare original text; updated text; signature text; begin
 foreach signature in array array[
  'public.answer_betti_guided_work(uuid,text,text,jsonb,jsonb)',
  'public.answer_betti_evidence_opportunity(uuid,jsonb,text,uuid[])'
 ] loop
  original:=pg_get_functiondef(signature::regprocedure);
  updated:=replace(original,'public.guided_purchase_version(w.record_id)','public.guided_purchase_version_from_row(w)');
  if updated=original then raise exception 'Expected purchase-version validation missing: %',signature; end if;
  execute updated;
 end loop;
 -- With no exceptions, the first loop has already validated and locked every
 -- purchase. The second loop only reconstructs the result, without changing facts.
 original:=pg_get_functiondef('public.answer_betti_guided_work(uuid,text,text,jsonb,jsonb)'::regprocedure);
 updated:=replace(original,$old$ if p_disposition='completed' then
 for item$old$,$new$ if p_disposition='completed' and p_action='personal_exception_sweep' and p_answers='{}'::jsonb then
  select jsonb_agg(jsonb_build_object('recordId',i->>'recordId','recorded',true) order by i->>'recordId')
   into result from jsonb_array_elements(p_items) i;
 elsif p_disposition='completed' then
 for item$new$);
 if updated=original then raise exception 'Expected guided completion loop missing'; end if;
 execute updated;

 -- Receipt availability retains the canonical per-document event writer. Reuse
 -- each validated row rather than hydrating the same expensive view twice.
 original:=pg_get_functiondef('public.apply_guided_review(uuid,text,text,jsonb)'::regprocedure);
 updated:=replace(original,'result jsonb:=''[]'';',
  'validated_rows public.customer_transaction_work[]:=''{}''; row_index integer:=0; result jsonb:=''[]'';');
 if updated=original then raise exception 'Expected review declarations missing'; end if;
 original:=updated;
 updated:=replace(original,$old$ then raise exception 'receipt review changed'; end if;
 end loop;$old$,$new$ then raise exception 'receipt review changed'; end if;
  if p_action='receipt_unavailable' then validated_rows:=array_append(validated_rows,w); end if;
 end loop;$new$);
 if updated=original then raise exception 'Expected receipt validation loop missing'; end if;
 original:=updated;
 updated:=replace(original,$old$ for item in select value from jsonb_array_elements(p_items) order by value->>'recordId' loop
  select * into w from public.customer_transaction_work where business_id=bid and record_id=(item->>'recordId')::uuid;
  perform pg_advisory_xact_lock$old$,$new$ for item in select value from jsonb_array_elements(p_items) order by value->>'recordId' loop
  if p_action='receipt_unavailable' then
   row_index:=row_index+1; w:=validated_rows[row_index];
  else
   select * into w from public.customer_transaction_work where business_id=bid and record_id=(item->>'recordId')::uuid;
  end if;
  perform pg_advisory_xact_lock$new$);
 if updated=original then raise exception 'Expected receipt mutation loop missing'; end if;
 execute updated;
end; $$;

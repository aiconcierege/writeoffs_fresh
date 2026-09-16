-- Existing compound machinery required a pristine unreviewed anchor. A loan
-- workflow necessarily has the customer's loan fact and question history first.
-- Admit ONLY its current explicit loan fact backed by the leased extraction;
-- preserve the guard for every other reconciliation and every other current state.
do $$declare definition text;revised text;begin
 definition:=pg_get_functiondef('public.create_bookkeeping_compound_reconciliation(uuid,uuid,uuid,text,text,uuid[],jsonb,text)'::regprocedure);
 revised:=replace(definition,'then raise exception ''anchor has dependent or customer-authored bookkeeping state''; end if;',
 'then
   if not (p_scenario=''loan_payment_split'' and p_basis_kind=''trusted_document'' and exists(
    select 1 from public.bookkeeping_loan_document_facts f
    join public.bookkeeping_special_events s on s.business_id=f.business_id and s.bookkeeping_record_id=f.bookkeeping_record_id and s.action=''loan_payment''
    join public.bookkeeping_decisions d on d.id=s.decision_id and d.business_id=s.business_id
    where f.business_id=p_business_id and f.bookkeeping_record_id=p_anchor_bookkeeping_record_id and f.document_id=any(p_basis_reference_ids)
      and d.treatment=''unresolved'' and d.bookkeeping_nature=''loan_principal_payment''
      and not exists(select 1 from public.bookkeeping_decisions n where n.supersedes_decision_id=d.id)
   )) then raise exception ''anchor has dependent or customer-authored bookkeeping state'';end if;
  end if;');
 if revised=definition then raise exception 'compound anchor guard changed';end if;execute revised;
end;$$;

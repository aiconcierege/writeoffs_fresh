-- Check-in already recognizes a loan and requests its statement. A business-only
-- account plus current established business context does not require a hidden
-- prior loan-confirmation event. Unknown/conflicting context remains unresolved.
do $$ declare original text; updated text; begin
 original:=pg_get_functiondef('public.worker_apply_loan_document(uuid,uuid,date,bigint,bigint)'::regprocedure);
 updated:=replace(original,
  'or not exists(select 1 from public.bookkeeping_special_events where bookkeeping_record_id=r and decision_id=w.decision_id and action=''loan_payment'')',
  'or not (exists(select 1 from public.bookkeeping_special_events where bookkeeping_record_id=r and decision_id=w.decision_id and action=''loan_payment'')
   or (exists(select 1 from public.current_bookkeeping_business_context c where c.business_id=j.business_id and c.bookkeeping_record_id=r and c.assessment_state=''established'' and c.assessment_basis=''account_business_only'')
    and exists(select 1 from public.bookkeeping_financial_sources s join public.financial_transactions t on t.id=s.financial_transaction_id and t.business_id=s.business_id
     join public.current_financial_account_use u on u.financial_account_id=t.financial_account_id and u.business_id=s.business_id
     where s.business_id=j.business_id and s.bookkeeping_record_id=r and s.revoked_at is null and u.designation=''business_only'')))');
 if updated=original then raise exception 'Expected loan-context guard missing';end if;
 updated:=replace(updated,'Interest from the loan statement for a customer-confirmed business loan. Tax support is assessed separately.',
  'Interest from the loan statement with established business-loan context. Tax support is assessed separately.');
 execute updated;
end; $$;
-- The compound split uses the identical supported-context boundary. Its trusted
-- fact row is written only by the leased, owned document worker above.
do $$ declare original text; updated text; begin
 original:=pg_get_functiondef('public.create_bookkeeping_compound_reconciliation(uuid,uuid,uuid,text,text,uuid[],jsonb,text)'::regprocedure);
 updated:=replace(original,
 'join public.bookkeeping_special_events s on s.business_id=f.business_id and s.bookkeeping_record_id=f.bookkeeping_record_id and s.action=''loan_payment''
    join public.bookkeeping_decisions d on d.id=s.decision_id and d.business_id=s.business_id',
 'join public.bookkeeping_decisions d on d.business_id=f.business_id and d.bookkeeping_record_id=f.bookkeeping_record_id');
 if updated=original then raise exception 'Expected compound loan guard missing';end if;
 updated:=replace(updated,
 'and d.treatment=''unresolved'' and d.bookkeeping_nature=''loan_principal_payment''',
 'and d.treatment=''unresolved'' and d.bookkeeping_nature=''loan_principal_payment''
      and (exists(select 1 from public.bookkeeping_special_events s where s.business_id=d.business_id and s.bookkeeping_record_id=d.bookkeeping_record_id and s.decision_id=d.id and s.action=''loan_payment'')
       or (exists(select 1 from public.current_bookkeeping_business_context c where c.business_id=d.business_id and c.bookkeeping_record_id=d.bookkeeping_record_id and c.assessment_state=''established'' and c.assessment_basis=''account_business_only'')
        and exists(select 1 from public.bookkeeping_financial_sources s join public.financial_transactions t on t.id=s.financial_transaction_id and t.business_id=s.business_id
         join public.current_financial_account_use u on u.financial_account_id=t.financial_account_id and u.business_id=s.business_id
         where s.business_id=d.business_id and s.bookkeeping_record_id=d.bookkeeping_record_id and s.revoked_at is null and u.designation=''business_only'')))');
 execute updated;
end; $$;
-- A repeated lease may read the same source again; changed extracted facts must
-- never masquerade as a successful identical retry.
do $$ declare original text; updated text; begin
 original:=pg_get_functiondef('public.worker_apply_loan_document(uuid,uuid,date,bigint,bigint)'::regprocedure);
 updated:=replace(original,
 'if exists(select 1 from public.bookkeeping_loan_document_facts where document_id=j.document_id and business_id=j.business_id) then return true;end if;',
 'if exists(select 1 from public.bookkeeping_loan_document_facts where document_id=j.document_id and business_id=j.business_id) then
   if not exists(select 1 from public.bookkeeping_loan_document_facts where document_id=j.document_id and business_id=j.business_id
    and payment_date=p_date and principal_cents=p_principal and interest_cents=p_interest) then raise exception ''Loan evidence retry changed'';end if;
   return true;end if;');
 if updated=original then raise exception 'Expected loan retry guard missing';end if;execute updated;
end; $$;

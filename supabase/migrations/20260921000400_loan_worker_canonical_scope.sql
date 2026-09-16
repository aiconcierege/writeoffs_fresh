-- Trusted workers have no customer session. Read canonical tenant-owned rows,
-- not a customer projection whose auth filter intentionally returns no rows.
do $$declare definition text;revised text;begin
 definition:=pg_get_functiondef('public.worker_apply_loan_document(uuid,uuid,date,bigint,bigint)'::regprocedure);
 revised:=replace(definition,'select * into w from public.customer_transaction_work where record_id=r and business_id=j.business_id;',
 'select b.id,d.id,b.amount_cents,b.occurred_on,d.bookkeeping_nature,d.treatment into w.record_id,w.decision_id,w.amount_cents,w.activity_date,w.bookkeeping_nature,w.treatment from public.bookkeeping_records b join public.bookkeeping_decisions d on d.bookkeeping_record_id=b.id and d.business_id=b.business_id where b.id=r and b.business_id=j.business_id and not exists(select 1 from public.bookkeeping_decisions n where n.supersedes_decision_id=d.id);');
 if revised=definition then raise exception 'loan worker function changed';end if;execute revised;
 definition:=pg_get_functiondef('public.invalidate_refund_on_purchase_correction()'::regprocedure);
 revised:=replace(definition,'w.decision_id as current_id','w.id as current_id');
 revised:=replace(revised,'join public.customer_transaction_work w on w.record_id=s.bookkeeping_record_id and w.decision_id=s.decision_id',
 'join public.bookkeeping_decisions w on w.bookkeeping_record_id=s.bookkeeping_record_id and w.id=s.decision_id and w.business_id=s.business_id and not exists(select 1 from public.bookkeeping_decisions n where n.supersedes_decision_id=w.id)');
 if revised=definition then raise exception 'refund dependency function changed';end if;execute revised;
end;$$;

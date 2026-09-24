-- Use the foundation's existing later-financial-source association when the
-- receipt already has customer-authored treatment. Do not copy/replace that
-- treatment or create a second economic record merely because the bank arrived.
create function public.associate_later_bank_receipt(p_business uuid,p_transaction uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare t public.financial_transactions%rowtype; candidate uuid; candidates uuid[];
begin
 if coalesce(auth.role(),'')<>'service_role' and public.require_customer_setup_owner() is distinct from p_business then raise exception 'Owned business required';end if;
 select * into t from public.financial_transactions where id=p_transaction and business_id=p_business for update;
 if not found or t.pending or t.amount_cents>=0 then return null;end if;
 select r.id into candidate from public.bookkeeping_financial_sources s join public.bookkeeping_records r on r.id=s.bookkeeping_record_id and r.business_id=s.business_id
 where s.business_id=p_business and s.financial_transaction_id=t.id and s.revoked_at is null and r.source_kind='receipt';
 if found then return candidate;end if;
 if exists(select 1 from public.bookkeeping_financial_sources where business_id=p_business and financial_transaction_id=t.id and revoked_at is null) then return null;end if;
 -- No association across ambiguous identical bank movements.
 if (select count(*) from public.financial_transactions f where f.business_id=p_business and not f.pending and f.amount_cents=t.amount_cents and f.currency=t.currency
  and f.transaction_date=t.transaction_date and public.normalize_receipt_convergence_merchant(coalesce(f.merchant_name,f.original_description))=public.normalize_receipt_convergence_merchant(coalesce(t.merchant_name,t.original_description)))<>1 then return null;end if;
 select array_agg(distinct r.id) into candidates from public.bookkeeping_records r
 join public.bookkeeping_document_links l on l.bookkeeping_record_id=r.id and l.business_id=r.business_id and l.revoked_at is null
 join public.current_bookkeeping_receipt_extractions x on x.receipt_id=l.receipt_id and x.business_id=l.business_id
 join public.bookkeeping_receipt_events e on e.receipt_id=l.receipt_id and e.business_id=l.business_id and e.bookkeeping_record_id=r.id
 where r.business_id=p_business and r.source_kind='receipt' and r.amount_cents=t.amount_cents and r.currency=t.currency and r.occurred_on=t.transaction_date
  and x.total_amount_cents=-t.amount_cents and x.occurred_on=t.transaction_date
  and public.normalize_receipt_convergence_merchant(x.merchant)<>''
  and public.normalize_receipt_convergence_merchant(x.merchant)=public.normalize_receipt_convergence_merchant(coalesce(t.merchant_name,t.original_description))
  and e.event_type in('retained','kept') and not exists(select 1 from public.bookkeeping_receipt_events n where n.supersedes_event_id=e.id)
  and exists(select 1 from public.bookkeeping_decisions d where d.business_id=p_business and d.bookkeeping_record_id=r.id and d.provenance='user')
  and not exists(select 1 from public.bookkeeping_financial_sources s where s.business_id=p_business and s.bookkeeping_record_id=r.id and s.revoked_at is null)
  and not exists(select 1 from public.current_bookkeeping_record_convergences c where c.business_id=p_business and r.id in(c.survivor_record_id,c.absorbed_record_id))
  and not exists(select 1 from public.current_bookkeeping_compound_components c where c.business_id=p_business and c.bookkeeping_record_id=r.id);
 if cardinality(candidates) is distinct from 1 then return null;end if;
 candidate:=candidates[1];
 perform 1 from public.bookkeeping_records where id=candidate and business_id=p_business for update;
 if exists(select 1 from public.bookkeeping_financial_sources where business_id=p_business and bookkeeping_record_id=candidate and revoked_at is null) then return null;end if;
 select array_agg(distinct r.id) into candidates from public.bookkeeping_records r
 join public.bookkeeping_document_links l on l.bookkeeping_record_id=r.id and l.business_id=r.business_id and l.revoked_at is null
 join public.current_bookkeeping_receipt_extractions x on x.receipt_id=l.receipt_id and x.business_id=l.business_id
 join public.bookkeeping_receipt_events e on e.receipt_id=l.receipt_id and e.business_id=l.business_id and e.bookkeeping_record_id=r.id
 where r.business_id=p_business and r.source_kind='receipt' and r.amount_cents=t.amount_cents and r.currency=t.currency and r.occurred_on=t.transaction_date
  and x.total_amount_cents=-t.amount_cents and x.occurred_on=t.transaction_date
  and public.normalize_receipt_convergence_merchant(x.merchant)<>''
  and public.normalize_receipt_convergence_merchant(x.merchant)=public.normalize_receipt_convergence_merchant(coalesce(t.merchant_name,t.original_description))
  and e.event_type in('retained','kept') and not exists(select 1 from public.bookkeeping_receipt_events n where n.supersedes_event_id=e.id)
  and exists(select 1 from public.bookkeeping_decisions d where d.business_id=p_business and d.bookkeeping_record_id=r.id and d.provenance='user')
  and not exists(select 1 from public.bookkeeping_financial_sources s where s.business_id=p_business and s.bookkeeping_record_id=r.id and s.revoked_at is null)
  and not exists(select 1 from public.current_bookkeeping_record_convergences c where c.business_id=p_business and r.id in(c.survivor_record_id,c.absorbed_record_id))
  and not exists(select 1 from public.current_bookkeeping_compound_components c where c.business_id=p_business and c.bookkeeping_record_id=r.id);
 if cardinality(candidates) is distinct from 1 or candidates[1]<>candidate then return null;end if;
 perform public.attach_bookkeeping_financial_source(p_business,candidate,t.id,'automation');
 return candidate;
end; $$;
revoke all on function public.associate_later_bank_receipt(uuid,uuid) from public,anon;
grant execute on function public.associate_later_bank_receipt(uuid,uuid) to authenticated,service_role;

do $$ declare original text; updated text; begin
 original:=pg_get_functiondef('public.ensure_bookkeeping_record(uuid,text,uuid,text,text,bigint,text,date)'::regprocedure);
 updated:=replace(original,'  insert into public.bookkeeping_records (',
 '  if p_source_kind=''financial_transaction'' then
    select * into selected_record from public.bookkeeping_records where id=public.associate_later_bank_receipt(p_business_id,p_financial_transaction_id) and business_id=p_business_id;
    if found then
      if selected_record.amount_cents is distinct from p_amount_cents or selected_record.currency is distinct from p_currency or selected_record.occurred_on is distinct from p_occurred_on then raise exception ''Later bank source facts changed'';end if;
      return selected_record;
    end if;
  end if;
  insert into public.bookkeeping_records (');
 if updated=original then raise exception 'Expected canonical ingestion boundary missing';end if;execute updated;
end; $$;
-- Importers call ensure_initial after source association. Its BEFORE INSERT
-- chain validator runs before ON CONFLICT, so read an existing leaf first under
-- the canonical record lock rather than attempting another root decision.
do $$ declare original text; updated text; begin
 original:=pg_get_functiondef('public.ensure_initial_bookkeeping_decision(uuid,uuid)'::regprocedure);
 updated:=replace(original,'  insert into public.bookkeeping_decisions (',
 '  perform 1 from public.bookkeeping_records where id=p_bookkeeping_record_id and business_id=p_business_id for update;
  select d.id into selected_decision_id from public.bookkeeping_decisions d where d.business_id=p_business_id and d.bookkeeping_record_id=p_bookkeeping_record_id
   and not exists(select 1 from public.bookkeeping_decisions n where n.supersedes_decision_id=d.id);
  if selected_decision_id is not null then return selected_decision_id;end if;
  insert into public.bookkeeping_decisions (');
 if updated=original then raise exception 'Expected initial-decision boundary missing';end if;execute updated;
end; $$;

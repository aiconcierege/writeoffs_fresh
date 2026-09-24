-- Preserve exact matching and all customer-decision guards. Automatic assessment
-- must not prevent a receipt from joining its later bank source. History and
-- original receipt links remain; canonical survivor reassessment uses both sources.
create or replace view public.bookkeeping_receipt_convergence_candidates
with (security_invoker = true) as
select
  receipt_record.business_id,
  receipt_record.id as absorbed_record_id,
  financial_record.id as survivor_record_id,
  receipt_event.receipt_id,
  financial_transaction.id as financial_transaction_id,
  receipt_event.id as keep_event_id,
  receipt_event.extraction_id,
  document_link.id as document_link_id,
  receipt_extraction.total_amount_cents as receipt_total_amount_cents,
  receipt_extraction.occurred_on as receipt_date,
  receipt_extraction.merchant as receipt_merchant,
  financial_transaction.amount_cents as financial_amount_cents,
  financial_transaction.transaction_date as financial_date,
  coalesce(financial_transaction.merchant_name, financial_transaction.original_description) as financial_merchant,
  financial_transaction.currency
from public.bookkeeping_receipt_events receipt_event
join public.receipts receipt on receipt.id = receipt_event.receipt_id and receipt.business_id = receipt_event.business_id
join public.bookkeeping_records receipt_record on receipt_record.id = receipt_event.bookkeeping_record_id
 and receipt_record.business_id = receipt_event.business_id and receipt_record.source_kind = 'receipt'
join public.bookkeeping_receipt_extractions receipt_extraction on receipt_extraction.id = receipt_event.extraction_id
 and receipt_extraction.business_id = receipt_event.business_id and receipt_extraction.receipt_id = receipt_event.receipt_id
join public.bookkeeping_document_links document_link on document_link.id = receipt_event.bookkeeping_document_link_id
 and document_link.business_id = receipt_event.business_id and document_link.bookkeeping_record_id = receipt_event.bookkeeping_record_id
 and document_link.receipt_id = receipt_event.receipt_id and document_link.revoked_at is null
join public.bookkeeping_decisions receipt_decision on receipt_decision.bookkeeping_record_id = receipt_record.id
 and receipt_decision.business_id = receipt_record.business_id
 and not exists(select 1 from public.bookkeeping_decisions successor where successor.supersedes_decision_id=receipt_decision.id)
 and receipt_decision.provenance in('system','automation')
join public.financial_transactions financial_transaction on financial_transaction.business_id = receipt_record.business_id
 and financial_transaction.pending = false and financial_transaction.amount_cents < 0
 and financial_transaction.amount_cents = -receipt_extraction.total_amount_cents
 and financial_transaction.currency = receipt_record.currency
 and financial_transaction.transaction_date = receipt_extraction.occurred_on
 and public.normalize_receipt_convergence_merchant(coalesce(financial_transaction.merchant_name,
   financial_transaction.original_description)) <> ''
 and public.normalize_receipt_convergence_merchant(coalesce(financial_transaction.merchant_name,
   financial_transaction.original_description)) = public.normalize_receipt_convergence_merchant(receipt_extraction.merchant)
join public.bookkeeping_financial_sources financial_source on financial_source.financial_transaction_id = financial_transaction.id
 and financial_source.business_id = financial_transaction.business_id and financial_source.revoked_at is null
join public.bookkeeping_records financial_record on financial_record.id = financial_source.bookkeeping_record_id
 and financial_record.business_id = financial_source.business_id and financial_record.source_kind = 'financial_transaction'
join public.bookkeeping_decisions financial_decision on financial_decision.bookkeeping_record_id = financial_record.id
 and financial_decision.business_id = financial_record.business_id and financial_decision.supersedes_decision_id is null
 and financial_decision.treatment = 'unresolved' and financial_decision.bookkeeping_nature is null
 and financial_decision.provenance = 'system'
where (
    (receipt_event.event_type = 'kept' and receipt_event.provenance = 'user')
    or (receipt_event.event_type = 'retained' and receipt_event.provenance = 'automation'
      and exists (select 1 from public.bookkeeping_receipt_events upload
        join public.businesses business on business.id = upload.business_id and business.owner_user_id = upload.actor_user_id
        where upload.business_id = receipt_event.business_id and upload.receipt_id = receipt_event.receipt_id
          and upload.event_type = 'uploaded' and upload.provenance = 'user' and upload.supersedes_event_id is null))
  )
  and not exists (select 1 from public.bookkeeping_receipt_events successor where successor.supersedes_event_id = receipt_event.id)
  and receipt_extraction.total_amount_cents > 0 and receipt_extraction.occurred_on is not null
  and public.normalize_receipt_convergence_merchant(receipt_extraction.merchant) <> ''
  and not exists (select 1 from public.bookkeeping_financial_sources source where source.business_id = receipt_record.business_id
    and source.bookkeeping_record_id = receipt_record.id and source.revoked_at is null)
  and not exists (select 1 from public.bookkeeping_decisions other where other.business_id = receipt_record.business_id
    and other.bookkeeping_record_id = receipt_record.id and other.provenance not in('system','automation'))
  and not exists (select 1 from public.bookkeeping_decisions other where other.business_id = financial_record.business_id
    and other.bookkeeping_record_id = financial_record.id and other.id <> financial_decision.id)
  and not exists (select 1 from public.bookkeeping_allocations allocation where allocation.business_id = receipt_record.business_id
    and allocation.bookkeeping_record_id = financial_record.id)
  and not exists (select 1 from public.bookkeeping_review_events review where review.business_id = receipt_record.business_id
    and (review.bookkeeping_record_id=financial_record.id or (review.bookkeeping_record_id=receipt_record.id and review.provenance='user')))
  and not exists (select 1 from public.bookkeeping_documentation_events documentation
    where documentation.business_id = receipt_record.business_id
      and documentation.bookkeeping_record_id = financial_record.id
      and documentation.event_type in ('request_opened','reopened')
      and not exists (select 1 from public.bookkeeping_documentation_events successor
        where successor.supersedes_event_id = documentation.id))
  and not exists (select 1 from public.bookkeeping_document_links extra_link where extra_link.business_id = financial_record.business_id
    and extra_link.bookkeeping_record_id = financial_record.id and extra_link.revoked_at is null)
  and not exists (select 1 from public.bookkeeping_document_links extra_link where extra_link.business_id = receipt_record.business_id
    and extra_link.bookkeeping_record_id = receipt_record.id and extra_link.revoked_at is null and extra_link.id <> document_link.id)
  and not exists (select 1 from public.current_bookkeeping_record_convergences active where active.business_id = receipt_record.business_id
    and (active.survivor_record_id in (receipt_record.id,financial_record.id)
      or active.absorbed_record_id in (receipt_record.id,financial_record.id)))
  and (financial_transaction.import_method <> 'provider' or exists (
    select 1 from public.plaid_transaction_versions plaid_version
    where plaid_version.business_id = financial_transaction.business_id
      and plaid_version.canonical_financial_transaction_id = financial_transaction.id
      and plaid_version.event_type in ('added','modified') and plaid_version.pending = false
      and not exists (select 1 from public.plaid_transaction_versions successor
        where successor.supersedes_version_id = plaid_version.id)));

-- Carry the existing automated working amount atomically with alias publication.
-- This is derived state, not a new customer answer. Both original decision and
-- allocations remain immutable on the absorbed record for auditability.
create function public.preserve_automated_receipt_convergence() returns trigger
language plpgsql security definer set search_path='' as $$
declare prior public.bookkeeping_decisions%rowtype; target public.bookkeeping_decisions%rowtype; copied uuid;
begin
 if new.event_type<>'converged' then return new;end if;
 select * into prior from public.bookkeeping_decisions d where d.business_id=new.business_id
  and d.bookkeeping_record_id=new.absorbed_record_id and not exists(select 1 from public.bookkeeping_decisions n where n.supersedes_decision_id=d.id);
 if prior.provenance not in('system','automation') then raise exception 'Receipt has customer treatment; automatic convergence forbidden';end if;
 if prior.supersedes_decision_id is null and prior.treatment='unresolved' and prior.bookkeeping_nature is null then return new;end if;
 select * into target from public.bookkeeping_decisions d where d.business_id=new.business_id
  and d.bookkeeping_record_id=new.survivor_record_id and not exists(select 1 from public.bookkeeping_decisions n where n.supersedes_decision_id=d.id);
 if target.provenance<>'system' or target.treatment<>'unresolved' or target.supersedes_decision_id is not null then raise exception 'Bank record already assessed';end if;
 insert into public.bookkeeping_decisions(business_id,bookkeeping_record_id,supersedes_decision_id,bookkeeping_nature,treatment,review_status,provenance,confidence,reason,business_purpose)
 values(new.business_id,new.survivor_record_id,target.id,prior.bookkeeping_nature,prior.treatment,prior.review_status,'automation',prior.confidence,prior.reason,prior.business_purpose) returning id into copied;
 insert into public.bookkeeping_allocations(business_id,bookkeeping_record_id,bookkeeping_decision_id,allocation_kind,amount_cents,tax_category_key,memo)
 select new.business_id,new.survivor_record_id,copied,allocation_kind,amount_cents,tax_category_key,memo from public.bookkeeping_allocations where bookkeeping_decision_id=prior.id;
 return new;
end; $$;
revoke all on function public.preserve_automated_receipt_convergence() from public,anon,authenticated;
create trigger preserve_receipt_working_books after insert on public.bookkeeping_record_convergence_events
 for each row execute function public.preserve_automated_receipt_convergence();

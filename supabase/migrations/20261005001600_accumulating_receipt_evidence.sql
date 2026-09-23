-- Normalize only an explicit bank check-number prefix, not merchant similarity.
-- Exact amount, date-window, unique candidate, active-source and tenant checks stay.
create or replace function public.normalize_receipt_convergence_merchant(p_value text)
returns text language sql immutable set search_path='' as $$
 select regexp_replace(lower(regexp_replace(coalesce(p_value,''),
  '^\s*check\s*#?\s*[0-9]+\s*[-–:]\s*','','i')),'[^a-z0-9]+','','g');
$$;

do $$ declare original text; updated text; begin
 original:=pg_get_functiondef('public.finalize_autonomous_bookkeeping_receipt(uuid)'::regprocedure);
 updated:=replace(original,'receipt-financial-exact:v1','receipt-financial-exact:v2-supporting-documents');
 if updated=original then raise exception 'Expected matching provenance missing';end if;
 execute updated;
end; $$;

-- More than one supporting document may attach to the same canonical financial
-- record. Existing attachments do not justify creating another receipt expense.
-- Absorbed records remain ineligible; a surviving financial record remains valid.
create or replace view public.bookkeeping_autonomous_receipt_match_candidates
with (security_invoker = true) as
select receipt_event.business_id, receipt_event.receipt_id,
  receipt_event.id as receipt_event_id, receipt_event.extraction_id,
  extraction.merchant as receipt_merchant, extraction.occurred_on as receipt_date,
  extraction.total_amount_cents as receipt_total_amount_cents,
  financial_transaction.id as financial_transaction_id,
  financial_record.id as financial_record_id
from public.bookkeeping_receipt_events receipt_event
join public.bookkeeping_receipt_extractions extraction
  on extraction.id = receipt_event.extraction_id and extraction.business_id = receipt_event.business_id
join public.financial_transactions financial_transaction
  on financial_transaction.business_id = receipt_event.business_id
 and financial_transaction.pending = false
 and financial_transaction.currency = 'USD'
 and financial_transaction.amount_cents = -extraction.total_amount_cents
 and financial_transaction.transaction_date between extraction.occurred_on - 3 and extraction.occurred_on + 3
 and public.normalize_receipt_convergence_merchant(coalesce(
   financial_transaction.merchant_name, financial_transaction.original_description))
   = public.normalize_receipt_convergence_merchant(extraction.merchant)
join public.bookkeeping_financial_sources financial_source
  on financial_source.business_id = financial_transaction.business_id
 and financial_source.financial_transaction_id = financial_transaction.id
 and financial_source.revoked_at is null
join public.bookkeeping_records financial_record
  on financial_record.id = financial_source.bookkeeping_record_id
 and financial_record.business_id = financial_source.business_id
 and financial_record.source_kind = 'financial_transaction'
where receipt_event.event_type = 'extraction_completed'
  and public.bookkeeping_activity_in_scope(financial_record.business_id,financial_record.occurred_on)
  and public.bookkeeping_activity_in_scope(extraction.business_id,extraction.occurred_on)
  and not exists (select 1 from public.bookkeeping_receipt_events successor
    where successor.supersedes_event_id = receipt_event.id)
  and extraction.quality_status = 'usable'
  and extraction.quality_policy_version = 'receipt-quality:v1'
  and public.normalize_receipt_convergence_merchant(extraction.merchant) <> ''
  and not exists (select 1 from public.current_bookkeeping_record_convergences convergence
    where convergence.business_id = financial_record.business_id
      and convergence.absorbed_record_id = financial_record.id)
  and (
    financial_transaction.import_method <> 'provider'
    or exists (
      select 1 from public.plaid_transaction_versions version
      where version.business_id = financial_transaction.business_id
        and version.canonical_financial_transaction_id = financial_transaction.id
        and version.event_type in ('added','modified') and version.pending = false
        and not exists (select 1 from public.plaid_transaction_versions successor
          where successor.supersedes_version_id = version.id)
    )
  );

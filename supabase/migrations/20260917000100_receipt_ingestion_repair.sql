-- Receipt attachment is evidence, not a classification change. Preserve all
-- existing decisions/allocations, ownership, exact cents and two-sided uniqueness.
-- Three-day posting tolerance remains conservative: more than one candidate
-- prevents automatic attachment. No extraction or customer facts are backfilled.
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
  and not exists (select 1 from public.bookkeeping_receipt_events successor
    where successor.supersedes_event_id = receipt_event.id)
  and extraction.quality_status = 'usable'
  and extraction.quality_policy_version = 'receipt-quality:v1'
  and public.normalize_receipt_convergence_merchant(extraction.merchant) <> ''
  and not exists (select 1 from public.bookkeeping_document_links link
    where link.business_id = financial_record.business_id
      and link.bookkeeping_record_id = financial_record.id and link.revoked_at is null)
  and not exists (select 1 from public.current_bookkeeping_record_convergences convergence
    where convergence.business_id = financial_record.business_id
      and (convergence.survivor_record_id = financial_record.id
        or convergence.absorbed_record_id = financial_record.id))
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


create or replace view public.customer_transaction_work with(security_invoker=true) as
select * from public.customer_canonical_transaction_work
union all
select b.id,t.id,t.id,t.date,coalesce(t.vendor,'Transaction'),coalesce(t.description,''),
 coalesce(t.amount_cents,round(t.amount*100)::bigint),coalesce(t.currency,'USD'),null::uuid,
 'legacy'::text,null::text,'legacy'::text,null::uuid,t.category_key,
 t.created_from_receipt_id is not null or exists(select 1 from public.receipts r where r.transaction_id=t.id),
 coalesce(t.receipt_waived,false),false,false,t.date<public.bookkeeping_activity_day(b.id)-30,false
from public.transactions t join public.businesses b on b.owner_user_id=t.user_id
where t.canonical_financial_transaction_id is null and b.owner_user_id=auth.uid() and coalesce(auth.jwt()->>'aal','')='aal2'
union all
select r.business_id,r.id,r.id,coalesce(x.occurred_on,r.created_at::date),coalesce(x.merchant,r.original_name,'Receipt'),
 'Waiting for a matching bank transaction',-abs(x.total_amount_cents),'USD',null::uuid,
 'receipt_evidence',null::text,'receipt_evidence',null::uuid,null::text,true,false,false,false,false,false
from public.receipts r
left join lateral(select e.* from public.bookkeeping_receipt_extractions e where e.receipt_id=r.id order by e.created_at desc limit 1) x on true
where r.business_id is not null and r.user_id=auth.uid() and coalesce(auth.jwt()->>'aal','')='aal2'
 and r.transaction_id is null
 and x.quality_status='usable'
 and exists(select 1 from public.current_customer_receipt_processing_status p where p.receipt_id=r.id and p.processing_status='organized')
 and not exists(select 1 from public.bookkeeping_document_links l where l.receipt_id=r.id and l.revoked_at is null)
 and not exists(select 1 from public.bookkeeping_receipt_events e where e.receipt_id=r.id and e.event_type='discarded'
  and not exists(select 1 from public.bookkeeping_receipt_events n where n.supersedes_event_id=e.id));
grant select on public.customer_transaction_work,public.customer_canonical_transaction_work to authenticated;

-- Scoped post-upload wake-up. Only trusted workers can claim jobs; the upload
-- route obtains the receipt ID from authenticated canonical registration.
create function public.claim_canonical_receipt_job(p_receipt_id uuid,p_lease_id uuid)
returns setof public.receipt_processing_jobs language plpgsql security definer set search_path='' as $$
begin
 if (select auth.role())<>'service_role' then raise exception 'trusted receipt worker required'; end if;
 if p_receipt_id is null or p_lease_id is null then raise exception 'receipt claim identity required'; end if;
 return query with candidate as (
  select id from public.receipt_processing_jobs where receipt_id=p_receipt_id
   and job_type='canonical_receipt_extraction' and attempt_count<6
   and ((state in ('pending','retryable') and available_at<=now()) or (state='processing' and lease_expires_at<=now()))
  for update skip locked limit 1
 ) update public.receipt_processing_jobs j set state='processing',attempt_count=j.attempt_count+1,
  lease_id=p_lease_id,lease_expires_at=now()+interval '90 seconds',claimed_at=now(),last_attempted_at=now(),
  last_error_code=null,updated_at=now() from candidate where j.id=candidate.id returning j.*;
end; $$;
revoke all on function public.claim_canonical_receipt_job(uuid,uuid) from public,anon,authenticated;
grant execute on function public.claim_canonical_receipt_job(uuid,uuid) to service_role;

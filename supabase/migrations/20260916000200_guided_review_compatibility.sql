-- Include retained legacy activity and unmatched receipt evidence without changing
-- their accounting or offering imported-bank-only bulk actions for them.
alter view public.customer_transaction_work rename to customer_canonical_transaction_work;
create view public.customer_transaction_work with(security_invoker=true) as
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
 and not exists(select 1 from public.bookkeeping_document_links l where l.receipt_id=r.id and l.revoked_at is null)
 and not exists(select 1 from public.bookkeeping_receipt_events e where e.receipt_id=r.id and e.event_type='discarded'
  and not exists(select 1 from public.bookkeeping_receipt_events n where n.supersedes_event_id=e.id));
grant select on public.customer_transaction_work,public.customer_canonical_transaction_work to authenticated;

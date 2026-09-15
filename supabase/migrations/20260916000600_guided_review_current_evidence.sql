-- Carry attached/unavailable receipt evidence through existing convergence and
-- compound identity, matching the canonical detail/report read models.
create function public.current_work_evidence_records(p_record_id uuid) returns uuid[]
language sql stable security invoker set search_path='' as $$
 with recursive related(id) as (
  select r.id from public.bookkeeping_records r join public.businesses b on b.id=r.business_id
   where r.id=p_record_id and b.owner_user_id=auth.uid()
  union
  select edge.absorbed from related prior join (
   select survivor_record_id as survivor,absorbed_record_id as absorbed from public.current_bookkeeping_record_convergences
   union select survivor_record_id,absorbed_record_id from public.current_bookkeeping_source_convergences
   union select bookkeeping_record_id,anchor_bookkeeping_record_id from public.current_bookkeeping_compound_components
   union select current_manual.bookkeeping_record_id,old.bookkeeping_record_id from public.current_manual_financial_activity current_manual
    join public.manual_financial_source_events old on old.manual_financial_source_id=current_manual.manual_financial_source_id where old.bookkeeping_record_id is not null
  ) edge on edge.survivor=prior.id
 ) select coalesce(array_agg(id),'{}'::uuid[]) from related;
$$;
revoke all on function public.current_work_evidence_records(uuid) from public,anon;
grant execute on function public.current_work_evidence_records(uuid) to authenticated;
-- Retain record-scoped deduction facts in Needs review; missing receipts alone are not review facts.
create or replace view public.customer_canonical_transaction_work with(security_invoker=true) as
select r.business_id,r.id as record_id,case when component.bookkeeping_record_id is not null then r.id else coalesce(f.id,r.id) end as transaction_id,r.occurred_on as activity_date,
 coalesce(f.merchant_name,f.original_description,x.merchant,m.counterparty_name,'Receipt purchase') as merchant,
 coalesce(f.original_description,m.description,'') as description,r.amount_cents,r.currency,
 d.id as decision_id,d.treatment,d.bookkeeping_nature,r.source_kind,
 f.financial_account_id as account_id,
 (select min(a.tax_category_key) from public.bookkeeping_allocations a where a.bookkeeping_decision_id=d.id and a.allocation_kind='business') as category_key,
 exists(select 1 from public.bookkeeping_document_links l where l.bookkeeping_record_id=any(public.current_work_evidence_records(r.id)) and l.revoked_at is null) as has_receipt,
 exists(select 1 from public.bookkeeping_documentation_events e join public.bookkeeping_documentation_events prev on prev.id=e.supersedes_event_id
   where e.bookkeeping_record_id=any(public.current_work_evidence_records(r.id)) and e.event_type='resolved' and prev.event_type='receipt_lost'
    and not exists(select 1 from public.bookkeeping_documentation_events n where n.supersedes_event_id=e.id)) as receipt_unavailable,
 (exists(select 1 from public.bookkeeping_review_events e where e.bookkeeping_record_id=r.id and e.based_on_decision_id=d.id
  and e.event_type in ('opened','reopened','skipped')
  and not exists(select 1 from public.bookkeeping_review_events n where n.supersedes_event_id=e.id)
  and not public.bookkeeping_question_is_historical_documentation(e.reason,e.question_context,r.occurred_on,public.bookkeeping_activity_day(r.business_id))) or exists(select 1 from public.current_deduction_attentions a where a.bookkeeping_record_id=r.id and a.event_type='opened')) as needs_fact,
 exists(select 1 from public.bookkeeping_review_events e where e.bookkeeping_record_id=r.id and e.based_on_decision_id=d.id
  and e.event_type in ('opened','reopened','skipped')
  and not exists(select 1 from public.bookkeeping_review_events n where n.supersedes_event_id=e.id)
  and public.bookkeeping_question_is_historical_documentation(e.reason,e.question_context,r.occurred_on,public.bookkeeping_activity_day(r.business_id))) as historical_documentation,
 r.occurred_on < public.bookkeeping_activity_day(r.business_id)-30 as historical,
 exists(select 1 from public.bookkeeping_guided_review_batches b, jsonb_array_elements(b.items) item
  where b.business_id=r.business_id and b.action='reviewed' and b.scope='historical'
   and item->>'recordId'=r.id::text and item->>'decisionId'=d.id::text) as sweep_reviewed
from public.bookkeeping_records r
left join public.bookkeeping_financial_sources s on s.bookkeeping_record_id=r.id and s.revoked_at is null
left join public.current_bookkeeping_compound_components component on component.bookkeeping_record_id=r.id
left join public.financial_transactions f on f.id=coalesce(s.financial_transaction_id,component.anchor_financial_transaction_id)
left join public.current_manual_financial_activity m on m.bookkeeping_record_id=r.id
left join lateral(select e.* from public.bookkeeping_decisions e where e.bookkeeping_record_id=r.id
 and not exists(select 1 from public.bookkeeping_decisions n where n.supersedes_decision_id=e.id) limit 1) d on true
left join lateral(select e.merchant from public.bookkeeping_document_links l join public.bookkeeping_receipt_extractions e on e.receipt_id=l.receipt_id
 where l.bookkeeping_record_id=any(public.current_work_evidence_records(r.id)) and l.revoked_at is null order by e.created_at desc limit 1) x on true
where exists(select 1 from public.businesses b where b.id=r.business_id and b.owner_user_id=auth.uid())
 and coalesce(auth.jwt()->>'aal','')='aal2'
 and (f.id is null or not exists(select 1 from public.plaid_transaction_versions v where v.canonical_financial_transaction_id=f.id)
  or exists(select 1 from public.plaid_transaction_versions v where v.canonical_financial_transaction_id=f.id and v.event_type<>'removed'
   and not exists(select 1 from public.plaid_transaction_versions n where n.supersedes_version_id=v.id)))
 and not exists(select 1 from public.current_bookkeeping_record_convergences c where c.absorbed_record_id=r.id)
 and not exists(select 1 from public.current_bookkeeping_source_convergences c where c.absorbed_record_id=r.id)
 and not exists(select 1 from public.current_bookkeeping_compound_components c where c.anchor_bookkeeping_record_id=r.id)
 and (r.source_kind<>'manual' or component.bookkeeping_record_id is not null or exists(select 1 from public.current_manual_financial_activity current_manual where current_manual.bookkeeping_record_id=r.id))
 and not exists(select 1 from public.bookkeeping_receipt_events e where e.bookkeeping_record_id=r.id and e.event_type='discarded'
  and e.context->>'deactivateReceiptOnly'='true' and not exists(select 1 from public.bookkeeping_receipt_events n where n.supersedes_event_id=e.id));

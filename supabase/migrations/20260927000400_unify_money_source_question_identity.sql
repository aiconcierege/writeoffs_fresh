-- SQL reconciliation and the worker previously used different issue keys for the
-- same money-source fact. One deferral could expose the other historical issue.
-- Preserve every event; unify generation and canonical eligibility, not just UI.
create index bookkeeping_money_source_fact_lookup on public.bookkeeping_review_events
 (business_id,bookkeeping_record_id,based_on_decision_id,created_at desc,id)
 where reason='TRANSACTION_TYPE_UNCLEAR' and question_context->>'factType'='money_in_source';

create function public.current_money_source_question_event(p_business uuid,p_record uuid,p_decision uuid,p_evidence text)
returns uuid language sql stable security definer set search_path='' as $$
 select e.id from public.bookkeeping_review_events e
 where e.business_id=p_business and e.bookkeeping_record_id=p_record
 and e.based_on_decision_id=p_decision and e.evidence_fingerprint is not distinct from p_evidence
 and e.reason='TRANSACTION_TYPE_UNCLEAR' and e.question_context->>'factType'='money_in_source'
 and not exists(select 1 from public.bookkeeping_review_events n where n.supersedes_event_id=e.id)
 -- A current customer deferral owns the fact even if another generator opened
 -- an equivalent issue. After expiry the same deferred issue becomes askable.
 order by case e.event_type when 'resolved' then 0 when 'skipped' then 1 else 2 end,
 case when e.event_type='skipped' then e.deferred_until end desc nulls last,e.review_issue_id limit 1;
$$;
revoke all on function public.current_money_source_question_event(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.current_money_source_question_event(uuid,uuid,uuid,text) to service_role;

alter function public.open_bookkeeping_review_issue_v2(uuid,uuid,uuid,text,text,text,jsonb)
 rename to open_bookkeeping_review_issue_v2_before_money_source_identity;
revoke all on function public.open_bookkeeping_review_issue_v2_before_money_source_identity(uuid,uuid,uuid,text,text,text,jsonb)
 from public,anon,authenticated,service_role;
create function public.open_bookkeeping_review_issue_v2(p_business_id uuid,p_bookkeeping_record_id uuid,
 p_based_on_decision_id uuid,p_reason text,p_issue_key text,p_context_fingerprint text,p_question_context jsonb default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare fp text; existing_key text;
begin
 if p_reason='TRANSACTION_TYPE_UNCLEAR' and p_question_context->>'factType'='money_in_source'
 and exists(select 1 from public.bookkeeping_records r where r.id=p_bookkeeping_record_id
   and r.business_id=p_business_id and r.source_kind='financial_transaction' and r.amount_cents>0) then
  perform pg_advisory_xact_lock(hashtextextended(p_bookkeeping_record_id::text,41));
  fp:=public.current_bookkeeping_evidence_fingerprint(p_business_id,p_bookkeeping_record_id);
  select issue_key into existing_key from public.bookkeeping_review_events where id=
   public.current_money_source_question_event(p_business_id,p_bookkeeping_record_id,p_based_on_decision_id,fp);
  p_issue_key:=coalesce(existing_key,'money-source:'||p_bookkeeping_record_id::text||':'||p_based_on_decision_id::text);
  p_context_fingerprint:=md5(p_based_on_decision_id::text||':money-source:'||fp);
 end if;
 return public.open_bookkeeping_review_issue_v2_before_money_source_identity(p_business_id,p_bookkeeping_record_id,
  p_based_on_decision_id,p_reason,p_issue_key,p_context_fingerprint,p_question_context);
end;$$;
revoke all on function public.open_bookkeeping_review_issue_v2(uuid,uuid,uuid,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.open_bookkeeping_review_issue_v2(uuid,uuid,uuid,text,text,text,jsonb) to service_role;

alter function public.list_current_evidence_question_event_ids(timestamptz)
 rename to list_current_evidence_question_event_ids_before_money_source_identity;
revoke all on function public.list_current_evidence_question_event_ids_before_money_source_identity(timestamptz) from public,anon,authenticated;
create function public.list_current_evidence_question_event_ids(p_as_of timestamptz default now())
returns table(event_id uuid) language sql stable security definer set search_path='' as $$
 select q.event_id from public.list_current_evidence_question_event_ids_before_money_source_identity(p_as_of) q
 join public.bookkeeping_review_events e on e.id=q.event_id
 join public.bookkeeping_records r on r.id=e.bookkeeping_record_id and r.business_id=e.business_id
 where not (e.reason='TRANSACTION_TYPE_UNCLEAR' and coalesce(e.question_context->>'factType','')='money_in_source'
   and r.source_kind='financial_transaction' and r.amount_cents>0)
 or e.id=public.current_money_source_question_event(e.business_id,e.bookkeeping_record_id,e.based_on_decision_id,e.evidence_fingerprint);
$$;
revoke all on function public.list_current_evidence_question_event_ids(timestamptz) from public,anon;
grant execute on function public.list_current_evidence_question_event_ids(timestamptz) to authenticated;

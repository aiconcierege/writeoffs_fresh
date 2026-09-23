-- A new decision ID created by an uncertainty response is not new evidence.
-- Keep unresolved treatment; ask again when supporting evidence changes.
create or replace function public.bookkeeping_has_current_expense_purpose_answer(p_business_id uuid,p_record_id uuid)
returns boolean language sql stable security invoker set search_path='' as $$
 select exists(
   select 1 from public.bookkeeping_decisions d
   join public.bookkeeping_review_events a on a.business_id=d.business_id
     and a.bookkeeping_record_id=d.bookkeeping_record_id
   where d.business_id=p_business_id and d.bookkeeping_record_id=p_record_id
     and not exists(select 1 from public.bookkeeping_decisions successor
       where successor.business_id=d.business_id and successor.supersedes_decision_id=d.id)
     and a.event_type='answered' and a.provenance='user'
     and a.reason='BUSINESS_PURPOSE_NEEDED'
     and a.question_context->>'factType'='ordinary_expense_purpose'
     and ((nullif(btrim(d.business_purpose),'') is not null
       and a.answer_payload->>'businessPurpose'=d.business_purpose)
      or (a.answer_payload='{"schemaVersion":1,"response":"not_sure"}'::jsonb
       and a.resulting_decision_id=d.id
       and a.evidence_fingerprint=public.current_bookkeeping_evidence_fingerprint(p_business_id,p_record_id)))
 );
$$;
revoke all on function public.bookkeeping_has_current_expense_purpose_answer(uuid,uuid) from public,anon,authenticated;
grant execute on function public.bookkeeping_has_current_expense_purpose_answer(uuid,uuid) to service_role;

-- A saved generic purchase-purpose fact must not be regenerated as a new
-- question merely because answering it created a new decision. No data is changed.
-- Category uncertainty remains in the assessment; meal/travel/conflict facts stay separate.
create function public.bookkeeping_has_current_expense_purpose_answer(p_business_id uuid,p_record_id uuid)
returns boolean language sql stable security invoker set search_path='' as $$
 select exists(
   select 1 from public.bookkeeping_decisions d
   join public.bookkeeping_review_events a on a.business_id=d.business_id
     and a.bookkeeping_record_id=d.bookkeeping_record_id
   where d.business_id=p_business_id and d.bookkeeping_record_id=p_record_id
     and not exists(select 1 from public.bookkeeping_decisions successor
       where successor.business_id=d.business_id and successor.supersedes_decision_id=d.id)
     and nullif(btrim(d.business_purpose),'') is not null
     and a.event_type='answered' and a.provenance='user'
     and a.reason='BUSINESS_PURPOSE_NEEDED'
     and a.question_context->>'factType'='ordinary_expense_purpose'
     and a.answer_payload->>'businessPurpose'=d.business_purpose
 );
$$;
revoke all on function public.bookkeeping_has_current_expense_purpose_answer(uuid,uuid) from public,anon,authenticated;
grant execute on function public.bookkeeping_has_current_expense_purpose_answer(uuid,uuid) to service_role;

-- Replace in place, retaining the function identity used by existing projections.
-- Existing duplicate events remain history, but cease being actionable at the
-- canonical eligibility boundary (including answer authorization), not just UI.
CREATE OR REPLACE FUNCTION public.list_current_evidence_question_event_ids(p_as_of timestamp with time zone DEFAULT now())
 RETURNS TABLE(event_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select eligible.event_id
 from public.list_current_evidence_question_event_ids_before_foundation(p_as_of) eligible
 join public.bookkeeping_review_events e on e.id=eligible.event_id
 join public.bookkeeping_records r on r.id=e.bookkeeping_record_id and r.business_id=e.business_id
 join public.bookkeeping_decisions d on d.id=e.based_on_decision_id and d.business_id=e.business_id
 where not (coalesce(e.question_context->>'factType','')='ordinary_expense_purpose'
   and public.bookkeeping_has_current_expense_purpose_answer(e.business_id,e.bookkeeping_record_id))
 and not (e.reason='BUSINESS_USE_UNCLEAR' and r.amount_cents>0)
 and not (e.question_context->>'factType'='ordinary_expense_purpose' and exists(
   select 1 from public.bookkeeping_allocations a where a.business_id=e.business_id
     and a.bookkeeping_decision_id=d.id and a.allocation_kind='business' and a.tax_category_key is not null))
 and not (e.reason='BUSINESS_USE_UNCLEAR' and exists(
   select 1 from public.bookkeeping_financial_sources fs
   join public.financial_transactions ft on ft.id=fs.financial_transaction_id and ft.business_id=fs.business_id
   join public.financial_accounts a on a.id=ft.financial_account_id and a.business_id=ft.business_id
   where fs.business_id=e.business_id and fs.bookkeeping_record_id=r.id and fs.revoked_at is null
     and a.provider='statement' and not exists(select 1 from public.current_financial_account_use u
       where u.financial_account_id=a.id and u.business_id=a.business_id)));
$function$;

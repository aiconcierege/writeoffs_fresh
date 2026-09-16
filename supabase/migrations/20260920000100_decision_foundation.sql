-- Preserve every historical decision/assessment. Category evidence is independent
-- of business use; allocations remain authority for established business amounts.
alter table public.schedule_c_expense_assessments add column category_state text not null default 'candidate'
  check (category_state in ('candidate','established','unresolved'));
create or replace view public.current_schedule_c_expense_assessments
  with(security_invoker=true,security_barrier=true) as
select assessment.* from public.schedule_c_expense_assessments assessment where not exists(
  select 1 from public.schedule_c_expense_assessments successor where successor.supersedes_assessment_id=assessment.id);

-- Filter obsolete questions without claiming an answer or deleting history.
alter function public.list_current_evidence_question_event_ids(timestamptz)
  rename to list_current_evidence_question_event_ids_before_foundation;
create function public.list_current_evidence_question_event_ids(p_as_of timestamptz default now())
returns table(event_id uuid) language sql stable security definer set search_path='' as $$
 select eligible.event_id
 from public.list_current_evidence_question_event_ids_before_foundation(p_as_of) eligible
 join public.bookkeeping_review_events e on e.id=eligible.event_id
 join public.bookkeeping_records r on r.id=e.bookkeeping_record_id and r.business_id=e.business_id
 join public.bookkeeping_decisions d on d.id=e.based_on_decision_id and d.business_id=e.business_id
 where not (e.reason='BUSINESS_USE_UNCLEAR' and r.amount_cents>0)
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
$$;
revoke all on function public.list_current_evidence_question_event_ids(timestamptz) from public,anon;
grant execute on function public.list_current_evidence_question_event_ids(timestamptz) to authenticated;
create or replace function public.list_current_askable_bookkeeping_question_event_ids(p_as_of timestamptz default now())
returns table(event_id uuid) language sql stable security definer set search_path='' as $$
 select e.id from public.list_current_evidence_question_event_ids(p_as_of) eligible
 join public.bookkeeping_review_events e on e.id=eligible.event_id
 join public.bookkeeping_records r on r.id=e.bookkeeping_record_id and r.business_id=e.business_id
 where not public.bookkeeping_question_is_historical_documentation(e.reason,e.question_context,r.occurred_on,
   public.bookkeeping_activity_day(e.business_id,p_as_of));
$$;

-- Bounded keyset backfill: only schedules the normal leased evaluator. No answers,
-- business designations, tax conclusions, or allocations are manufactured here.
create function public.enqueue_decision_foundation_batch(p_business_id uuid,p_after uuid default null,p_limit integer default 25)
returns table(record_id uuid) language plpgsql security definer set search_path='' as $$
declare target record;
begin
 if auth.role()<>'service_role' then raise exception 'trusted worker required'; end if;
 if p_limit not between 1 and 100 then raise exception 'invalid batch limit'; end if;
 for target in select r.id from public.bookkeeping_records r where r.business_id=p_business_id
   and (p_after is null or r.id>p_after) order by r.id limit p_limit loop
   perform public.request_bookkeeping_processing(p_business_id,target.id,'deterministic_evaluation',
     'bookkeeping-evaluator:v2:record:'||target.id::text||':foundation-ab:v1');
   record_id:=target.id; return next;
 end loop;
end; $$;
revoke all on function public.enqueue_decision_foundation_batch(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.enqueue_decision_foundation_batch(uuid,uuid,integer) to service_role;

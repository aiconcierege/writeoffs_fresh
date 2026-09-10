-- Versioned Schedule C operating-expense classification is separate from
-- economic nature, business use/allocation, and trusted tax treatment.

insert into public.categories(key,label) values
  ('commissions','Commissions and fees'),
  ('contract-labor','Contract labor'),
  ('insurance','Insurance (other than health)'),
  ('interest','Other business interest'),
  ('legal-professional','Legal and professional services'),
  ('rent-other','Rent or lease — other business property'),
  ('repairs','Repairs and maintenance'),
  ('taxes-licenses','Taxes and licenses'),
  ('travel','Travel'),
  ('utilities','Utilities'),
  ('software','Software and subscriptions'),
  ('postage','Postage and shipping'),
  ('fees','Payment-processing and bank fees'),
  ('other','Other ordinary operating expenses')
on conflict(key) do nothing;

create table public.schedule_c_expense_assessments(
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  bookkeeping_record_id uuid not null,
  bookkeeping_decision_id uuid not null,
  supersedes_assessment_id uuid,
  assessment_version text not null,
  assessment_status text not null check(assessment_status in('ordinary','needs_facts','special_treatment','unsupported')),
  schedule_c_category_key text references public.categories(key) on delete restrict,
  special_treatment_reason text,
  confidence numeric not null check(confidence between 0 and 1),
  evidence_fingerprint text not null check(evidence_fingerprint~'^[a-f0-9]{64}$'),
  evidence_references jsonb not null check(jsonb_typeof(evidence_references)='array'),
  factual_basis jsonb not null check(jsonb_typeof(factual_basis)='object'),
  provenance text not null check(provenance in('automation','system')),
  created_at timestamptz not null default now(),
  unique(id,business_id,bookkeeping_record_id),
  foreign key(bookkeeping_record_id,business_id) references public.bookkeeping_records(id,business_id) on delete restrict,
  foreign key(bookkeeping_decision_id,business_id,bookkeeping_record_id)
    references public.bookkeeping_decisions(id,business_id,bookkeeping_record_id) on delete restrict,
  foreign key(supersedes_assessment_id,business_id,bookkeeping_record_id)
    references public.schedule_c_expense_assessments(id,business_id,bookkeeping_record_id) on delete restrict,
  check((assessment_status='ordinary' and schedule_c_category_key is not null and special_treatment_reason is null)
    or (assessment_status='needs_facts' and schedule_c_category_key is null and special_treatment_reason is null)
    or (assessment_status in('special_treatment','unsupported') and schedule_c_category_key is null
      and special_treatment_reason is not null))
);
create unique index schedule_c_expense_assessment_root_idx on public.schedule_c_expense_assessments(bookkeeping_record_id)
  where supersedes_assessment_id is null;
create unique index schedule_c_expense_assessment_successor_idx on public.schedule_c_expense_assessments(supersedes_assessment_id)
  where supersedes_assessment_id is not null;
create index schedule_c_expense_assessment_business_idx on public.schedule_c_expense_assessments(business_id,created_at desc);

create view public.current_schedule_c_expense_assessments with(security_invoker=true,security_barrier=true) as
select assessment.* from public.schedule_c_expense_assessments assessment where not exists(
  select 1 from public.schedule_c_expense_assessments successor
  where successor.supersedes_assessment_id=assessment.id);

create trigger schedule_c_expense_assessments_immutable before update or delete on public.schedule_c_expense_assessments
  for each row execute function public.reject_canonical_bookkeeping_mutation();
alter table public.schedule_c_expense_assessments enable row level security;
create policy schedule_c_expense_assessments_select_own on public.schedule_c_expense_assessments for select to authenticated
  using(exists(select 1 from public.businesses business where business.id=business_id
    and business.owner_user_id=(select auth.uid())));
revoke all on public.schedule_c_expense_assessments from public,anon,authenticated;
grant select on public.schedule_c_expense_assessments,public.current_schedule_c_expense_assessments to authenticated,service_role;
grant insert on public.schedule_c_expense_assessments to service_role;

comment on table public.schedule_c_expense_assessments is
  'Append-only classification and containment assessments. Business allocation and trusted tax treatment remain separate canonical conclusions.';

create or replace function public.enqueue_schedule_c_assessment_after_decision()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.bookkeeping_nature='expense' then
    perform public.request_bookkeeping_processing(new.business_id,new.bookkeeping_record_id,
      'deterministic_evaluation','bookkeeping-evaluator:v1:record:'||new.bookkeeping_record_id::text
      ||':schedule-c-decision:'||new.id::text);
  end if;
  return new;
end $$;
create trigger bookkeeping_decisions_schedule_c_assessment
after insert on public.bookkeeping_decisions for each row
execute function public.enqueue_schedule_c_assessment_after_decision();
revoke execute on function public.enqueue_schedule_c_assessment_after_decision() from public,anon,authenticated,service_role;

-- Reevaluate current expense records without rewriting their decisions or any
-- historical review. The request identity is versioned and idempotent.
select public.request_bookkeeping_processing(record.business_id,record.id,'deterministic_evaluation',
  'bookkeeping-evaluator:v1:record:'||record.id::text||':schedule-c-operating:v1')
from public.bookkeeping_records record
where exists(select 1 from public.bookkeeping_decisions decision
  where decision.business_id=record.business_id and decision.bookkeeping_record_id=record.id
    and decision.bookkeeping_nature='expense'
    and not exists(select 1 from public.bookkeeping_decisions successor where successor.supersedes_decision_id=decision.id));

-- Append-only, allocation-scoped tax-preparation conclusions. Categories alone
-- never imply deductibility; only a versioned trusted treatment may do so.

alter table public.bookkeeping_allocations
  add constraint bookkeeping_allocations_tax_scope_unique
  unique (id, business_id, bookkeeping_record_id, bookkeeping_decision_id);

create table public.bookkeeping_tax_treatments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  bookkeeping_record_id uuid not null,
  bookkeeping_decision_id uuid not null,
  bookkeeping_allocation_id uuid not null,
  supersedes_tax_treatment_id uuid,
  conclusion_key text not null,
  treatment_status text not null,
  deductible_amount_cents bigint,
  tax_category_key text references public.categories(key) on delete restrict,
  rule_key text,
  rule_version integer,
  reason text not null,
  provenance text not null,
  confidence numeric,
  created_at timestamptz not null default now(),
  constraint bookkeeping_tax_treatments_allocation_fkey foreign key
    (bookkeeping_allocation_id, business_id, bookkeeping_record_id, bookkeeping_decision_id)
    references public.bookkeeping_allocations
    (id, business_id, bookkeeping_record_id, bookkeeping_decision_id) on delete restrict,
  constraint bookkeeping_tax_treatments_self_scope_unique
    unique (id, business_id, bookkeeping_allocation_id),
  constraint bookkeeping_tax_treatments_predecessor_fkey foreign key
    (supersedes_tax_treatment_id, business_id, bookkeeping_allocation_id)
    references public.bookkeeping_tax_treatments
    (id, business_id, bookkeeping_allocation_id) on delete restrict,
  constraint bookkeeping_tax_treatments_status_check check
    (treatment_status in ('unresolved','deductible','not_deductible')),
  constraint bookkeeping_tax_treatments_provenance_check check
    (provenance in ('automation','system')),
  constraint bookkeeping_tax_treatments_confidence_check check
    (confidence is null or (confidence >= 0 and confidence <= 1)),
  constraint bookkeeping_tax_treatments_reason_check check
    (length(btrim(reason)) between 1 and 1000),
  constraint bookkeeping_tax_treatments_conclusion_key_check check
    (length(btrim(conclusion_key)) between 1 and 200),
  constraint bookkeeping_tax_treatments_shape_check check (
    (treatment_status = 'unresolved' and deductible_amount_cents is null
      and tax_category_key is null and rule_key is null and rule_version is null)
    or
    (treatment_status = 'not_deductible' and deductible_amount_cents = 0
      and tax_category_key is not null and length(btrim(rule_key)) > 0 and rule_version > 0)
    or
    (treatment_status = 'deductible' and deductible_amount_cents <> 0
      and tax_category_key is not null and length(btrim(rule_key)) > 0 and rule_version > 0)
  )
);

create unique index bookkeeping_tax_treatments_one_root_idx
  on public.bookkeeping_tax_treatments (bookkeeping_allocation_id)
  where supersedes_tax_treatment_id is null;
create unique index bookkeeping_tax_treatments_one_successor_idx
  on public.bookkeeping_tax_treatments (supersedes_tax_treatment_id)
  where supersedes_tax_treatment_id is not null;
create unique index bookkeeping_tax_treatments_idempotency_idx
  on public.bookkeeping_tax_treatments (business_id, bookkeeping_allocation_id, conclusion_key);
create index bookkeeping_tax_treatments_business_category_idx
  on public.bookkeeping_tax_treatments (business_id, tax_category_key, created_at);

create or replace function public.validate_bookkeeping_tax_treatment()
returns trigger language plpgsql security definer set search_path = '' as $$
declare allocation public.bookkeeping_allocations%rowtype;
begin
  select * into allocation from public.bookkeeping_allocations
  where id = new.bookkeeping_allocation_id and business_id = new.business_id
    and bookkeeping_record_id = new.bookkeeping_record_id
    and bookkeeping_decision_id = new.bookkeeping_decision_id for share;
  if not found or allocation.allocation_kind <> 'business' then
    raise exception 'tax treatment requires a Business-scoped business allocation';
  end if;
  if new.treatment_status <> 'unresolved'
    and allocation.tax_category_key is distinct from new.tax_category_key then
    raise exception 'tax treatment category must match the canonical allocation';
  end if;
  if new.treatment_status = 'deductible' and
    (sign(new.deductible_amount_cents) <> sign(allocation.amount_cents)
      or abs(new.deductible_amount_cents) > abs(allocation.amount_cents)) then
    raise exception 'deductible amount exceeds the signed canonical allocation';
  end if;
  if new.supersedes_tax_treatment_id is null and exists (
    select 1 from public.bookkeeping_tax_treatments
    where bookkeeping_allocation_id = new.bookkeeping_allocation_id
  ) then raise exception 'only the first tax treatment may be a root'; end if;
  return new;
end $$;

create trigger bookkeeping_tax_treatments_validate
before insert on public.bookkeeping_tax_treatments
for each row execute function public.validate_bookkeeping_tax_treatment();
create trigger bookkeeping_tax_treatments_reject_update
before update or delete on public.bookkeeping_tax_treatments
for each row execute function public.reject_canonical_bookkeeping_mutation();

alter table public.bookkeeping_tax_treatments enable row level security;
revoke all on public.bookkeeping_tax_treatments from public, anon, authenticated;
grant select on public.bookkeeping_tax_treatments to authenticated;
grant select, insert on public.bookkeeping_tax_treatments to service_role;

create policy "bookkeeping_tax_treatments_select_own_business"
on public.bookkeeping_tax_treatments for select to authenticated
using (exists (select 1 from public.businesses
  where businesses.id = bookkeeping_tax_treatments.business_id
    and businesses.owner_user_id = (select auth.uid())));

comment on table public.bookkeeping_tax_treatments is
  'Append-only trusted tax-preparation conclusions for exact current-decision business allocations. Category alone never establishes deductibility.';

-- Add the Product Specification v2 onboarding data foundation.
--
-- This migration is additive. Legacy Business entity/industry fields and the
-- existing home-office JSON remain unchanged for compatibility.

alter table public.businesses
  add column legal_structure text,
  add column federal_tax_reporting_type text,
  add column business_description text,
  add column business_start_month date,
  add column onboarding_state text not null default 'not_started',
  add column onboarding_version smallint,
  add column has_qualifying_home_office boolean,
  add column home_office_square_feet smallint,
  add constraint businesses_legal_structure_check check (
    legal_structure is null
    or legal_structure in (
      'sole_proprietor',
      'single_member_llc',
      'partnership_multi_member_llc',
      'corporation',
      'not_sure'
    )
  ),
  add constraint businesses_federal_tax_reporting_type_check check (
    federal_tax_reporting_type is null
    or federal_tax_reporting_type in (
      'schedule_c',
      's_corporation',
      'c_corporation',
      'partnership',
      'not_sure'
    )
  ),
  add constraint businesses_description_check check (
    business_description is null
    or char_length(btrim(business_description)) between 1 and 2000
  ),
  add constraint businesses_start_month_check check (
    business_start_month is null
    or extract(day from business_start_month) = 1
  ),
  add constraint businesses_onboarding_state_check check (
    onboarding_state in ('not_started', 'in_progress', 'completed')
  ),
  add constraint businesses_onboarding_version_check check (
    onboarding_version is null or onboarding_version >= 1
  ),
  add constraint businesses_home_office_square_feet_check check (
    home_office_square_feet is null
    or home_office_square_feet between 1 and 10000
  ),
  add constraint businesses_home_office_answer_check check (
    home_office_square_feet is null
    or has_qualifying_home_office is true
  );

comment on column public.businesses.legal_structure is
  'Nullable v2 onboarding answer. Separate from federal tax reporting type and legacy entity_type.';
comment on column public.businesses.federal_tax_reporting_type is
  'Nullable v2 federal reporting answer; intentionally independent of legal structure.';
comment on column public.businesses.business_description is
  'Natural-language description of what the business does.';
comment on column public.businesses.business_start_month is
  'First day of the month in which the business started; UI presents month and year only.';
comment on column public.businesses.onboarding_state is
  'Versioned onboarding workflow state; existing users begin not_started without fabricated answers.';
comment on column public.businesses.onboarding_version is
  'Onboarding specification version started or completed by the user; null until onboarding begins.';
comment on column public.businesses.has_qualifying_home_office is
  'Nullable user answer about regular and exclusive business use for the simplified method.';
comment on column public.businesses.home_office_square_feet is
  'Business-use square footage supplied for the simplified home-office method.';

create table public.business_vehicles (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  slot smallint not null,
  display_name text not null,
  vehicle_year smallint,
  make text,
  model text,
  is_mixed_use boolean,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint business_vehicles_slot_check check (slot in (1, 2)),
  constraint business_vehicles_display_name_check check (
    char_length(btrim(display_name)) between 1 and 120
  ),
  constraint business_vehicles_year_check check (
    vehicle_year is null or vehicle_year between 1900 and 2100
  )
);

comment on table public.business_vehicles is
  'Business-owned vehicle setup for v2 onboarding and future mileage records; at most two may be active.';
comment on column public.business_vehicles.slot is
  'Active vehicle position. Slots 1 and 2 enforce the launch limit without deleting archived history.';
comment on column public.business_vehicles.is_mixed_use is
  'Nullable until the user answers whether the vehicle has both business and personal use.';

create unique index business_vehicles_active_slot_unique_idx
  on public.business_vehicles (business_id, slot)
  where archived_at is null;

create index business_vehicles_business_idx
  on public.business_vehicles (business_id, created_at);

alter table public.business_vehicles enable row level security;

create policy "business_vehicles_select_own_business"
  on public.business_vehicles for select
  to authenticated
  using (
    exists (
      select 1
      from public.businesses
      where businesses.id = business_vehicles.business_id
        and businesses.owner_user_id = (select auth.uid())
    )
  );

create policy "business_vehicles_insert_own_business"
  on public.business_vehicles for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.businesses
      where businesses.id = business_vehicles.business_id
        and businesses.owner_user_id = (select auth.uid())
    )
  );

create policy "business_vehicles_update_own_business"
  on public.business_vehicles for update
  to authenticated
  using (
    exists (
      select 1
      from public.businesses
      where businesses.id = business_vehicles.business_id
        and businesses.owner_user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.businesses
      where businesses.id = business_vehicles.business_id
        and businesses.owner_user_id = (select auth.uid())
    )
  );

create or replace function public.protect_business_vehicle_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
    or new.business_id is distinct from old.business_id
    or new.created_at is distinct from old.created_at
  then
    raise exception 'business vehicle identity fields are immutable';
  end if;

  return new;
end;
$$;

create trigger business_vehicles_protect_identity
before update on public.business_vehicles
for each row execute function public.protect_business_vehicle_identity();

create trigger business_vehicles_set_updated_at
before update on public.business_vehicles
for each row execute function public.set_updated_at();

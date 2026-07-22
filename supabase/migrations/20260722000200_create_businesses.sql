-- Introduce the one-business-per-user aggregate required by the MVP.

create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  name text,
  entity_type text,
  industry text,
  state text,
  accounting_method text not null default 'cash',
  tax_year smallint,
  home_office_configuration jsonb,
  owner_name text,
  contact_email text,
  phone text,
  address_line1 text,
  address_line2 text,
  city text,
  postal_code text,
  country text not null default 'US',
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint businesses_one_per_user unique (owner_user_id),
  constraint businesses_entity_type_check check (
    entity_type is null
    or entity_type in ('sole_proprietor', 'single_member_llc')
  ),
  constraint businesses_accounting_method_check check (
    accounting_method = 'cash'
  ),
  constraint businesses_state_check check (
    state is null or state ~ '^[A-Z]{2}$'
  ),
  constraint businesses_tax_year_check check (
    tax_year is null or tax_year between 2000 and 2100
  ),
  constraint businesses_country_check check (country = 'US')
);

comment on table public.businesses is
  'The parent bookkeeping object. Milestone 1 supports exactly one US Schedule C business per authenticated user.';
comment on column public.businesses.home_office_configuration is
  'Reserved for the Product Operating Manual home-office configuration; no home-office workflow is implemented in Milestone 1.';

create index businesses_tax_year_idx on public.businesses (tax_year);

alter table public.businesses enable row level security;

create policy "businesses_select_own"
  on public.businesses for select
  to authenticated
  using ((select auth.uid()) = owner_user_id);

create policy "businesses_update_own"
  on public.businesses for update
  to authenticated
  using ((select auth.uid()) = owner_user_id)
  with check ((select auth.uid()) = owner_user_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger businesses_set_updated_at
before update on public.businesses
for each row execute function public.set_updated_at();

-- Existing users receive a sparse business record. Qualification data remains
-- incomplete until the approved onboarding flow collects it.
insert into public.businesses (
  owner_user_id,
  name,
  industry,
  owner_name,
  contact_email
)
select
  users.id,
  nullif(trim(users.raw_user_meta_data ->> 'business_name'), ''),
  nullif(trim(profiles.vertical), ''),
  nullif(trim(coalesce(
    users.raw_user_meta_data ->> 'full_name',
    users.raw_user_meta_data ->> 'name'
  )), ''),
  users.email
from auth.users as users
left join public.profiles as profiles on profiles.id = users.id
on conflict (owner_user_id) do nothing;

create or replace function public.create_business_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.businesses (
    owner_user_id,
    name,
    owner_name,
    contact_email
  )
  values (
    new.id,
    nullif(trim(new.raw_user_meta_data ->> 'business_name'), ''),
    nullif(trim(coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name'
    )), ''),
    new.email
  )
  on conflict (owner_user_id) do nothing;

  return new;
end;
$$;

create trigger create_business_after_user_signup
after insert on auth.users
for each row execute function public.create_business_for_new_user();

-- Theme is a user preference, not business bookkeeping data.
alter table public.profiles
  add column if not exists theme text not null default 'system';

alter table public.profiles
  add constraint profiles_theme_check
  check (theme in ('system', 'light', 'dark'));

-- Provider-neutral financial accounts. Provider credentials never belong here.

create table public.financial_accounts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  provider text,
  provider_connection_id text,
  provider_account_id text,
  institution_name text not null,
  display_name text not null,
  account_type text not null,
  account_subtype text,
  mask_last_four text,
  currency text not null default 'USD',
  connection_status text not null default 'active',
  last_synced_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint financial_accounts_provider_identity_check check (
    (provider is null and provider_account_id is null)
    or (provider is not null and provider_account_id is not null)
  ),
  constraint financial_accounts_type_check check (
    account_type in ('checking', 'savings', 'credit_card')
  ),
  constraint financial_accounts_mask_check check (
    mask_last_four is null or mask_last_four ~ '^[0-9]{4}$'
  ),
  constraint financial_accounts_currency_check check (
    currency ~ '^[A-Z]{3}$'
  ),
  constraint financial_accounts_connection_status_check check (
    connection_status in ('active', 'reconnect_required', 'disconnected', 'error')
  )
);

comment on table public.financial_accounts is
  'Provider-neutral account identity owned by a Business. Contains no provider access credentials.';
comment on column public.financial_accounts.provider is
  'Optional external source namespace, such as a future Plaid integration. The core account model does not depend on it.';
comment on column public.financial_accounts.provider_connection_id is
  'Opaque external connection reference only; never an access token or secret.';

create index financial_accounts_business_status_idx
  on public.financial_accounts (business_id, connection_status)
  where archived_at is null;
create unique index financial_accounts_provider_account_unique_idx
  on public.financial_accounts (provider, provider_account_id)
  where provider is not null and provider_account_id is not null;

alter table public.financial_accounts enable row level security;

create policy "financial_accounts_select_own_business"
  on public.financial_accounts for select
  to authenticated
  using (
    exists (
      select 1
      from public.businesses
      where businesses.id = financial_accounts.business_id
        and businesses.owner_user_id = (select auth.uid())
    )
  );

create policy "financial_accounts_insert_own_business"
  on public.financial_accounts for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.businesses
      where businesses.id = financial_accounts.business_id
        and businesses.owner_user_id = (select auth.uid())
    )
  );

create or replace function public.protect_financial_account_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
    or new.business_id is distinct from old.business_id
    or new.provider is distinct from old.provider
    or new.provider_connection_id is distinct from old.provider_connection_id
    or new.provider_account_id is distinct from old.provider_account_id
    or new.account_type is distinct from old.account_type
    or new.currency is distinct from old.currency
  then
    raise exception 'financial account identity fields are immutable';
  end if;

  return new;
end;
$$;

create trigger financial_accounts_protect_identity
before update on public.financial_accounts
for each row execute function public.protect_financial_account_identity();

create trigger financial_accounts_set_updated_at
before update on public.financial_accounts
for each row execute function public.set_updated_at();

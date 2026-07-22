-- Immutable, provider-neutral imported payment activity.

alter table public.financial_accounts
  add constraint financial_accounts_id_business_unique unique (id, business_id);

create table public.financial_transactions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  financial_account_id uuid not null,
  external_transaction_id text,
  source_fingerprint text not null,
  import_method text not null,
  merchant_name text,
  original_description text not null,
  amount_cents bigint not null,
  currency text not null default 'USD',
  transaction_date date not null,
  authorized_at timestamptz,
  pending boolean not null default false,
  raw_payload jsonb,
  imported_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint financial_transactions_account_business_fkey
    foreign key (financial_account_id, business_id)
    references public.financial_accounts(id, business_id)
    on delete restrict,
  constraint financial_transactions_amount_check check (amount_cents <> 0),
  constraint financial_transactions_currency_check check (currency ~ '^[A-Z]{3}$'),
  constraint financial_transactions_import_method_check check (
    import_method in ('provider', 'csv')
  )
);

comment on table public.financial_transactions is
  'Immutable imported payment facts. Bookkeeping decisions belong to Economic Events, which are intentionally not part of Milestone 1.';
comment on column public.financial_transactions.amount_cents is
  'Signed amount in minor currency units; importer adapters normalize provider-specific sign conventions.';
comment on column public.financial_transactions.raw_payload is
  'Optional source evidence. Must not contain provider credentials or access tokens.';

create unique index financial_transactions_account_fingerprint_unique_idx
  on public.financial_transactions (financial_account_id, source_fingerprint);
create unique index financial_transactions_external_id_unique_idx
  on public.financial_transactions (financial_account_id, external_transaction_id)
  where external_transaction_id is not null;
create index financial_transactions_business_date_idx
  on public.financial_transactions (business_id, transaction_date desc, id);
create index financial_transactions_account_date_idx
  on public.financial_transactions (financial_account_id, transaction_date desc, id);

alter table public.financial_transactions enable row level security;

create policy "financial_transactions_select_own_business"
  on public.financial_transactions for select
  to authenticated
  using (
    exists (
      select 1
      from public.businesses
      where businesses.id = financial_transactions.business_id
        and businesses.owner_user_id = (select auth.uid())
    )
  );

create policy "financial_transactions_insert_own_business"
  on public.financial_transactions for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.businesses
      where businesses.id = financial_transactions.business_id
        and businesses.owner_user_id = (select auth.uid())
    )
  );

create or replace function public.reject_financial_transaction_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'financial transactions are immutable';
end;
$$;

create trigger financial_transactions_reject_update
before update on public.financial_transactions
for each row execute function public.reject_financial_transaction_mutation();

create trigger financial_transactions_reject_delete
before delete on public.financial_transactions
for each row execute function public.reject_financial_transaction_mutation();

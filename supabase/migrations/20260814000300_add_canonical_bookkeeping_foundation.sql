-- Canonical bookkeeping treatment separated from immutable source evidence.
-- This migration is additive and intentionally performs no data backfill.

alter table public.financial_transactions
  add constraint financial_transactions_id_business_unique
  unique (id, business_id);

create table public.bookkeeping_records (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  source_kind text not null,
  ingestion_key text not null,
  amount_cents bigint,
  currency text not null default 'USD',
  occurred_on date,
  created_at timestamptz not null default now(),
  constraint bookkeeping_records_id_business_unique unique (id, business_id),
  constraint bookkeeping_records_source_check check (
    source_kind in ('financial_transaction', 'receipt', 'manual')
  ),
  constraint bookkeeping_records_amount_check check (
    amount_cents is null or amount_cents <> 0
  ),
  constraint bookkeeping_records_currency_check check (currency ~ '^[A-Z]{3}$')
);

comment on table public.bookkeeping_records is
  'Provider-neutral canonical identity for bookkeeping treatment. Source identity and monetary facts are immutable.';
comment on column public.bookkeeping_records.ingestion_key is
  'Caller-stable idempotency key scoped to a Business and source kind.';

create unique index bookkeeping_records_ingestion_unique_idx
  on public.bookkeeping_records (business_id, source_kind, ingestion_key);
create index bookkeeping_records_business_date_idx
  on public.bookkeeping_records (business_id, occurred_on desc, id);

create table public.bookkeeping_financial_sources (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  bookkeeping_record_id uuid not null,
  financial_transaction_id uuid not null,
  provenance text not null,
  actor_user_id uuid references auth.users(id) on delete restrict,
  linked_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by_user_id uuid references auth.users(id) on delete restrict,
  revocation_reason text,
  constraint bookkeeping_financial_sources_record_fkey
    foreign key (bookkeeping_record_id, business_id)
    references public.bookkeeping_records(id, business_id)
    on delete restrict,
  constraint bookkeeping_financial_sources_transaction_fkey
    foreign key (financial_transaction_id, business_id)
    references public.financial_transactions(id, business_id)
    on delete restrict,
  constraint bookkeeping_financial_sources_provenance_check check (
    provenance in ('automation', 'user', 'system', 'import')
  ),
  constraint bookkeeping_financial_sources_actor_check check (
    (provenance = 'user' and actor_user_id is not null)
    or (provenance <> 'user' and actor_user_id is null)
  ),
  constraint bookkeeping_financial_sources_revocation_check check (
    (revoked_at is null and revoked_by_user_id is null and revocation_reason is null)
    or (revoked_at is not null and revocation_reason is not null)
  )
);

comment on table public.bookkeeping_financial_sources is
  'Historical Business-scoped associations between canonical treatment and source financial evidence. Receipt/manual matches may be revoked; financial-origin evidence may not.';

create unique index bookkeeping_financial_sources_active_record_unique_idx
  on public.bookkeeping_financial_sources (bookkeeping_record_id)
  where revoked_at is null;
create unique index bookkeeping_financial_sources_active_transaction_unique_idx
  on public.bookkeeping_financial_sources (financial_transaction_id)
  where revoked_at is null;

create table public.bookkeeping_decisions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  bookkeeping_record_id uuid not null,
  supersedes_decision_id uuid,
  treatment text not null,
  review_status text not null,
  provenance text not null,
  actor_user_id uuid references auth.users(id) on delete restrict,
  confidence numeric(5,4),
  reason text,
  business_purpose text,
  created_at timestamptz not null default now(),
  constraint bookkeeping_decisions_id_business_record_unique
    unique (id, business_id, bookkeeping_record_id),
  constraint bookkeeping_decisions_record_fkey
    foreign key (bookkeeping_record_id, business_id)
    references public.bookkeeping_records(id, business_id)
    on delete restrict,
  constraint bookkeeping_decisions_supersedes_fkey
    foreign key (supersedes_decision_id, business_id, bookkeeping_record_id)
    references public.bookkeeping_decisions(id, business_id, bookkeeping_record_id)
    on delete restrict,
  constraint bookkeeping_decisions_treatment_check check (
    treatment in ('unresolved', 'business', 'personal', 'mixed_use', 'excluded')
  ),
  constraint bookkeeping_decisions_review_status_check check (
    review_status in ('not_required', 'needs_review', 'in_review', 'resolved')
  ),
  constraint bookkeeping_decisions_provenance_check check (
    provenance in ('automation', 'user', 'system', 'import')
  ),
  constraint bookkeeping_decisions_actor_check check (
    (provenance = 'user' and actor_user_id is not null)
    or (provenance <> 'user' and actor_user_id is null)
  ),
  constraint bookkeeping_decisions_confidence_check check (
    confidence is null or (confidence >= 0 and confidence <= 1)
  ),
  constraint bookkeeping_decisions_user_confidence_check check (
    provenance <> 'user' or confidence is null
  ),
  constraint bookkeeping_decisions_unresolved_review_check check (
    treatment <> 'unresolved' or review_status in ('needs_review', 'in_review')
  )
);

comment on table public.bookkeeping_decisions is
  'Append-only bookkeeping interpretations. Corrections supersede, never rewrite, earlier decisions.';

create unique index bookkeeping_decisions_one_initial_idx
  on public.bookkeeping_decisions (bookkeeping_record_id)
  where supersedes_decision_id is null;
create unique index bookkeeping_decisions_one_successor_idx
  on public.bookkeeping_decisions (supersedes_decision_id)
  where supersedes_decision_id is not null;
create index bookkeeping_decisions_review_idx
  on public.bookkeeping_decisions (business_id, review_status, created_at)
  where review_status in ('needs_review', 'in_review');

create table public.bookkeeping_allocations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  bookkeeping_record_id uuid not null,
  bookkeeping_decision_id uuid not null,
  allocation_kind text not null,
  amount_cents bigint not null,
  tax_category_key text references public.categories(key) on delete restrict,
  memo text,
  created_at timestamptz not null default now(),
  constraint bookkeeping_allocations_decision_fkey
    foreign key (bookkeeping_decision_id, business_id, bookkeeping_record_id)
    references public.bookkeeping_decisions(id, business_id, bookkeeping_record_id)
    on delete restrict,
  constraint bookkeeping_allocations_kind_check check (
    allocation_kind in ('business', 'personal', 'excluded')
  ),
  constraint bookkeeping_allocations_amount_check check (amount_cents <> 0),
  constraint bookkeeping_allocations_category_check check (
    (allocation_kind = 'business')
    or tax_category_key is null
  )
);

comment on table public.bookkeeping_allocations is
  'Immutable signed allocations for one decision. Resolved decisions reconcile exactly to the canonical record amount.';

create index bookkeeping_allocations_decision_idx
  on public.bookkeeping_allocations (bookkeeping_decision_id);
create index bookkeeping_allocations_business_category_idx
  on public.bookkeeping_allocations (business_id, tax_category_key)
  where allocation_kind = 'business';

create table public.bookkeeping_document_links (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  bookkeeping_record_id uuid not null,
  receipt_id uuid not null references public.receipts(id) on delete restrict,
  provenance text not null,
  actor_user_id uuid references auth.users(id) on delete restrict,
  linked_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by_user_id uuid references auth.users(id) on delete restrict,
  revocation_reason text,
  constraint bookkeeping_document_links_record_fkey
    foreign key (bookkeeping_record_id, business_id)
    references public.bookkeeping_records(id, business_id)
    on delete restrict,
  constraint bookkeeping_document_links_provenance_check check (
    provenance in ('automation', 'user', 'system', 'import')
  ),
  constraint bookkeeping_document_links_actor_check check (
    (provenance = 'user' and actor_user_id is not null)
    or (provenance <> 'user' and actor_user_id is null)
  ),
  constraint bookkeeping_document_links_revocation_check check (
    (revoked_at is null and revoked_by_user_id is null and revocation_reason is null)
    or (revoked_at is not null and revocation_reason is not null)
  )
);

comment on table public.bookkeeping_document_links is
  'Historical receipt/document associations. Revocation retains the original link and provenance.';

create unique index bookkeeping_document_links_active_unique_idx
  on public.bookkeeping_document_links (bookkeeping_record_id, receipt_id)
  where revoked_at is null;
create index bookkeeping_document_links_receipt_idx
  on public.bookkeeping_document_links (receipt_id, linked_at desc);

create or replace function public.assert_bookkeeping_record_source(record_uuid uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  selected_record public.bookkeeping_records%rowtype;
  source_transaction public.financial_transactions%rowtype;
  current_treatment text;
  current_allocation_total numeric;
begin
  select * into selected_record
  from public.bookkeeping_records
  where id = record_uuid;
  if not found then return; end if;

  select transactions.* into source_transaction
  from public.bookkeeping_financial_sources as sources
  join public.financial_transactions as transactions
    on transactions.id = sources.financial_transaction_id
   and transactions.business_id = sources.business_id
  where sources.bookkeeping_record_id = selected_record.id
    and sources.business_id = selected_record.business_id
    and sources.revoked_at is null;

  if selected_record.source_kind = 'financial_transaction' then
    if not found then
      raise exception 'financial-origin bookkeeping records require source evidence';
    end if;
    if selected_record.amount_cents is distinct from source_transaction.amount_cents
      or selected_record.currency is distinct from source_transaction.currency
      or selected_record.occurred_on is distinct from source_transaction.transaction_date
    then
      raise exception 'bookkeeping source facts must match immutable financial transaction';
    end if;
  end if;

  if source_transaction.id is not null then
    select decisions.treatment, coalesce(sum(allocations.amount_cents), 0)
    into current_treatment, current_allocation_total
    from public.bookkeeping_decisions as decisions
    left join public.bookkeeping_allocations as allocations
      on allocations.bookkeeping_decision_id = decisions.id
    where decisions.bookkeeping_record_id = selected_record.id
      and decisions.business_id = selected_record.business_id
      and not exists (
        select 1 from public.bookkeeping_decisions as successors
        where successors.supersedes_decision_id = decisions.id
      )
    group by decisions.id, decisions.treatment;

    if current_treatment is not null
      and current_treatment <> 'unresolved'
      and current_allocation_total <> source_transaction.amount_cents
    then
      raise exception 'financial source amount requires a reconciled bookkeeping correction';
    end if;
  end if;
end;
$$;

create or replace function public.check_bookkeeping_record_origin()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform public.assert_bookkeeping_record_source(new.id);
  return new;
end;
$$;

create or replace function public.check_bookkeeping_financial_source()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform public.assert_bookkeeping_record_source(new.bookkeeping_record_id);
  return new;
end;
$$;

create constraint trigger bookkeeping_records_validate_source
after insert on public.bookkeeping_records
deferrable initially deferred
for each row execute function public.check_bookkeeping_record_origin();
create constraint trigger bookkeeping_financial_sources_validate_source
after insert on public.bookkeeping_financial_sources
deferrable initially deferred
for each row execute function public.check_bookkeeping_financial_source();

create or replace function public.reject_canonical_bookkeeping_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'canonical bookkeeping records are append-only';
end;
$$;

create trigger bookkeeping_records_reject_update
before update or delete on public.bookkeeping_records
for each row execute function public.reject_canonical_bookkeeping_mutation();
create trigger bookkeeping_financial_sources_reject_update
before delete on public.bookkeeping_financial_sources
for each row execute function public.reject_canonical_bookkeeping_mutation();
create trigger bookkeeping_decisions_reject_update
before update or delete on public.bookkeeping_decisions
for each row execute function public.reject_canonical_bookkeeping_mutation();
create trigger bookkeeping_allocations_reject_update
before update or delete on public.bookkeeping_allocations
for each row execute function public.reject_canonical_bookkeeping_mutation();

create or replace function public.validate_bookkeeping_actor()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.actor_user_id is not null and not exists (
    select 1 from public.businesses
    where id = new.business_id and owner_user_id = new.actor_user_id
  ) then
    raise exception 'decision actor does not own bookkeeping Business';
  end if;
  return new;
end;
$$;

create trigger bookkeeping_decisions_validate_actor
before insert on public.bookkeeping_decisions
for each row execute function public.validate_bookkeeping_actor();
create trigger bookkeeping_financial_sources_validate_actor
before insert on public.bookkeeping_financial_sources
for each row execute function public.validate_bookkeeping_actor();
create trigger bookkeeping_document_links_validate_actor
before insert on public.bookkeeping_document_links
for each row execute function public.validate_bookkeeping_actor();

create or replace function public.protect_bookkeeping_financial_source_history()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  original_amount bigint;
  current_treatment text;
  current_allocation_total numeric;
begin
  if new.id is distinct from old.id
    or new.business_id is distinct from old.business_id
    or new.bookkeeping_record_id is distinct from old.bookkeeping_record_id
    or new.financial_transaction_id is distinct from old.financial_transaction_id
    or new.provenance is distinct from old.provenance
    or new.actor_user_id is distinct from old.actor_user_id
    or new.linked_at is distinct from old.linked_at
    or old.revoked_at is not null
    or new.revoked_at is null
  then
    raise exception 'bookkeeping financial source identity and history are immutable';
  end if;
  if exists (
    select 1 from public.bookkeeping_records
    where id = old.bookkeeping_record_id
      and business_id = old.business_id
      and source_kind = 'financial_transaction'
  ) then
    raise exception 'financial-origin source evidence cannot be revoked';
  end if;

  select amount_cents into original_amount
  from public.bookkeeping_records
  where id = old.bookkeeping_record_id and business_id = old.business_id;

  select decisions.treatment, coalesce(sum(allocations.amount_cents), 0)
  into current_treatment, current_allocation_total
  from public.bookkeeping_decisions as decisions
  left join public.bookkeeping_allocations as allocations
    on allocations.bookkeeping_decision_id = decisions.id
  where decisions.bookkeeping_record_id = old.bookkeeping_record_id
    and decisions.business_id = old.business_id
    and not exists (
      select 1 from public.bookkeeping_decisions as successors
      where successors.supersedes_decision_id = decisions.id
    )
  group by decisions.id, decisions.treatment;

  if current_treatment is not null
    and current_treatment <> 'unresolved'
    and current_allocation_total is distinct from original_amount
  then
    raise exception 'source revocation requires a reconciled bookkeeping correction';
  end if;
  if new.revoked_by_user_id is not null and not exists (
    select 1 from public.businesses
    where id = new.business_id and owner_user_id = new.revoked_by_user_id
  ) then
    raise exception 'revoking user does not own bookkeeping Business';
  end if;
  return new;
end;
$$;

create trigger bookkeeping_financial_sources_protect_history
before update on public.bookkeeping_financial_sources
for each row execute function public.protect_bookkeeping_financial_source_history();

create or replace function public.validate_bookkeeping_document_owner()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.receipts
    join public.businesses on businesses.owner_user_id = receipts.user_id
    where receipts.id = new.receipt_id
      and businesses.id = new.business_id
  ) then
    raise exception 'receipt does not belong to bookkeeping Business';
  end if;
  if new.revoked_by_user_id is not null and not exists (
    select 1 from public.businesses
    where id = new.business_id and owner_user_id = new.revoked_by_user_id
  ) then
    raise exception 'revoking user does not own bookkeeping Business';
  end if;
  return new;
end;
$$;

create trigger bookkeeping_document_links_validate_owner
before insert or update on public.bookkeeping_document_links
for each row execute function public.validate_bookkeeping_document_owner();

create or replace function public.protect_bookkeeping_document_link_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
    or new.business_id is distinct from old.business_id
    or new.bookkeeping_record_id is distinct from old.bookkeeping_record_id
    or new.receipt_id is distinct from old.receipt_id
    or new.provenance is distinct from old.provenance
    or new.actor_user_id is distinct from old.actor_user_id
    or new.linked_at is distinct from old.linked_at
    or old.revoked_at is not null
    or new.revoked_at is null
  then
    raise exception 'bookkeeping document link identity and history are immutable';
  end if;
  return new;
end;
$$;

create trigger bookkeeping_document_links_protect_identity
before update on public.bookkeeping_document_links
for each row execute function public.protect_bookkeeping_document_link_identity();
create trigger bookkeeping_document_links_reject_delete
before delete on public.bookkeeping_document_links
for each row execute function public.reject_canonical_bookkeeping_mutation();

create or replace function public.assert_bookkeeping_decision_reconciles(decision_uuid uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  selected_decision public.bookkeeping_decisions%rowtype;
  record_amount bigint;
  allocation_total numeric;
  business_count integer;
  personal_count integer;
  excluded_count integer;
  allocation_count integer;
  wrong_sign_count integer;
begin
  select * into selected_decision
  from public.bookkeeping_decisions
  where id = decision_uuid;
  if not found then return; end if;

  select coalesce(transactions.amount_cents, records.amount_cents)
  into record_amount
  from public.bookkeeping_records as records
  left join public.bookkeeping_financial_sources as sources
    on sources.bookkeeping_record_id = records.id
   and sources.business_id = records.business_id
   and sources.revoked_at is null
  left join public.financial_transactions as transactions
    on transactions.id = sources.financial_transaction_id
   and transactions.business_id = sources.business_id
  where records.id = selected_decision.bookkeeping_record_id
    and records.business_id = selected_decision.business_id;

  select
    coalesce(sum(amount_cents), 0),
    count(*),
    count(*) filter (where allocation_kind = 'business'),
    count(*) filter (where allocation_kind = 'personal'),
    count(*) filter (where allocation_kind = 'excluded'),
    count(*) filter (
      where record_amount is not null
        and sign(amount_cents::numeric) <> sign(record_amount::numeric)
    )
  into allocation_total, allocation_count, business_count, personal_count,
       excluded_count, wrong_sign_count
  from public.bookkeeping_allocations
  where bookkeeping_decision_id = selected_decision.id;

  if selected_decision.treatment = 'unresolved' then
    if allocation_count <> 0 then
      raise exception 'unresolved decisions cannot have allocations';
    end if;
    return;
  end if;

  if record_amount is null then
    raise exception 'resolved decisions require a known record amount';
  end if;
  if allocation_total <> record_amount then
    raise exception 'bookkeeping allocations must reconcile to record amount';
  end if;
  if wrong_sign_count <> 0 then
    raise exception 'bookkeeping allocations must use the record amount sign';
  end if;
  if selected_decision.treatment = 'business'
    and (business_count <> allocation_count or allocation_count = 0) then
    raise exception 'business treatment requires business allocations';
  elsif selected_decision.treatment = 'personal'
    and (personal_count <> allocation_count or allocation_count = 0) then
    raise exception 'personal treatment requires personal allocations';
  elsif selected_decision.treatment = 'excluded'
    and (excluded_count <> allocation_count or allocation_count = 0) then
    raise exception 'excluded treatment requires excluded allocations';
  elsif selected_decision.treatment = 'mixed_use'
    and (business_count = 0 or (personal_count + excluded_count) = 0) then
    raise exception 'mixed-use treatment requires business and non-business allocations';
  end if;
end;
$$;

create or replace function public.check_inserted_bookkeeping_decision()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform public.assert_bookkeeping_decision_reconciles(new.id);
  return new;
end;
$$;

create or replace function public.check_inserted_bookkeeping_allocation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform public.assert_bookkeeping_decision_reconciles(new.bookkeeping_decision_id);
  return new;
end;
$$;

create constraint trigger bookkeeping_decisions_reconcile
after insert on public.bookkeeping_decisions
deferrable initially deferred
for each row execute function public.check_inserted_bookkeeping_decision();
create constraint trigger bookkeeping_allocations_reconcile
after insert on public.bookkeeping_allocations
deferrable initially deferred
for each row execute function public.check_inserted_bookkeeping_allocation();

create or replace function public.ensure_bookkeeping_record(
  p_business_id uuid,
  p_source_kind text,
  p_financial_transaction_id uuid,
  p_provenance text,
  p_ingestion_key text,
  p_amount_cents bigint,
  p_currency text,
  p_occurred_on date
)
returns public.bookkeeping_records
language plpgsql
set search_path = ''
as $$
declare
  selected_record public.bookkeeping_records%rowtype;
begin
  if p_source_kind = 'financial_transaction'
    and p_financial_transaction_id is null then
    raise exception 'financial-origin bookkeeping records require source evidence';
  end if;

  insert into public.bookkeeping_records (
    business_id, source_kind, ingestion_key,
    amount_cents, currency, occurred_on
  ) values (
    p_business_id, p_source_kind, p_ingestion_key,
    p_amount_cents, p_currency, p_occurred_on
  )
  on conflict (business_id, source_kind, ingestion_key) do nothing
  returning * into selected_record;

  if selected_record.id is null then
    select * into selected_record
    from public.bookkeeping_records
    where business_id = p_business_id
      and source_kind = p_source_kind
      and ingestion_key = p_ingestion_key;
  end if;

  if selected_record.amount_cents is distinct from p_amount_cents
    or selected_record.currency is distinct from p_currency
    or selected_record.occurred_on is distinct from p_occurred_on
  then
    raise exception 'idempotency key is already associated with different record facts';
  end if;

  if p_source_kind = 'financial_transaction' then
    insert into public.bookkeeping_financial_sources (
      business_id, bookkeeping_record_id, financial_transaction_id,
      provenance, actor_user_id
    ) values (
      p_business_id, selected_record.id, p_financial_transaction_id,
      p_provenance,
      case when p_provenance = 'user' then (select auth.uid()) else null end
    )
    on conflict (bookkeeping_record_id) where revoked_at is null do nothing;

    if not exists (
      select 1 from public.bookkeeping_financial_sources
      where bookkeeping_record_id = selected_record.id
        and business_id = p_business_id
        and financial_transaction_id = p_financial_transaction_id
        and revoked_at is null
    ) then
      raise exception 'idempotency key is already associated with different source evidence';
    end if;
  elsif p_financial_transaction_id is not null then
    raise exception 'receipt/manual source matching uses a separate association operation';
  end if;

  return selected_record;
end;
$$;

comment on function public.ensure_bookkeeping_record(
  uuid, text, uuid, text, text, bigint, text, date
) is
  'Atomically inserts or returns a Business-scoped canonical record by idempotency key. RLS applies to the caller.';

create or replace function public.attach_bookkeeping_financial_source(
  p_business_id uuid,
  p_bookkeeping_record_id uuid,
  p_financial_transaction_id uuid,
  p_provenance text
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  source_id uuid;
begin
  insert into public.bookkeeping_financial_sources (
    business_id, bookkeeping_record_id, financial_transaction_id,
    provenance, actor_user_id
  ) values (
    p_business_id, p_bookkeeping_record_id, p_financial_transaction_id,
    p_provenance,
    case when p_provenance = 'user' then (select auth.uid()) else null end
  )
  on conflict (bookkeeping_record_id) where revoked_at is null do nothing
  returning id into source_id;

  if source_id is null then
    select id into source_id
    from public.bookkeeping_financial_sources
    where business_id = p_business_id
      and bookkeeping_record_id = p_bookkeeping_record_id
      and financial_transaction_id = p_financial_transaction_id
      and revoked_at is null;
  end if;
  if source_id is null then
    raise exception 'bookkeeping record is already associated with different source evidence';
  end if;
  return source_id;
end;
$$;

comment on function public.attach_bookkeeping_financial_source(
  uuid, uuid, uuid, text
) is
  'Idempotently associates later financial evidence with a receipt/manual canonical record without rewriting either record.';

create or replace function public.append_bookkeeping_decision(
  p_business_id uuid,
  p_bookkeeping_record_id uuid,
  p_expected_current_decision_id uuid,
  p_treatment text,
  p_review_status text,
  p_provenance text,
  p_confidence numeric,
  p_reason text,
  p_business_purpose text,
  p_allocations jsonb
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  current_decision_id uuid;
  inserted_decision_id uuid;
  allocation jsonb;
begin
  if jsonb_typeof(coalesce(p_allocations, '[]'::jsonb)) <> 'array' then
    raise exception 'bookkeeping allocations must be a JSON array';
  end if;

  select decisions.id into current_decision_id
  from public.bookkeeping_decisions as decisions
  where decisions.business_id = p_business_id
    and decisions.bookkeeping_record_id = p_bookkeeping_record_id
    and not exists (
      select 1 from public.bookkeeping_decisions as successors
      where successors.supersedes_decision_id = decisions.id
    );

  if current_decision_id is distinct from p_expected_current_decision_id then
    raise exception 'bookkeeping decision changed; reload before correcting';
  end if;

  insert into public.bookkeeping_decisions (
    business_id, bookkeeping_record_id, supersedes_decision_id, treatment,
    review_status, provenance, actor_user_id, confidence, reason,
    business_purpose
  ) values (
    p_business_id, p_bookkeeping_record_id, current_decision_id, p_treatment,
    p_review_status, p_provenance,
    case when p_provenance = 'user' then (select auth.uid()) else null end,
    p_confidence, p_reason, p_business_purpose
  )
  returning id into inserted_decision_id;

  for allocation in
    select value from jsonb_array_elements(coalesce(p_allocations, '[]'::jsonb))
  loop
    insert into public.bookkeeping_allocations (
      business_id, bookkeeping_record_id, bookkeeping_decision_id,
      allocation_kind, amount_cents, tax_category_key, memo
    ) values (
      p_business_id, p_bookkeeping_record_id, inserted_decision_id,
      allocation ->> 'kind', (allocation ->> 'amount_cents')::bigint,
      nullif(allocation ->> 'tax_category_key', ''),
      nullif(allocation ->> 'memo', '')
    );
  end loop;

  return inserted_decision_id;
end;
$$;

comment on function public.append_bookkeeping_decision(
  uuid, uuid, uuid, text, text, text, numeric, text, text, jsonb
) is
  'Atomically appends one decision and its allocations. Deferred constraints validate reconciliation before commit.';

alter table public.bookkeeping_records enable row level security;
alter table public.bookkeeping_financial_sources enable row level security;
alter table public.bookkeeping_decisions enable row level security;
alter table public.bookkeeping_allocations enable row level security;
alter table public.bookkeeping_document_links enable row level security;

create policy "bookkeeping_records_select_own_business"
  on public.bookkeeping_records for select to authenticated
  using (exists (
    select 1 from public.businesses
    where businesses.id = bookkeeping_records.business_id
      and businesses.owner_user_id = (select auth.uid())
  ));
create policy "bookkeeping_records_insert_own_business"
  on public.bookkeeping_records for insert to authenticated
  with check (exists (
    select 1 from public.businesses
    where businesses.id = bookkeeping_records.business_id
      and businesses.owner_user_id = (select auth.uid())
  ));

create policy "bookkeeping_financial_sources_select_own_business"
  on public.bookkeeping_financial_sources for select to authenticated
  using (exists (
    select 1 from public.businesses
    where businesses.id = bookkeeping_financial_sources.business_id
      and businesses.owner_user_id = (select auth.uid())
  ));
create policy "bookkeeping_financial_sources_insert_own_business"
  on public.bookkeeping_financial_sources for insert to authenticated
  with check (
    provenance = 'user'
    and actor_user_id = (select auth.uid())
    and exists (
      select 1 from public.businesses
      where businesses.id = bookkeeping_financial_sources.business_id
        and businesses.owner_user_id = (select auth.uid())
    )
  );
create policy "bookkeeping_financial_sources_update_own_business"
  on public.bookkeeping_financial_sources for update to authenticated
  using (exists (
    select 1 from public.businesses
    where businesses.id = bookkeeping_financial_sources.business_id
      and businesses.owner_user_id = (select auth.uid())
  ))
  with check (
    revoked_by_user_id = (select auth.uid())
    and exists (
      select 1 from public.businesses
      where businesses.id = bookkeeping_financial_sources.business_id
        and businesses.owner_user_id = (select auth.uid())
    )
  );

create policy "bookkeeping_decisions_select_own_business"
  on public.bookkeeping_decisions for select to authenticated
  using (exists (
    select 1 from public.businesses
    where businesses.id = bookkeeping_decisions.business_id
      and businesses.owner_user_id = (select auth.uid())
  ));
create policy "bookkeeping_decisions_insert_own_business"
  on public.bookkeeping_decisions for insert to authenticated
  with check (
    provenance = 'user'
    and actor_user_id = (select auth.uid())
    and exists (
      select 1 from public.businesses
      where businesses.id = bookkeeping_decisions.business_id
        and businesses.owner_user_id = (select auth.uid())
    )
  );

create policy "bookkeeping_allocations_select_own_business"
  on public.bookkeeping_allocations for select to authenticated
  using (exists (
    select 1 from public.businesses
    where businesses.id = bookkeeping_allocations.business_id
      and businesses.owner_user_id = (select auth.uid())
  ));
create policy "bookkeeping_allocations_insert_own_business"
  on public.bookkeeping_allocations for insert to authenticated
  with check (exists (
    select 1 from public.businesses
    where businesses.id = bookkeeping_allocations.business_id
      and businesses.owner_user_id = (select auth.uid())
  ));

create policy "bookkeeping_document_links_select_own_business"
  on public.bookkeeping_document_links for select to authenticated
  using (exists (
    select 1 from public.businesses
    where businesses.id = bookkeeping_document_links.business_id
      and businesses.owner_user_id = (select auth.uid())
  ));
create policy "bookkeeping_document_links_insert_own_business"
  on public.bookkeeping_document_links for insert to authenticated
  with check (
    provenance = 'user'
    and actor_user_id = (select auth.uid())
    and exists (
      select 1 from public.businesses
      where businesses.id = bookkeeping_document_links.business_id
        and businesses.owner_user_id = (select auth.uid())
    )
  );
create policy "bookkeeping_document_links_update_own_business"
  on public.bookkeeping_document_links for update to authenticated
  using (exists (
    select 1 from public.businesses
    where businesses.id = bookkeeping_document_links.business_id
      and businesses.owner_user_id = (select auth.uid())
  ))
  with check (
    revoked_by_user_id = (select auth.uid())
    and exists (
      select 1 from public.businesses
      where businesses.id = bookkeeping_document_links.business_id
        and businesses.owner_user_id = (select auth.uid())
    )
  );

-- Intentionally absent: UPDATE/DELETE policies for append-only records, data
-- backfills, legacy table changes, UI cutovers, and provider-specific behavior.

-- Preserve the multiplicity of indistinguishable CSV rows while keeping retries
-- idempotent, and correlate temporary legacy display rows with canonical source facts.

alter table public.transactions
  add column canonical_financial_transaction_id uuid;

alter table public.transactions
  add constraint transactions_canonical_financial_transaction_id_key
  unique (canonical_financial_transaction_id);

alter table public.transactions
  add constraint transactions_canonical_financial_transaction_id_fkey
  foreign key (canonical_financial_transaction_id)
  references public.financial_transactions(id)
  on update restrict on delete restrict;

create index transactions_user_canonical_financial_transaction_idx
  on public.transactions (user_id, canonical_financial_transaction_id);

-- Direct reads remain constrained by the existing Business-owner RLS policies.
grant select on public.bookkeeping_records,
  public.bookkeeping_financial_sources,
  public.bookkeeping_decisions,
  public.bookkeeping_document_links
to authenticated, service_role;

create or replace function public.protect_canonical_legacy_transaction()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  canonical_business_id uuid;
begin
  if tg_op = 'DELETE' and old.canonical_financial_transaction_id is not null then
    raise exception 'canonicalized compatibility transactions are immutable';
  end if;

  if tg_op = 'UPDATE' then
    if old.canonical_financial_transaction_id is not null then
      raise exception 'canonicalized compatibility transactions are immutable';
    end if;
    if new.canonical_financial_transaction_id is not null then
      if exists (select 1 from public.receipts where receipts.transaction_id = old.id) then
        raise exception 'legacy receipt relationship must be migrated before canonical correlation';
      end if;
      if (to_jsonb(new) - 'canonical_financial_transaction_id')
        is distinct from (to_jsonb(old) - 'canonical_financial_transaction_id') then
        raise exception 'canonical correlation cannot change legacy source facts';
      end if;
      select financial_transactions.business_id into canonical_business_id
      from public.financial_transactions
      where financial_transactions.id = new.canonical_financial_transaction_id;
      if canonical_business_id is null or not exists (
        select 1 from public.businesses
        where businesses.id = canonical_business_id
          and businesses.owner_user_id = new.user_id
      ) then
        raise exception 'canonical transaction belongs to another Business';
      end if;
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger protect_canonical_legacy_transaction_trigger
before update or delete on public.transactions
for each row execute function public.protect_canonical_legacy_transaction();

create or replace function public.protect_canonical_legacy_receipt_link()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.transaction_id is not null and exists (
    select 1 from public.transactions
    where transactions.id = new.transaction_id
      and transactions.canonical_financial_transaction_id is not null
  ) then
    raise exception 'canonicalized transactions require canonical document matching';
  end if;
  return new;
end;
$$;

create trigger protect_canonical_legacy_receipt_link_trigger
before insert or update of transaction_id on public.receipts
for each row execute function public.protect_canonical_legacy_receipt_link();

create or replace function public.ingest_csv_financial_activity(p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  authenticated_user_id uuid := (select auth.uid());
  selected_business_id uuid;
  selected_account public.financial_accounts%rowtype;
  selected_transaction public.financial_transactions%rowtype;
  selected_record public.bookkeeping_records%rowtype;
  selected_legacy_transaction_id uuid;
  item jsonb;
  item_keys text[];
  row_number integer;
  transaction_date date;
  amount_cents bigint;
  currency text;
  raw_description text;
  normalized_description text;
  occurrence integer;
  supplied_normalized_fingerprint text;
  supplied_source_fingerprint text;
  supplied_legacy_dedupe_hash text;
  calculated_normalized_fingerprint text;
  calculated_source_fingerprint text;
  calculated_legacy_dedupe_hash text;
  old_v1_source_fingerprint text;
  old_v1_legacy_dedupe_hash text;
  account_identity text;
  imported_count integer := 0;
  duplicate_count integer := 0;
  processed_count integer := 0;
begin
  if authenticated_user_id is null then raise exception 'authentication required'; end if;
  select businesses.id into selected_business_id from public.businesses
  where businesses.owner_user_id = authenticated_user_id;
  if selected_business_id is null then
    raise exception 'Business was not found for the authenticated user';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) < 1
    or jsonb_array_length(p_rows) > 1000 then
    raise exception 'CSV rows must be a nonempty array of at most 1000 items';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('csv-import:' || selected_business_id::text, 0)
  );

  for item in select value from jsonb_array_elements(p_rows) loop
    if jsonb_typeof(item) <> 'object' then raise exception 'each CSV row must be an object'; end if;
    select array_agg(key order by key) into item_keys from jsonb_object_keys(item) as key;
    if item_keys is distinct from array[
      'amount_cents', 'currency', 'legacy_dedupe_hash', 'normalized_description',
      'normalized_fingerprint', 'occurrence', 'raw_description', 'row_number',
      'source_fingerprint', 'transaction_date'
    ]::text[] then raise exception 'CSV row contains unsupported fields'; end if;

    begin
      row_number := (item ->> 'row_number')::integer;
      transaction_date := (item ->> 'transaction_date')::date;
      amount_cents := (item ->> 'amount_cents')::bigint;
      occurrence := (item ->> 'occurrence')::integer;
    exception when others then raise exception 'CSV row contains invalid typed values'; end;
    currency := item ->> 'currency';
    raw_description := item ->> 'raw_description';
    normalized_description := item ->> 'normalized_description';
    supplied_normalized_fingerprint := item ->> 'normalized_fingerprint';
    supplied_source_fingerprint := item ->> 'source_fingerprint';
    supplied_legacy_dedupe_hash := item ->> 'legacy_dedupe_hash';
    if row_number < 2 or occurrence < 1 or amount_cents = 0 or currency <> 'USD'
      or raw_description is null or length(raw_description) > 512
      or normalized_description is null or length(normalized_description) > 512 then
      raise exception 'CSV row failed canonical validation';
    end if;

    calculated_normalized_fingerprint := encode(extensions.digest(convert_to(
      'csv:normalized:v1' || chr(10) || transaction_date::text || chr(10)
      || amount_cents::text || chr(10) || currency || chr(10) || raw_description,
      'UTF8'), 'sha256'), 'hex');
    calculated_source_fingerprint := encode(extensions.digest(convert_to(
      'csv:occurrence:v1' || chr(10) || calculated_normalized_fingerprint
      || chr(10) || occurrence::text, 'UTF8'), 'sha256'), 'hex');
    calculated_legacy_dedupe_hash := encode(extensions.digest(convert_to(
      transaction_date::text || '|' || amount_cents::text || '|'
      || normalized_description || '|csv|' || occurrence::text, 'UTF8'), 'sha1'), 'hex');
    if supplied_normalized_fingerprint is distinct from calculated_normalized_fingerprint
      or supplied_source_fingerprint is distinct from calculated_source_fingerprint
      or supplied_legacy_dedupe_hash is distinct from calculated_legacy_dedupe_hash then
      raise exception 'CSV row identity is invalid';
    end if;
    if occurrence > 1 and not exists (
      select 1 from jsonb_array_elements(p_rows) prior
      where prior ->> 'normalized_fingerprint' = supplied_normalized_fingerprint
        and (prior ->> 'occurrence')::integer = occurrence - 1
    ) then raise exception 'CSV occurrence ordinals must be contiguous'; end if;

    account_identity := selected_business_id::text || ':manual-default:' || currency;
    selected_account := null;
    insert into public.financial_accounts (
      business_id, provider, provider_connection_id, provider_account_id,
      institution_name, display_name, account_type, currency
    ) values (selected_business_id, 'csv', null, account_identity,
      'Manual CSV import', 'Imported financial activity', 'checking', currency)
    on conflict (provider, provider_account_id) where provider is not null and provider_account_id is not null
    do nothing returning * into selected_account;
    if selected_account.id is null then
      select * into selected_account from public.financial_accounts
      where provider = 'csv' and provider_account_id = account_identity;
    end if;
    if selected_account.id is null or selected_account.business_id <> selected_business_id
      or selected_account.currency <> currency then
      raise exception 'CSV financial account identity is unavailable';
    end if;

    -- Reuse the pre-multiplicity identity for occurrence one when it already
    -- exists, preventing a deployed v1 import from being duplicated by v2.
    old_v1_source_fingerprint := encode(extensions.digest(convert_to(
      'csv:v1' || chr(10) || transaction_date::text || chr(10)
      || amount_cents::text || chr(10) || currency || chr(10) || raw_description,
      'UTF8'), 'sha256'), 'hex');
    selected_transaction := null;
    if occurrence = 1 then
      select * into selected_transaction from public.financial_transactions
      where financial_account_id = selected_account.id
        and source_fingerprint = old_v1_source_fingerprint;
    end if;
    if selected_transaction.id is null then
      insert into public.financial_transactions (
        business_id, financial_account_id, external_transaction_id, source_fingerprint,
        import_method, merchant_name, original_description, amount_cents, currency,
        transaction_date, pending, raw_payload
      ) values (selected_business_id, selected_account.id, null, supplied_source_fingerprint,
        'csv', coalesce(nullif(raw_description, ''), nullif(normalized_description, ''), 'Imported transaction'),
        coalesce(nullif(raw_description, ''), nullif(normalized_description, ''), 'Imported transaction'),
        amount_cents, currency, transaction_date, false,
        jsonb_build_object('schema_version', 2, 'source', 'csv',
          'normalized_fingerprint', supplied_normalized_fingerprint,
          'occurrence', occurrence, 'source_row_number', row_number,
          'raw_description', raw_description))
      on conflict (financial_account_id, source_fingerprint) do nothing
      returning * into selected_transaction;
      if selected_transaction.id is not null then imported_count := imported_count + 1;
      else
        duplicate_count := duplicate_count + 1;
        select * into selected_transaction from public.financial_transactions
        where financial_account_id = selected_account.id
          and source_fingerprint = supplied_source_fingerprint;
      end if;
    else duplicate_count := duplicate_count + 1; end if;
    if selected_transaction.id is null or selected_transaction.business_id <> selected_business_id
      or selected_transaction.amount_cents <> amount_cents or selected_transaction.currency <> currency
      or selected_transaction.transaction_date <> transaction_date then
      raise exception 'CSV transaction identity is associated with different source facts';
    end if;

    selected_record := public.ensure_bookkeeping_record(selected_business_id,
      'financial_transaction', selected_transaction.id, 'import',
      'financial_transaction:' || selected_transaction.id::text,
      selected_transaction.amount_cents, selected_transaction.currency,
      selected_transaction.transaction_date);
    if not exists (select 1 from public.bookkeeping_decisions
      where business_id = selected_business_id and bookkeeping_record_id = selected_record.id) then
      perform public.ensure_initial_bookkeeping_decision(selected_business_id, selected_record.id);
    end if;

    old_v1_legacy_dedupe_hash := encode(extensions.digest(convert_to(
      transaction_date::text || '|' || amount_cents::text || '|'
      || normalized_description || '|csv', 'UTF8'), 'sha1'), 'hex');
    selected_legacy_transaction_id := null;
    if occurrence = 1 then
      select id into selected_legacy_transaction_id from public.transactions
      where user_id = authenticated_user_id and dedupe_hash = old_v1_legacy_dedupe_hash;
    end if;
    if selected_legacy_transaction_id is null then
      insert into public.transactions (user_id, date, vendor, description, amount, posted_at,
        amount_cents, currency, raw_description, normalized_description, source,
        source_account_id, dedupe_hash, imported_at, canonical_financial_transaction_id)
      values (authenticated_user_id, transaction_date,
        coalesce(nullif(raw_description, ''), nullif(normalized_description, ''), 'Imported transaction'),
        coalesce(nullif(raw_description, ''), nullif(normalized_description, '')),
        amount_cents::numeric / 100, transaction_date, amount_cents, currency,
        raw_description, normalized_description, 'csv', 'csv',
        supplied_legacy_dedupe_hash, now(), selected_transaction.id)
      on conflict (user_id, dedupe_hash) do nothing returning id into selected_legacy_transaction_id;
      if selected_legacy_transaction_id is null then
        select id into selected_legacy_transaction_id from public.transactions
        where user_id = authenticated_user_id and dedupe_hash = supplied_legacy_dedupe_hash;
      end if;
    end if;
    update public.transactions set canonical_financial_transaction_id = selected_transaction.id
    where id = selected_legacy_transaction_id and canonical_financial_transaction_id is null;
    if not exists (select 1 from public.transactions where id = selected_legacy_transaction_id
      and user_id = authenticated_user_id
      and canonical_financial_transaction_id = selected_transaction.id) then
      raise exception 'legacy CSV compatibility row is unavailable';
    end if;
    processed_count := processed_count + 1;
  end loop;
  return jsonb_build_object('imported', imported_count, 'duplicates', duplicate_count,
    'processed', processed_count);
end;
$$;

revoke execute on function public.ingest_csv_financial_activity(jsonb)
  from public, anon, service_role;
grant execute on function public.ingest_csv_financial_activity(jsonb) to authenticated;

comment on column public.transactions.canonical_financial_transaction_id is
  'Temporary read-path correlation to immutable canonical CSV source evidence; linked rows are no longer mutable legacy truth.';

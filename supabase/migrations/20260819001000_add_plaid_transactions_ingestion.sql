-- Plaid Transactions provider boundary. Credentials remain server-only, while
-- immutable provider revisions feed the existing canonical bookkeeping model.

create table public.plaid_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  plaid_item_id text not null,
  access_token_ciphertext text not null,
  token_key_version text not null default 'v1',
  institution_id text,
  institution_name text,
  environment text not null,
  sync_cursor text,
  initial_update_complete boolean not null default false,
  historical_update_complete boolean not null default false,
  connection_status text not null default 'updating',
  consent_status text not null default 'active',
  provider_error_code text,
  provider_error_type text,
  provider_error_at timestamptz,
  consent_expires_at timestamptz,
  last_sync_attempted_at timestamptz,
  last_successful_sync_at timestamptz,
  sync_requested_at timestamptz,
  sync_lease_id uuid,
  sync_lease_expires_at timestamptz,
  disconnected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint plaid_items_environment_check check (environment in ('sandbox', 'development', 'production')),
  constraint plaid_items_connection_status_check check (
    connection_status in ('updating', 'connected', 'needs_attention', 'reconnect_required', 'disconnected')
  ),
  constraint plaid_items_consent_status_check check (consent_status in ('active', 'revoked', 'disconnected')),
  constraint plaid_items_lease_check check (
    (sync_lease_id is null and sync_lease_expires_at is null)
    or (sync_lease_id is not null and sync_lease_expires_at is not null)
  ),
  unique (environment, plaid_item_id),
  unique (id, business_id)
);

comment on table public.plaid_items is
  'Server-only Plaid Item credentials and sync state. Customer reads use list_plaid_connections(), which never exposes secrets or cursors.';

create index plaid_items_business_status_idx on public.plaid_items (business_id, connection_status);
alter table public.plaid_items enable row level security;
revoke all on public.plaid_items from public, anon, authenticated;
grant select, insert, update on public.plaid_items to service_role;

create table public.plaid_account_sources (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  plaid_item_record_id uuid not null,
  plaid_account_id text not null,
  financial_account_id uuid not null,
  created_at timestamptz not null default now(),
  constraint plaid_account_sources_item_fkey foreign key (plaid_item_record_id, business_id)
    references public.plaid_items(id, business_id) on delete restrict,
  constraint plaid_account_sources_account_fkey foreign key (financial_account_id, business_id)
    references public.financial_accounts(id, business_id) on delete restrict,
  unique (id, business_id),
  unique (plaid_item_record_id, plaid_account_id),
  unique (financial_account_id)
);

comment on table public.plaid_account_sources is
  'Provider identity mapping only. Canonical financial_accounts remain provider-neutral and contain no credentials.';

alter table public.plaid_account_sources enable row level security;
create policy "plaid_account_sources_select_own_business" on public.plaid_account_sources
  for select to authenticated using (exists (
    select 1 from public.businesses
    where businesses.id = plaid_account_sources.business_id
      and businesses.owner_user_id = (select auth.uid())
  ));
grant select on public.plaid_account_sources to authenticated, service_role;
grant insert on public.plaid_account_sources to service_role;

create table public.plaid_transaction_versions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  plaid_item_record_id uuid not null,
  plaid_account_source_id uuid,
  plaid_transaction_id text not null,
  pending_transaction_id text,
  supersedes_version_id uuid,
  event_type text not null,
  source_hash text not null,
  transaction_date date,
  authorized_date date,
  amount_cents bigint,
  currency text,
  merchant_name text,
  original_description text,
  pending boolean,
  payment_channel text,
  provider_evidence jsonb not null default '{}'::jsonb,
  canonical_financial_transaction_id uuid,
  excluded_before_catch_up boolean not null default false,
  created_at timestamptz not null default now(),
  constraint plaid_transaction_versions_item_fkey foreign key (plaid_item_record_id, business_id)
    references public.plaid_items(id, business_id) on delete restrict,
  constraint plaid_transaction_versions_account_fkey foreign key (plaid_account_source_id, business_id)
    references public.plaid_account_sources(id, business_id) on delete restrict,
  constraint plaid_transaction_versions_canonical_fkey foreign key (canonical_financial_transaction_id, business_id)
    references public.financial_transactions(id, business_id) on delete restrict,
  constraint plaid_transaction_versions_supersedes_fkey foreign key (supersedes_version_id, business_id)
    references public.plaid_transaction_versions(id, business_id) on delete restrict,
  constraint plaid_transaction_versions_event_check check (event_type in ('added', 'modified', 'removed')),
  constraint plaid_transaction_versions_removed_check check (
    event_type <> 'removed' or canonical_financial_transaction_id is null
  ),
  constraint plaid_transaction_versions_currency_check check (
    currency is null or currency ~ '^[A-Z]{3}$'
  ),
  unique (id, business_id),
  unique (plaid_item_record_id, plaid_transaction_id, event_type, source_hash)
);

comment on table public.plaid_transaction_versions is
  'Append-only Plaid source lifecycle. Current state is the unsuperseded leaf; provider corrections never overwrite immutable financial_transactions.';

create unique index plaid_transaction_versions_one_successor_idx
  on public.plaid_transaction_versions (supersedes_version_id) where supersedes_version_id is not null;
create index plaid_transaction_versions_current_idx
  on public.plaid_transaction_versions (business_id, plaid_item_record_id, plaid_transaction_id, created_at desc);
create index plaid_transaction_versions_canonical_idx
  on public.plaid_transaction_versions (canonical_financial_transaction_id)
  where canonical_financial_transaction_id is not null;

alter table public.plaid_transaction_versions enable row level security;
create policy "plaid_transaction_versions_select_own_business" on public.plaid_transaction_versions
  for select to authenticated using (exists (
    select 1 from public.businesses
    where businesses.id = plaid_transaction_versions.business_id
      and businesses.owner_user_id = (select auth.uid())
  ));
grant select on public.plaid_transaction_versions to authenticated, service_role;
grant insert on public.plaid_transaction_versions to service_role;

create or replace function public.reject_untrusted_plaid_source_insert()
returns trigger language plpgsql set search_path = '' as $$
begin
  if (select auth.role()) = 'authenticated' then
    raise exception 'Plaid provider source writes require trusted ingestion';
  end if;
  return new;
end;
$$;
create trigger financial_accounts_reject_untrusted_plaid_insert
before insert on public.financial_accounts for each row
when (new.provider = 'plaid') execute function public.reject_untrusted_plaid_source_insert();
create trigger financial_transactions_reject_untrusted_provider_insert
before insert on public.financial_transactions for each row
when (new.import_method = 'provider') execute function public.reject_untrusted_plaid_source_insert();

create or replace function public.reject_plaid_source_history_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'Plaid source history is append-only';
end;
$$;
create trigger plaid_account_sources_reject_mutation before update or delete on public.plaid_account_sources
  for each row execute function public.reject_plaid_source_history_mutation();
create trigger plaid_transaction_versions_reject_mutation before update or delete on public.plaid_transaction_versions
  for each row execute function public.reject_plaid_source_history_mutation();

create table public.plaid_exchange_requests (
  id uuid primary key,
  business_id uuid not null references public.businesses(id) on delete restrict,
  public_token_hash text not null,
  status text not null default 'processing',
  plaid_item_record_id uuid references public.plaid_items(id) on delete restrict,
  failure_code text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint plaid_exchange_requests_status_check check (status in ('processing', 'completed', 'failed')),
  unique (business_id, public_token_hash)
);
alter table public.plaid_exchange_requests enable row level security;
revoke all on public.plaid_exchange_requests from public, anon, authenticated;
grant select, insert, update on public.plaid_exchange_requests to service_role;

create table public.plaid_webhook_events (
  id uuid primary key default gen_random_uuid(),
  event_hash text not null unique,
  plaid_item_record_id uuid references public.plaid_items(id) on delete restrict,
  webhook_type text not null,
  webhook_code text not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);
alter table public.plaid_webhook_events enable row level security;
revoke all on public.plaid_webhook_events from public, anon, authenticated;
grant select, insert, update on public.plaid_webhook_events to service_role;

create or replace function public.list_plaid_connections()
returns table (
  id uuid, institution_name text, connection_status text, consent_status text,
  last_successful_sync_at timestamptz, last_sync_attempted_at timestamptz,
  consent_expires_at timestamptz, created_at timestamptz
)
language sql security definer stable set search_path = '' as $$
  select items.id, items.institution_name, items.connection_status, items.consent_status,
    items.last_successful_sync_at, items.last_sync_attempted_at,
    items.consent_expires_at, items.created_at
  from public.plaid_items items
  join public.businesses businesses on businesses.id = items.business_id
  where businesses.owner_user_id = (select auth.uid())
  order by items.created_at desc;
$$;
revoke execute on function public.list_plaid_connections() from public, anon, service_role;
grant execute on function public.list_plaid_connections() to authenticated;

create or replace function public.list_plaid_connection_accounts()
returns table (
  item_record_id uuid, id uuid, display_name text, mask_last_four text,
  account_type text, connection_status text
)
language sql security definer stable set search_path = '' as $$
  select sources.plaid_item_record_id, accounts.id, accounts.display_name,
    accounts.mask_last_four, accounts.account_type, accounts.connection_status
  from public.plaid_account_sources sources
  join public.financial_accounts accounts
    on accounts.id = sources.financial_account_id and accounts.business_id = sources.business_id
  join public.businesses businesses on businesses.id = sources.business_id
  where businesses.owner_user_id = (select auth.uid())
  order by accounts.created_at;
$$;
revoke execute on function public.list_plaid_connection_accounts() from public, anon, service_role;
grant execute on function public.list_plaid_connection_accounts() to authenticated;

create or replace function public.claim_plaid_item_sync(p_item_record_id uuid, p_lease_id uuid)
returns table (
  business_id uuid, plaid_item_id text, access_token_ciphertext text,
  environment text, sync_cursor text
)
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.role()) <> 'service_role' then raise exception 'trusted service required'; end if;
  return query
  update public.plaid_items items set
    sync_lease_id = p_lease_id,
    sync_lease_expires_at = now() + interval '10 minutes',
    last_sync_attempted_at = now(),
    connection_status = case when items.connection_status = 'disconnected' then 'disconnected' else 'updating' end,
    updated_at = now()
  where items.id = p_item_record_id
    and items.connection_status <> 'disconnected'
    and items.consent_status = 'active'
    and (items.sync_lease_id is null or items.sync_lease_expires_at < now())
  returning items.business_id, items.plaid_item_id, items.access_token_ciphertext,
    items.environment, items.sync_cursor;
end;
$$;
revoke execute on function public.claim_plaid_item_sync(uuid, uuid) from public, anon, authenticated;
grant execute on function public.claim_plaid_item_sync(uuid, uuid) to service_role;

create or replace function public.fail_plaid_item_sync(
  p_item_record_id uuid, p_lease_id uuid, p_error_code text, p_error_type text,
  p_reconnect_required boolean default false
)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.role()) <> 'service_role' then raise exception 'trusted service required'; end if;
  update public.plaid_items set
    sync_lease_id = null, sync_lease_expires_at = null,
    connection_status = case when p_reconnect_required then 'reconnect_required' else 'needs_attention' end,
    provider_error_code = left(p_error_code, 128), provider_error_type = left(p_error_type, 128),
    provider_error_at = now(), updated_at = now()
  where id = p_item_record_id and sync_lease_id = p_lease_id;
end;
$$;
revoke execute on function public.fail_plaid_item_sync(uuid, uuid, text, text, boolean)
  from public, anon, authenticated;
grant execute on function public.fail_plaid_item_sync(uuid, uuid, text, text, boolean) to service_role;

create or replace function public.disconnect_plaid_item_state(
  p_item_record_id uuid, p_business_id uuid
)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  provider_item_id text;
begin
  if (select auth.role()) <> 'service_role' then raise exception 'trusted service required'; end if;
  update public.plaid_items set
    connection_status = 'disconnected', consent_status = 'disconnected',
    disconnected_at = coalesce(disconnected_at, now()), sync_lease_id = null,
    sync_lease_expires_at = null, updated_at = now()
  where id = p_item_record_id and business_id = p_business_id
  returning plaid_item_id into provider_item_id;
  if provider_item_id is null then return false; end if;
  update public.financial_accounts set connection_status = 'disconnected'
  where business_id = p_business_id and provider = 'plaid'
    and provider_connection_id = provider_item_id;
  return true;
end;
$$;
revoke execute on function public.disconnect_plaid_item_state(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.disconnect_plaid_item_state(uuid, uuid) to service_role;

create or replace function public.apply_plaid_transaction_sync(
  p_item_record_id uuid, p_lease_id uuid, p_expected_cursor text,
  p_next_cursor text, p_accounts jsonb, p_events jsonb
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  selected_item public.plaid_items%rowtype;
  selected_business public.businesses%rowtype;
  account jsonb;
  event jsonb;
  selected_account public.financial_accounts%rowtype;
  account_source public.plaid_account_sources%rowtype;
  prior_version public.plaid_transaction_versions%rowtype;
  selected_transaction public.financial_transactions%rowtype;
  selected_record public.bookkeeping_records%rowtype;
  inserted_version_id uuid;
  canonical_transaction_id uuid;
  processed_count integer := 0;
  canonical_count integer := 0;
  skipped_count integer := 0;
  missing_account_count integer := 0;
begin
  if (select auth.role()) <> 'service_role' then raise exception 'trusted service required'; end if;
  if jsonb_typeof(p_accounts) <> 'array' or jsonb_typeof(p_events) <> 'array' then
    raise exception 'Plaid sync payload must contain arrays';
  end if;

  select * into selected_item from public.plaid_items where id = p_item_record_id for update;
  if not found or selected_item.sync_lease_id is distinct from p_lease_id
    or selected_item.sync_cursor is distinct from p_expected_cursor
    or selected_item.connection_status = 'disconnected'
    or selected_item.consent_status <> 'active' then
    raise exception 'Plaid sync lease or cursor is stale';
  end if;
  select * into selected_business from public.businesses where id = selected_item.business_id;

  update public.financial_accounts accounts set connection_status = 'reconnect_required'
  where accounts.business_id = selected_item.business_id
    and accounts.id in (
      select sources.financial_account_id from public.plaid_account_sources sources
      where sources.plaid_item_record_id = selected_item.id
        and not exists (
          select 1 from jsonb_array_elements(p_accounts) incoming
          where incoming->>'account_id' = sources.plaid_account_id
        )
    );
  get diagnostics missing_account_count = row_count;

  for account in select value from jsonb_array_elements(p_accounts) loop
    insert into public.financial_accounts (
      business_id, provider, provider_connection_id, provider_account_id,
      institution_name, display_name, account_type, account_subtype,
      mask_last_four, currency, connection_status, last_synced_at
    ) values (
      selected_item.business_id, 'plaid', selected_item.plaid_item_id, account->>'account_id',
      coalesce(selected_item.institution_name, 'Connected institution'), account->>'display_name',
      account->>'account_type', account->>'account_subtype', nullif(account->>'mask', ''),
      account->>'currency', 'active', now()
    )
    on conflict (provider, provider_account_id) where provider is not null and provider_account_id is not null
    do update set institution_name = excluded.institution_name, display_name = excluded.display_name,
      account_subtype = excluded.account_subtype, mask_last_four = excluded.mask_last_four,
      connection_status = 'active', last_synced_at = now(), archived_at = null
    returning * into selected_account;
    if selected_account.business_id <> selected_item.business_id
      or selected_account.provider_connection_id <> selected_item.plaid_item_id
      or selected_account.account_type <> account->>'account_type'
      or selected_account.currency <> account->>'currency' then
      raise exception 'Plaid account identity conflicts with canonical account';
    end if;
    insert into public.plaid_account_sources (
      business_id, plaid_item_record_id, plaid_account_id, financial_account_id
    ) values (
      selected_item.business_id, selected_item.id, account->>'account_id', selected_account.id
    ) on conflict (plaid_item_record_id, plaid_account_id) do nothing;
  end loop;

  for event in select value from jsonb_array_elements(p_events) loop
    if exists (
      select 1 from public.plaid_transaction_versions versions
      where versions.plaid_item_record_id = selected_item.id
        and versions.plaid_transaction_id = event->>'transaction_id'
        and versions.event_type = event->>'event_type'
        and versions.source_hash = event->>'source_hash'
    ) then
      skipped_count := skipped_count + 1;
      continue;
    end if;

    select versions.* into prior_version
    from public.plaid_transaction_versions versions
    where versions.plaid_item_record_id = selected_item.id
      and versions.plaid_transaction_id = event->>'transaction_id'
      and not exists (
        select 1 from public.plaid_transaction_versions successors
        where successors.supersedes_version_id = versions.id
      )
    order by versions.created_at desc limit 1;

    canonical_transaction_id := null;
    account_source := null;
    if event->>'event_type' <> 'removed' then
      select sources.* into account_source from public.plaid_account_sources sources
      where sources.plaid_item_record_id = selected_item.id
        and sources.plaid_account_id = event->>'account_id';
      if account_source.id is null then raise exception 'Plaid transaction references an unavailable account'; end if;
    end if;

    if event->>'event_type' <> 'removed'
      and not coalesce((event->>'pending')::boolean, false)
      and (selected_business.catch_up_start_date is null
        or (event->>'transaction_date')::date >= selected_business.catch_up_start_date) then
      insert into public.financial_transactions (
        business_id, financial_account_id, external_transaction_id, source_fingerprint,
        import_method, merchant_name, original_description, amount_cents, currency,
        transaction_date, authorized_at, pending, raw_payload
      ) values (
        selected_item.business_id, account_source.financial_account_id,
        (event->>'transaction_id') || ':' || left(event->>'source_hash', 24),
        event->>'source_hash', 'provider', nullif(event->>'merchant_name', ''),
        event->>'original_description', (event->>'amount_cents')::bigint,
        event->>'currency', (event->>'transaction_date')::date,
        case when nullif(event->>'authorized_date', '') is null then null
          else ((event->>'authorized_date')::date)::timestamp at time zone 'UTC' end,
        false,
        jsonb_build_object(
          'schema_version', 1, 'provider', 'plaid',
          'plaid_transaction_id', event->>'transaction_id',
          'pending_transaction_id', nullif(event->>'pending_transaction_id', ''),
          'payment_channel', nullif(event->>'payment_channel', ''),
          'provider_evidence', coalesce(event->'provider_evidence', '{}'::jsonb)
        )
      ) on conflict (financial_account_id, external_transaction_id)
        where external_transaction_id is not null do nothing
      returning * into selected_transaction;
      if selected_transaction.id is null then
        select * into selected_transaction from public.financial_transactions
        where financial_account_id = account_source.financial_account_id
          and external_transaction_id = (event->>'transaction_id') || ':' || left(event->>'source_hash', 24);
      end if;
      canonical_transaction_id := selected_transaction.id;
      selected_record := public.ensure_bookkeeping_record(
        selected_item.business_id, 'financial_transaction', selected_transaction.id,
        'import', 'plaid:' || selected_item.id::text || ':' || (event->>'transaction_id') || ':' || left(event->>'source_hash', 24),
        selected_transaction.amount_cents, selected_transaction.currency, selected_transaction.transaction_date
      );
      if not exists (select 1 from public.bookkeeping_decisions where bookkeeping_record_id = selected_record.id) then
        insert into public.bookkeeping_decisions (
          business_id, bookkeeping_record_id, supersedes_decision_id,
          bookkeeping_nature, treatment, review_status, provenance,
          actor_user_id, confidence, reason, business_purpose
        ) values (
          selected_item.business_id, selected_record.id, null,
          null, 'unresolved', 'needs_review', 'system',
          null, null, 'Awaiting bookkeeping review.', null
        ) on conflict (bookkeeping_record_id) where supersedes_decision_id is null do nothing;
      end if;
      canonical_count := canonical_count + 1;
    end if;

    insert into public.plaid_transaction_versions (
      business_id, plaid_item_record_id, plaid_account_source_id,
      plaid_transaction_id, pending_transaction_id, supersedes_version_id,
      event_type, source_hash, transaction_date, authorized_date, amount_cents,
      currency, merchant_name, original_description, pending, payment_channel,
      provider_evidence, canonical_financial_transaction_id, excluded_before_catch_up
    ) values (
      selected_item.business_id, selected_item.id, account_source.id,
      event->>'transaction_id', nullif(event->>'pending_transaction_id', ''), prior_version.id,
      event->>'event_type', event->>'source_hash',
      case when nullif(event->>'transaction_date', '') is null then null else (event->>'transaction_date')::date end,
      case when nullif(event->>'authorized_date', '') is null then null else (event->>'authorized_date')::date end,
      case when nullif(event->>'amount_cents', '') is null then null else (event->>'amount_cents')::bigint end,
      nullif(event->>'currency', ''), nullif(event->>'merchant_name', ''),
      nullif(event->>'original_description', ''),
      case when event->>'pending' is null then null else (event->>'pending')::boolean end,
      nullif(event->>'payment_channel', ''), coalesce(event->'provider_evidence', '{}'::jsonb),
      canonical_transaction_id,
      event->>'event_type' <> 'removed' and selected_business.catch_up_start_date is not null
        and (event->>'transaction_date')::date < selected_business.catch_up_start_date
    ) returning id into inserted_version_id;
    processed_count := processed_count + 1;
  end loop;

  update public.plaid_items set
    sync_cursor = p_next_cursor, sync_lease_id = null, sync_lease_expires_at = null,
    connection_status = case
      when missing_account_count > 0 then 'needs_attention'
      when selected_item.historical_update_complete then 'connected'
      else 'updating' end,
    provider_error_code = null, provider_error_type = null,
    provider_error_at = null, last_successful_sync_at = now(), sync_requested_at = null,
    updated_at = now()
  where id = selected_item.id;

  return jsonb_build_object('processed', processed_count, 'canonicalized', canonical_count,
    'duplicates', skipped_count, 'cursor', p_next_cursor,
    'status', case
      when missing_account_count > 0 then 'needs_attention'
      when selected_item.historical_update_complete then 'connected'
      else 'updating' end);
end;
$$;
revoke execute on function public.apply_plaid_transaction_sync(uuid, uuid, text, text, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.apply_plaid_transaction_sync(uuid, uuid, text, text, jsonb, jsonb)
  to service_role;

create trigger plaid_items_set_updated_at before update on public.plaid_items
  for each row execute function public.set_updated_at();

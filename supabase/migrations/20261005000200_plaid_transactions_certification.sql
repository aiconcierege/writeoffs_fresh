-- Transactions certification: current-leaf replay semantics and deletion-safe sync.
create or replace function public.plaid_sync_business_allowed(p_business_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare m public.business_memberships%rowtype;
begin
  if (select auth.role()) <> 'service_role' then raise exception 'trusted service required'; end if;
  -- Serialize the final commit with membership changes/deletion scheduling.
  select * into m from public.business_memberships where business_id=p_business_id for share;
  if not found then return false; end if;
  return coalesce(((m.lifecycle in ('active','canceling') and (m.access_through is null or m.access_through>now()))
    or (m.lifecycle='payment_issue' and m.grace_through>now()))
    and not exists(select 1 from public.account_deletion_requests
      where business_id=p_business_id and status in ('scheduled','executing','retryable')), false);
end $$;
revoke execute on function public.plaid_sync_business_allowed(uuid) from public,anon,authenticated;
grant execute on function public.plaid_sync_business_allowed(uuid) to service_role;

-- Item row locking + expected cursor + one-successor uniqueness retain replay safety.
alter table public.plaid_transaction_versions drop constraint
  plaid_transaction_versions_plaid_item_record_id_plaid_trans_key;
create index plaid_transaction_versions_item_transaction_idx
  on public.plaid_transaction_versions(plaid_item_record_id,plaid_transaction_id);

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
    and public.plaid_sync_business_allowed(items.business_id)
    and (items.sync_lease_id is null or items.sync_lease_expires_at < now())
  returning items.business_id, items.plaid_item_id, items.access_token_ciphertext,
    items.environment, items.sync_cursor;
end;
$$;
revoke execute on function public.claim_plaid_item_sync(uuid, uuid) from public, anon, authenticated;
grant execute on function public.claim_plaid_item_sync(uuid, uuid) to service_role;

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
  if not public.plaid_sync_business_allowed(selected_item.business_id) then
    raise exception 'Plaid sync business is inactive';
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
    select versions.* into prior_version
    from public.plaid_transaction_versions versions
    where versions.plaid_item_record_id = selected_item.id
      and versions.plaid_transaction_id = event->>'transaction_id'
      and not exists (
        select 1 from public.plaid_transaction_versions successors
        where successors.supersedes_version_id = versions.id
      )
    order by versions.created_at desc limit 1;

    -- A replay equals the current leaf, not any value seen in history.
    -- A -> B -> A -> B must preserve all four revisions.
    if prior_version.event_type = event->>'event_type'
      and prior_version.source_hash = event->>'source_hash' then
      skipped_count := skipped_count + 1;
      continue;
    end if;

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

-- Customer-authored financial activity that connected accounts cannot observe.
-- Original source observations and every correction remain immutable; only the
-- current event projects into customer-facing bookkeeping.

create table public.manual_financial_sources (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  direction text not null,
  original_amount_cents bigint not null,
  original_currency text not null default 'USD',
  original_occurred_on date not null,
  original_payment_method text not null,
  original_counterparty_name text,
  original_description text,
  original_job_label text,
  original_location text,
  original_note text,
  request_key text not null,
  provenance text not null default 'user',
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint manual_financial_sources_id_business_unique unique (id, business_id),
  constraint manual_financial_sources_request_unique unique (business_id, request_key),
  constraint manual_financial_sources_direction_check check (direction in ('received', 'spent')),
  constraint manual_financial_sources_amount_check check (
    (direction = 'received' and original_amount_cents > 0)
    or (direction = 'spent' and original_amount_cents < 0)
  ),
  constraint manual_financial_sources_currency_check check (original_currency ~ '^[A-Z]{3}$'),
  constraint manual_financial_sources_method_check check (
    (direction = 'received' and original_payment_method in ('cash', 'check', 'zelle_ach', 'card', 'other'))
    or (direction = 'spent' and original_payment_method in ('cash', 'personal_card_account', 'check', 'other'))
  ),
  constraint manual_financial_sources_provenance_check check (provenance = 'user'),
  constraint manual_financial_sources_identity_check check (
    length(btrim(request_key)) between 1 and 120
    and (original_counterparty_name is null or length(original_counterparty_name) <= 200)
    and (original_description is null or length(original_description) <= 500)
    and (original_job_label is null or length(original_job_label) <= 200)
    and (original_location is null or length(original_location) <= 300)
    and (original_note is null or length(original_note) <= 1000)
  )
);

create table public.manual_financial_source_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  manual_financial_source_id uuid not null,
  supersedes_event_id uuid,
  event_type text not null,
  bookkeeping_record_id uuid,
  amount_cents bigint not null,
  currency text not null,
  occurred_on date not null,
  payment_method text not null,
  counterparty_name text,
  description text,
  job_label text,
  location text,
  note text,
  reason text,
  request_key text not null,
  provenance text not null default 'user',
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint manual_financial_source_events_id_scope_unique
    unique (id, business_id, manual_financial_source_id),
  constraint manual_financial_source_events_source_fkey
    foreign key (manual_financial_source_id, business_id)
    references public.manual_financial_sources(id, business_id) on delete restrict,
  constraint manual_financial_source_events_supersedes_fkey
    foreign key (supersedes_event_id, business_id, manual_financial_source_id)
    references public.manual_financial_source_events(id, business_id, manual_financial_source_id)
    on delete restrict,
  constraint manual_financial_source_events_record_fkey
    foreign key (bookkeeping_record_id, business_id)
    references public.bookkeeping_records(id, business_id) on delete restrict,
  constraint manual_financial_source_events_type_check check (event_type in ('recorded', 'corrected', 'removed')),
  constraint manual_financial_source_events_record_check check (
    (event_type in ('recorded', 'corrected') and bookkeeping_record_id is not null)
    or (event_type = 'removed' and bookkeeping_record_id is null)
  ),
  constraint manual_financial_source_events_amount_check check (amount_cents <> 0),
  constraint manual_financial_source_events_currency_check check (currency ~ '^[A-Z]{3}$'),
  constraint manual_financial_source_events_method_check check (
    payment_method in ('cash', 'check', 'zelle_ach', 'card', 'personal_card_account', 'other')
  ),
  constraint manual_financial_source_events_provenance_check check (provenance = 'user'),
  constraint manual_financial_source_events_identity_check check (
    length(btrim(request_key)) between 1 and 160
    and (counterparty_name is null or length(counterparty_name) <= 200)
    and (description is null or length(description) <= 500)
    and (job_label is null or length(job_label) <= 200)
    and (location is null or length(location) <= 300)
    and (note is null or length(note) <= 1000)
    and (reason is null or length(reason) <= 500)
  )
);

create unique index manual_financial_source_events_initial_idx
  on public.manual_financial_source_events (manual_financial_source_id)
  where supersedes_event_id is null;
create unique index manual_financial_source_events_successor_idx
  on public.manual_financial_source_events (supersedes_event_id)
  where supersedes_event_id is not null;
create unique index manual_financial_source_events_request_idx
  on public.manual_financial_source_events (business_id, request_key);
create unique index manual_financial_source_events_record_idx
  on public.manual_financial_source_events (bookkeeping_record_id)
  where bookkeeping_record_id is not null;

create view public.current_manual_financial_source_events
with (security_invoker = true) as
select event.*, source.direction
from public.manual_financial_source_events event
join public.manual_financial_sources source
  on source.id = event.manual_financial_source_id and source.business_id = event.business_id
where not exists (
  select 1 from public.manual_financial_source_events successor
  where successor.supersedes_event_id = event.id
);

create view public.current_manual_financial_activity
with (security_invoker = true) as
select * from public.current_manual_financial_source_events where event_type <> 'removed';

create or replace function public.reject_manual_financial_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin raise exception 'manual financial source history is append-only'; end;
$$;
create trigger manual_financial_sources_no_mutation before update or delete
  on public.manual_financial_sources for each row execute function public.reject_manual_financial_mutation();
create trigger manual_financial_source_events_no_mutation before update or delete
  on public.manual_financial_source_events for each row execute function public.reject_manual_financial_mutation();

create or replace function public.assert_manual_financial_owner(p_business_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare selected_actor uuid := (select auth.uid());
begin
  if selected_actor is null or not exists (
    select 1 from public.businesses where id = p_business_id and owner_user_id = selected_actor
  ) then raise exception 'manual financial Business ownership mismatch'; end if;
  return selected_actor;
end;
$$;

create or replace function public.create_manual_financial_record(
  p_business_id uuid, p_source_id uuid, p_event_id uuid, p_direction text,
  p_amount_cents bigint, p_currency text, p_occurred_on date,
  p_description text, p_actor_user_id uuid
) returns uuid language plpgsql security definer set search_path = '' as $$
declare selected_record public.bookkeeping_records%rowtype; initial_decision_id uuid;
begin
  insert into public.bookkeeping_records (
    business_id, source_kind, ingestion_key, amount_cents, currency, occurred_on
  ) values (
    p_business_id, 'manual', concat('manual-financial:', p_source_id, ':event:', p_event_id),
    p_amount_cents, p_currency, p_occurred_on
  ) returning * into selected_record;
  insert into public.bookkeeping_decisions (
    business_id, bookkeeping_record_id, bookkeeping_nature, treatment, review_status,
    provenance, actor_user_id, reason, business_purpose
  ) values (
    p_business_id, selected_record.id,
    case when p_direction = 'received' then 'business_income' else 'expense' end,
    'business', 'resolved', 'user', p_actor_user_id,
    case when p_direction = 'received'
      then 'Customer recorded business money received.'
      else 'Customer recorded business spending.' end,
    nullif(btrim(coalesce(p_description, '')), '')
  ) returning id into initial_decision_id;
  insert into public.bookkeeping_allocations (
    business_id, bookkeeping_record_id, bookkeeping_decision_id, allocation_kind, amount_cents
  ) values (p_business_id, selected_record.id, initial_decision_id, 'business', p_amount_cents);
  perform public.request_bookkeeping_processing(
    p_business_id, selected_record.id, 'deterministic_evaluation',
    concat('bookkeeping-evaluator:v1:record:', selected_record.id, ':manual-event:', p_event_id)
  );
  return selected_record.id;
end;
$$;

create or replace function public.record_manual_financial_activity(
  p_direction text, p_amount_cents bigint, p_currency text, p_occurred_on date,
  p_payment_method text, p_counterparty_name text, p_description text,
  p_job_label text, p_location text, p_note text, p_request_key text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare selected_business_id uuid; selected_actor uuid := (select auth.uid());
  selected_source public.manual_financial_sources%rowtype; selected_event_id uuid := gen_random_uuid();
  selected_record_id uuid; signed_amount bigint;
begin
  select id into selected_business_id from public.businesses where owner_user_id = selected_actor;
  if selected_business_id is null then raise exception 'manual financial Business is unavailable'; end if;
  if p_direction not in ('received', 'spent') or p_amount_cents <= 0
    or p_currency !~ '^[A-Z]{3}$' or p_occurred_on is null or p_occurred_on > current_date
    or length(btrim(coalesce(p_request_key, ''))) not between 1 and 120
    or (p_direction = 'received' and p_payment_method not in ('cash','check','zelle_ach','card','other'))
    or (p_direction = 'spent' and p_payment_method not in ('cash','personal_card_account','check','other'))
  then raise exception 'manual financial facts are invalid'; end if;
  signed_amount := case when p_direction = 'received' then p_amount_cents else -p_amount_cents end;
  perform pg_advisory_xact_lock(hashtextextended(concat(selected_business_id, ':manual:', btrim(p_request_key)), 71));
  select * into selected_source from public.manual_financial_sources
    where business_id = selected_business_id and request_key = btrim(p_request_key);
  if found then
    if selected_source.direction <> p_direction or selected_source.original_amount_cents <> signed_amount
      or selected_source.original_currency <> upper(p_currency)
      or selected_source.original_occurred_on <> p_occurred_on
      or selected_source.original_payment_method <> p_payment_method
      or selected_source.original_counterparty_name is distinct from nullif(btrim(p_counterparty_name), '')
      or selected_source.original_description is distinct from nullif(btrim(p_description), '')
      or selected_source.original_job_label is distinct from nullif(btrim(p_job_label), '')
      or selected_source.original_location is distinct from nullif(btrim(p_location), '')
      or selected_source.original_note is distinct from nullif(btrim(p_note), '')
    then raise exception 'manual financial idempotency key has different facts'; end if;
    return selected_source.id;
  end if;
  insert into public.manual_financial_sources (
    business_id, direction, original_amount_cents, original_currency, original_occurred_on,
    original_payment_method, original_counterparty_name, original_description,
    original_job_label, original_location, original_note, request_key, actor_user_id
  ) values (
    selected_business_id, p_direction, signed_amount, upper(p_currency), p_occurred_on,
    p_payment_method, nullif(btrim(p_counterparty_name), ''), nullif(btrim(p_description), ''),
    nullif(btrim(p_job_label), ''), nullif(btrim(p_location), ''), nullif(btrim(p_note), ''),
    btrim(p_request_key), selected_actor
  ) returning * into selected_source;
  selected_record_id := public.create_manual_financial_record(
    selected_business_id, selected_source.id, selected_event_id, p_direction, signed_amount,
    upper(p_currency), p_occurred_on, p_description, selected_actor
  );
  insert into public.manual_financial_source_events (
    id, business_id, manual_financial_source_id, event_type, bookkeeping_record_id,
    amount_cents, currency, occurred_on, payment_method, counterparty_name, description,
    job_label, location, note, request_key, actor_user_id
  ) values (
    selected_event_id, selected_business_id, selected_source.id, 'recorded', selected_record_id,
    signed_amount, upper(p_currency), p_occurred_on, p_payment_method,
    nullif(btrim(p_counterparty_name), ''), nullif(btrim(p_description), ''),
    nullif(btrim(p_job_label), ''), nullif(btrim(p_location), ''), nullif(btrim(p_note), ''),
    concat(btrim(p_request_key), ':recorded'), selected_actor
  );
  return selected_source.id;
end;
$$;

create or replace function public.correct_manual_financial_activity(
  p_manual_financial_source_id uuid, p_expected_current_event_id uuid,
  p_amount_cents bigint, p_currency text, p_occurred_on date, p_payment_method text,
  p_counterparty_name text, p_description text, p_job_label text, p_location text,
  p_note text, p_request_key text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare selected_actor uuid := (select auth.uid()); selected_source public.manual_financial_sources%rowtype;
  current_event public.manual_financial_source_events%rowtype; selected_event_id uuid := gen_random_uuid();
  selected_record_id uuid; signed_amount bigint;
begin
  select * into selected_source from public.manual_financial_sources
    where id = p_manual_financial_source_id for update;
  if not found then raise exception 'manual financial activity is unavailable'; end if;
  perform public.assert_manual_financial_owner(selected_source.business_id);
  if exists (select 1 from public.manual_financial_source_events
    where business_id = selected_source.business_id and request_key = btrim(p_request_key))
  then return p_manual_financial_source_id; end if;
  select event.* into current_event from public.manual_financial_source_events event
    where event.manual_financial_source_id = selected_source.id
      and not exists (select 1 from public.manual_financial_source_events successor where successor.supersedes_event_id = event.id)
    for update;
  if current_event.id is distinct from p_expected_current_event_id or current_event.event_type = 'removed'
  then raise exception 'manual financial activity changed; reload before correcting'; end if;
  if exists (select 1 from public.current_bookkeeping_compound_components component
    where component.business_id = selected_source.business_id
      and component.bookkeeping_record_id = current_event.bookkeeping_record_id)
  then raise exception 'matched activity must be corrected through guarded reconciliation history'; end if;
  if p_amount_cents <= 0 or p_currency !~ '^[A-Z]{3}$' or p_occurred_on is null or p_occurred_on > current_date
    or length(btrim(coalesce(p_request_key, ''))) not between 1 and 120
    or (selected_source.direction = 'received' and p_payment_method not in ('cash','check','zelle_ach','card','other'))
    or (selected_source.direction = 'spent' and p_payment_method not in ('cash','personal_card_account','check','other'))
  then raise exception 'manual financial facts are invalid'; end if;
  signed_amount := case when selected_source.direction = 'received' then p_amount_cents else -p_amount_cents end;
  selected_record_id := public.create_manual_financial_record(
    selected_source.business_id, selected_source.id, selected_event_id, selected_source.direction,
    signed_amount, upper(p_currency), p_occurred_on, p_description, selected_actor
  );
  insert into public.manual_financial_source_events (
    id, business_id, manual_financial_source_id, supersedes_event_id, event_type,
    bookkeeping_record_id, amount_cents, currency, occurred_on, payment_method,
    counterparty_name, description, job_label, location, note, reason, request_key, actor_user_id
  ) values (
    selected_event_id, selected_source.business_id, selected_source.id, current_event.id, 'corrected',
    selected_record_id, signed_amount, upper(p_currency), p_occurred_on, p_payment_method,
    nullif(btrim(p_counterparty_name), ''), nullif(btrim(p_description), ''),
    nullif(btrim(p_job_label), ''), nullif(btrim(p_location), ''), nullif(btrim(p_note), ''),
    'Customer corrected the recorded activity.', btrim(p_request_key), selected_actor
  );
  perform public.request_bookkeeping_processing(
    selected_source.business_id, current_event.bookkeeping_record_id, 'deterministic_evaluation',
    concat('bookkeeping-evaluator:v1:record:', current_event.bookkeeping_record_id, ':manual-superseded:', selected_event_id)
  );
  return selected_source.id;
end;
$$;

create or replace function public.remove_manual_financial_activity(
  p_manual_financial_source_id uuid, p_expected_current_event_id uuid,
  p_request_key text, p_reason text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare selected_actor uuid := (select auth.uid()); selected_source public.manual_financial_sources%rowtype;
  current_event public.manual_financial_source_events%rowtype; selected_event_id uuid := gen_random_uuid();
begin
  select * into selected_source from public.manual_financial_sources where id = p_manual_financial_source_id for update;
  if not found then raise exception 'manual financial activity is unavailable'; end if;
  perform public.assert_manual_financial_owner(selected_source.business_id);
  select event.* into current_event from public.manual_financial_source_events event
    where event.manual_financial_source_id = selected_source.id
      and not exists (select 1 from public.manual_financial_source_events successor where successor.supersedes_event_id = event.id)
    for update;
  if current_event.event_type = 'removed' then
    if current_event.request_key = btrim(p_request_key) then return selected_source.id; end if;
    raise exception 'manual financial activity is already removed';
  end if;
  if current_event.id is distinct from p_expected_current_event_id
  then raise exception 'manual financial activity changed; reload before removing'; end if;
  if length(btrim(coalesce(p_request_key, ''))) not between 1 and 120
    or length(btrim(coalesce(p_reason, ''))) not between 1 and 500
  then raise exception 'manual financial removal requires a safe reason'; end if;
  if exists (select 1 from public.current_bookkeeping_compound_components component
    where component.business_id = selected_source.business_id
      and component.bookkeeping_record_id = current_event.bookkeeping_record_id)
  then raise exception 'matched activity must be corrected before it can be removed'; end if;
  insert into public.manual_financial_source_events (
    id, business_id, manual_financial_source_id, supersedes_event_id, event_type,
    amount_cents, currency, occurred_on, payment_method, counterparty_name, description,
    job_label, location, note, reason, request_key, actor_user_id
  ) values (
    selected_event_id, selected_source.business_id, selected_source.id, current_event.id, 'removed',
    current_event.amount_cents, current_event.currency, current_event.occurred_on,
    current_event.payment_method, current_event.counterparty_name, current_event.description,
    current_event.job_label, current_event.location, current_event.note,
    btrim(p_reason), btrim(p_request_key), selected_actor
  );
  perform public.request_bookkeeping_processing(
    selected_source.business_id, current_event.bookkeeping_record_id, 'deterministic_evaluation',
    concat('bookkeeping-evaluator:v1:record:', current_event.bookkeeping_record_id, ':manual-removed:', selected_event_id)
  );
  return selected_source.id;
end;
$$;

create or replace function public.match_manual_financial_activity_to_bank_transaction(
  p_manual_financial_source_id uuid, p_expected_current_event_id uuid,
  p_financial_transaction_id uuid, p_request_key text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare selected_actor uuid := (select auth.uid()); manual_event public.current_manual_financial_activity%rowtype;
  anchor_transaction public.financial_transactions%rowtype; anchor_record public.bookkeeping_records%rowtype;
  selected_reconciliation_id uuid; selected_reconciliation_event_id uuid; eligible_count integer;
begin
  select current.* into manual_event from public.current_manual_financial_activity current
  where current.manual_financial_source_id = p_manual_financial_source_id for update;
  if not found or manual_event.id is distinct from p_expected_current_event_id then
    raise exception 'manual financial activity changed; reload before matching'; end if;
  perform public.assert_manual_financial_owner(manual_event.business_id);
  if length(btrim(coalesce(p_request_key, ''))) not between 1 and 200 then
    raise exception 'manual financial match requires a safe request identity'; end if;
  perform pg_advisory_xact_lock(hashtextextended(
    concat(manual_event.business_id, ':compound-transaction:', p_financial_transaction_id), 67));
  select reconciliation.id into selected_reconciliation_id
  from public.bookkeeping_compound_reconciliations reconciliation
  where reconciliation.business_id = manual_event.business_id and reconciliation.request_key = btrim(p_request_key);
  if found then return selected_reconciliation_id; end if;
  select * into anchor_transaction from public.financial_transactions
  where id = p_financial_transaction_id and business_id = manual_event.business_id for update;
  if not found or anchor_transaction.pending
    or anchor_transaction.amount_cents is distinct from manual_event.amount_cents
    or anchor_transaction.currency is distinct from manual_event.currency
    or anchor_transaction.transaction_date is distinct from manual_event.occurred_on
  then raise exception 'bank activity is not an exact current match'; end if;
  select record.* into anchor_record from public.bookkeeping_financial_sources source
  join public.bookkeeping_records record on record.id = source.bookkeeping_record_id
    and record.business_id = source.business_id
  where source.business_id = manual_event.business_id
    and source.financial_transaction_id = anchor_transaction.id and source.revoked_at is null
  for update of record;
  if not found or anchor_record.source_kind <> 'financial_transaction'
    or anchor_record.amount_cents is distinct from anchor_transaction.amount_cents
    or anchor_record.currency is distinct from anchor_transaction.currency
  then raise exception 'bank activity canonical anchor is invalid'; end if;
  if exists (select 1 from public.current_bookkeeping_compound_reconciliations active
      where active.business_id = manual_event.business_id
        and (active.anchor_financial_transaction_id = anchor_transaction.id
          or active.anchor_bookkeeping_record_id in (anchor_record.id, manual_event.bookkeeping_record_id)))
    or exists (select 1 from public.current_bookkeeping_compound_components active
      where active.business_id = manual_event.business_id
        and active.bookkeeping_record_id in (anchor_record.id, manual_event.bookkeeping_record_id))
  then raise exception 'activity already participates in a current match'; end if;
  if not exists (select 1 from public.bookkeeping_decisions decision
      where decision.business_id = manual_event.business_id and decision.bookkeeping_record_id = anchor_record.id
        and decision.supersedes_decision_id is null and decision.provenance = 'system'
        and decision.treatment = 'unresolved' and decision.bookkeeping_nature is null)
    or exists (select 1 from public.bookkeeping_decisions decision
      where decision.business_id = manual_event.business_id and decision.bookkeeping_record_id = anchor_record.id
        and decision.supersedes_decision_id is not null)
    or exists (select 1 from public.bookkeeping_allocations allocation
      where allocation.business_id = manual_event.business_id and allocation.bookkeeping_record_id = anchor_record.id)
    or exists (select 1 from public.bookkeeping_review_events review
      where review.business_id = manual_event.business_id and review.bookkeeping_record_id = anchor_record.id)
  then raise exception 'bank activity has dependent or customer-authored state'; end if;
  if not exists (select 1 from public.bookkeeping_decisions decision
      where decision.business_id = manual_event.business_id
        and decision.bookkeeping_record_id = manual_event.bookkeeping_record_id
        and decision.provenance = 'user' and decision.treatment = 'business'
        and decision.bookkeeping_nature = case when manual_event.direction = 'received' then 'business_income' else 'expense' end
        and not exists (select 1 from public.bookkeeping_decisions successor where successor.supersedes_decision_id = decision.id))
  then raise exception 'manual activity current decision is unavailable'; end if;
  select count(*) into eligible_count from public.current_manual_financial_activity candidate
  where candidate.business_id = manual_event.business_id
    and candidate.amount_cents = anchor_transaction.amount_cents
    and candidate.currency = anchor_transaction.currency
    and candidate.occurred_on = anchor_transaction.transaction_date
    and not exists (select 1 from public.current_bookkeeping_compound_components component
      where component.business_id = candidate.business_id and component.bookkeeping_record_id = candidate.bookkeeping_record_id);
  if eligible_count <> 1 then raise exception 'manual match is ambiguous'; end if;
  select count(*) into eligible_count from public.financial_transactions transaction
  join public.bookkeeping_financial_sources source on source.financial_transaction_id = transaction.id
    and source.business_id = transaction.business_id and source.revoked_at is null
  where transaction.business_id = manual_event.business_id and not transaction.pending
    and transaction.amount_cents = manual_event.amount_cents and transaction.currency = manual_event.currency
    and transaction.transaction_date = manual_event.occurred_on
    and not exists (select 1 from public.current_bookkeeping_compound_reconciliations active
      where active.business_id = transaction.business_id and active.anchor_financial_transaction_id = transaction.id);
  if eligible_count <> 1 then raise exception 'bank match is ambiguous'; end if;
  insert into public.bookkeeping_compound_reconciliations (
    business_id, anchor_financial_transaction_id, anchor_bookkeeping_record_id,
    scenario, basis_kind, basis_reference_ids, request_key, provenance, actor_user_id
  ) values (
    manual_event.business_id, anchor_transaction.id, anchor_record.id,
    'later_bank_match', 'customer_fact', '{}', btrim(p_request_key), 'user', selected_actor
  ) returning id into selected_reconciliation_id;
  insert into public.bookkeeping_compound_reconciliation_links (
    business_id, reconciliation_id, bookkeeping_record_id, linked_amount_cents,
    relationship_role, provenance, actor_user_id
  ) values (
    manual_event.business_id, selected_reconciliation_id, manual_event.bookkeeping_record_id,
    manual_event.amount_cents, 'payment_match', 'user', selected_actor
  );
  insert into public.bookkeeping_compound_reconciliation_events (
    business_id, reconciliation_id, sequence_number, event_type, request_key,
    reason, provenance, actor_user_id
  ) values (
    manual_event.business_id, selected_reconciliation_id, 1, 'activated',
    concat(btrim(p_request_key), ':activate'), 'Customer confirmed both observations describe the same activity.',
    'user', selected_actor
  ) returning id into selected_reconciliation_event_id;
  perform public.request_bookkeeping_processing(
    manual_event.business_id, manual_event.bookkeeping_record_id, 'deterministic_evaluation',
    concat('bookkeeping-evaluator:v1:record:', manual_event.bookkeeping_record_id,
      ':compound:', selected_reconciliation_event_id)
  );
  return selected_reconciliation_id;
end;
$$;

alter table public.manual_financial_sources enable row level security;
alter table public.manual_financial_source_events enable row level security;
create policy manual_financial_sources_select_own on public.manual_financial_sources
  for select to authenticated using (exists (
    select 1 from public.businesses where businesses.id = business_id
      and businesses.owner_user_id = (select auth.uid())
  ));
create policy manual_financial_source_events_select_own on public.manual_financial_source_events
  for select to authenticated using (exists (
    select 1 from public.businesses where businesses.id = business_id
      and businesses.owner_user_id = (select auth.uid())
  ));
revoke all on public.manual_financial_sources, public.manual_financial_source_events from public, anon, authenticated;
grant select on public.manual_financial_sources, public.manual_financial_source_events,
  public.current_manual_financial_source_events, public.current_manual_financial_activity to authenticated;
grant select, insert on public.manual_financial_sources, public.manual_financial_source_events to service_role;
revoke execute on function public.assert_manual_financial_owner(uuid),
  public.create_manual_financial_record(uuid,uuid,uuid,text,bigint,text,date,text,uuid)
  from public, anon, authenticated;
grant execute on function public.record_manual_financial_activity(text,bigint,text,date,text,text,text,text,text,text,text),
  public.correct_manual_financial_activity(uuid,uuid,bigint,text,date,text,text,text,text,text,text,text),
  public.remove_manual_financial_activity(uuid,uuid,text,text),
  public.match_manual_financial_activity_to_bank_transaction(uuid,uuid,uuid,text) to authenticated;
revoke execute on function public.record_manual_financial_activity(text,bigint,text,date,text,text,text,text,text,text,text),
  public.correct_manual_financial_activity(uuid,uuid,bigint,text,date,text,text,text,text,text,text,text),
  public.remove_manual_financial_activity(uuid,uuid,text,text),
  public.match_manual_financial_activity_to_bank_transaction(uuid,uuid,uuid,text) from public, anon;
grant execute on function public.assert_manual_financial_owner(uuid),
  public.create_manual_financial_record(uuid,uuid,uuid,text,bigint,text,date,text,uuid),
  public.record_manual_financial_activity(text,bigint,text,date,text,text,text,text,text,text,text),
  public.correct_manual_financial_activity(uuid,uuid,bigint,text,date,text,text,text,text,text,text,text),
  public.remove_manual_financial_activity(uuid,uuid,text,text),
  public.match_manual_financial_activity_to_bank_transaction(uuid,uuid,uuid,text) to service_role;

comment on table public.manual_financial_sources is
  'Immutable customer-authored source observations for money outside connected accounts.';
comment on table public.manual_financial_source_events is
  'Append-only corrections/removals and their canonical bookkeeping record versions.';

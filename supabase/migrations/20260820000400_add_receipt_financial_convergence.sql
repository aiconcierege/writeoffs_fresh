-- Append-only convergence of a uniquely matching kept receipt-only record into a
-- later financial-origin record. Source records and their histories remain intact.

create table public.bookkeeping_record_convergence_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  convergence_id uuid not null,
  supersedes_event_id uuid,
  sequence_number integer not null,
  event_type text not null,
  survivor_record_id uuid not null,
  absorbed_record_id uuid not null,
  receipt_id uuid not null,
  financial_transaction_id uuid not null,
  matcher_key text not null,
  match_basis jsonb not null,
  provenance text not null,
  actor_user_id uuid references auth.users(id) on delete restrict,
  request_key text not null,
  created_at timestamptz not null default now(),
  constraint bookkeeping_record_convergence_id_scope_unique
    unique (id, business_id, convergence_id),
  constraint bookkeeping_record_convergence_survivor_fkey
    foreign key (survivor_record_id, business_id)
    references public.bookkeeping_records(id, business_id) on delete restrict,
  constraint bookkeeping_record_convergence_absorbed_fkey
    foreign key (absorbed_record_id, business_id)
    references public.bookkeeping_records(id, business_id) on delete restrict,
  constraint bookkeeping_record_convergence_receipt_fkey
    foreign key (receipt_id, business_id)
    references public.receipts(id, business_id) on delete restrict,
  constraint bookkeeping_record_convergence_transaction_fkey
    foreign key (financial_transaction_id, business_id)
    references public.financial_transactions(id, business_id) on delete restrict,
  constraint bookkeeping_record_convergence_predecessor_fkey
    foreign key (supersedes_event_id, business_id, convergence_id)
    references public.bookkeeping_record_convergence_events(id, business_id, convergence_id)
    on delete restrict,
  constraint bookkeeping_record_convergence_event_check
    check (event_type in ('converged', 'reversed')),
  constraint bookkeeping_record_convergence_records_check
    check (survivor_record_id <> absorbed_record_id),
  constraint bookkeeping_record_convergence_sequence_check check (
    (supersedes_event_id is null and sequence_number = 1 and event_type = 'converged')
    or (supersedes_event_id is not null and sequence_number > 1)
  ),
  constraint bookkeeping_record_convergence_provenance_check
    check (provenance in ('automation', 'user', 'system')),
  constraint bookkeeping_record_convergence_actor_check check (
    (provenance = 'user' and actor_user_id is not null)
    or (provenance <> 'user' and actor_user_id is null)
  ),
  constraint bookkeeping_record_convergence_identity_check check (
    length(matcher_key) between 1 and 100
    and length(request_key) between 1 and 200
    and jsonb_typeof(match_basis) = 'object'
  ),
  unique (business_id, request_key)
);

create unique index bookkeeping_record_convergence_root_idx
  on public.bookkeeping_record_convergence_events (convergence_id)
  where supersedes_event_id is null;
create unique index bookkeeping_record_convergence_successor_idx
  on public.bookkeeping_record_convergence_events (supersedes_event_id)
  where supersedes_event_id is not null;
create index bookkeeping_record_convergence_records_idx
  on public.bookkeeping_record_convergence_events
    (business_id, survivor_record_id, absorbed_record_id, created_at desc);

create or replace function public.protect_bookkeeping_record_convergence_history()
returns trigger language plpgsql set search_path = '' as $$
begin raise exception 'bookkeeping record convergence history is append-only'; end;
$$;
create trigger bookkeeping_record_convergence_no_mutation
  before update or delete on public.bookkeeping_record_convergence_events
  for each row execute function public.protect_bookkeeping_record_convergence_history();

create or replace function public.validate_bookkeeping_record_convergence_event()
returns trigger language plpgsql set search_path = '' as $$
declare predecessor public.bookkeeping_record_convergence_events%rowtype;
begin
  if new.actor_user_id is not null and not exists (
    select 1 from public.businesses
    where id = new.business_id and owner_user_id = new.actor_user_id
  ) then raise exception 'convergence actor does not own Business'; end if;
  if new.supersedes_event_id is not null then
    select * into predecessor from public.bookkeeping_record_convergence_events
      where id = new.supersedes_event_id for update;
    if not found or predecessor.business_id <> new.business_id
      or predecessor.convergence_id <> new.convergence_id
      or predecessor.sequence_number + 1 <> new.sequence_number
      or predecessor.event_type <> 'converged'
      or new.event_type <> 'reversed'
      or predecessor.survivor_record_id <> new.survivor_record_id
      or predecessor.absorbed_record_id <> new.absorbed_record_id
      or predecessor.receipt_id <> new.receipt_id
      or predecessor.financial_transaction_id <> new.financial_transaction_id
    then raise exception 'convergence predecessor is invalid'; end if;
    if exists (select 1 from public.bookkeeping_record_convergence_events
      where supersedes_event_id = predecessor.id)
    then raise exception 'convergence history must supersede its current leaf'; end if;
  elsif exists (
    select 1 from public.current_bookkeeping_record_convergences active
    where active.business_id = new.business_id
      and (active.survivor_record_id in (new.survivor_record_id, new.absorbed_record_id)
        or active.absorbed_record_id in (new.survivor_record_id, new.absorbed_record_id))
  ) then
    raise exception 'bookkeeping record already participates in an active convergence';
  end if;
  return new;
end;
$$;
create trigger bookkeeping_record_convergence_validate
  before insert on public.bookkeeping_record_convergence_events
  for each row execute function public.validate_bookkeeping_record_convergence_event();

create view public.current_bookkeeping_record_convergences
with (security_invoker = true) as
select events.business_id, events.convergence_id, events.id as convergence_event_id,
  events.survivor_record_id, events.absorbed_record_id, events.receipt_id,
  events.financial_transaction_id, events.matcher_key, events.match_basis,
  events.created_at
from public.bookkeeping_record_convergence_events events
where events.event_type = 'converged'
  and not exists (
    select 1 from public.bookkeeping_record_convergence_events successors
    where successors.supersedes_event_id = events.id
  );

create or replace function public.reject_absorbed_bookkeeping_dependent_state()
returns trigger language plpgsql set search_path = '' as $$
begin
  if exists (
    select 1 from public.current_bookkeeping_record_convergences active
    where active.business_id = new.business_id
      and active.absorbed_record_id = new.bookkeeping_record_id
  ) then
    if tg_table_name = 'bookkeeping_decisions'
      and new.supersedes_decision_id is null
      and new.provenance = 'system'
      and new.treatment = 'unresolved'
      and new.bookkeeping_nature is null
    then return new; end if;
    raise exception 'absorbed bookkeeping record is historical; use its current survivor';
  end if;
  return new;
end;
$$;
create constraint trigger bookkeeping_decisions_reject_absorbed_target
  after insert on public.bookkeeping_decisions deferrable initially deferred
  for each row execute function public.reject_absorbed_bookkeeping_dependent_state();
create constraint trigger bookkeeping_allocations_reject_absorbed_target
  after insert on public.bookkeeping_allocations deferrable initially deferred
  for each row execute function public.reject_absorbed_bookkeeping_dependent_state();
create constraint trigger bookkeeping_review_events_reject_absorbed_target
  after insert on public.bookkeeping_review_events deferrable initially deferred
  for each row execute function public.reject_absorbed_bookkeeping_dependent_state();
create constraint trigger bookkeeping_documentation_events_reject_absorbed_target
  after insert on public.bookkeeping_documentation_events deferrable initially deferred
  for each row execute function public.reject_absorbed_bookkeeping_dependent_state();

alter table public.bookkeeping_record_convergence_events enable row level security;
create policy bookkeeping_record_convergence_select_own
  on public.bookkeeping_record_convergence_events for select to authenticated
  using (exists (select 1 from public.businesses
    where businesses.id = business_id
      and businesses.owner_user_id = (select auth.uid())));
revoke all on public.bookkeeping_record_convergence_events from public, anon, authenticated;
grant select on public.bookkeeping_record_convergence_events to authenticated, service_role;
grant select on public.current_bookkeeping_record_convergences to authenticated, service_role;

create or replace function public.normalize_receipt_convergence_merchant(p_value text)
returns text language sql immutable set search_path = '' as $$
  select regexp_replace(lower(coalesce(p_value, '')), '[^a-z0-9]+', '', 'g');
$$;

create view public.bookkeeping_receipt_convergence_candidates
with (security_invoker = true) as
select
  receipt_record.business_id,
  receipt_record.id as absorbed_record_id,
  financial_record.id as survivor_record_id,
  receipt_event.receipt_id,
  financial_transaction.id as financial_transaction_id,
  receipt_event.id as keep_event_id,
  receipt_event.extraction_id,
  document_link.id as document_link_id,
  receipt_extraction.total_amount_cents as receipt_total_amount_cents,
  receipt_extraction.occurred_on as receipt_date,
  receipt_extraction.merchant as receipt_merchant,
  financial_transaction.amount_cents as financial_amount_cents,
  financial_transaction.transaction_date as financial_date,
  coalesce(financial_transaction.merchant_name,
    financial_transaction.original_description) as financial_merchant,
  financial_transaction.currency
from public.bookkeeping_receipt_events receipt_event
join public.receipts receipt on receipt.id = receipt_event.receipt_id
  and receipt.business_id = receipt_event.business_id
join public.businesses business on business.id = receipt_event.business_id
  and business.owner_user_id = receipt_event.actor_user_id
join public.bookkeeping_records receipt_record
  on receipt_record.id = receipt_event.bookkeeping_record_id
 and receipt_record.business_id = receipt_event.business_id
 and receipt_record.source_kind = 'receipt'
join public.bookkeeping_receipt_extractions receipt_extraction
  on receipt_extraction.id = receipt_event.extraction_id
 and receipt_extraction.business_id = receipt_event.business_id
 and receipt_extraction.receipt_id = receipt_event.receipt_id
join public.bookkeeping_document_links document_link
  on document_link.id = receipt_event.bookkeeping_document_link_id
 and document_link.business_id = receipt_event.business_id
 and document_link.bookkeeping_record_id = receipt_event.bookkeeping_record_id
 and document_link.receipt_id = receipt_event.receipt_id
 and document_link.revoked_at is null
join public.bookkeeping_decisions receipt_decision
  on receipt_decision.bookkeeping_record_id = receipt_record.id
 and receipt_decision.business_id = receipt_record.business_id
 and receipt_decision.supersedes_decision_id is null
 and receipt_decision.treatment = 'unresolved'
 and receipt_decision.bookkeeping_nature is null
 and receipt_decision.provenance = 'system'
join public.financial_transactions financial_transaction
  on financial_transaction.business_id = receipt_record.business_id
 and financial_transaction.pending = false
 and financial_transaction.amount_cents < 0
 and financial_transaction.amount_cents = -receipt_extraction.total_amount_cents
 and financial_transaction.currency = receipt_record.currency
 and financial_transaction.transaction_date = receipt_extraction.occurred_on
 and public.normalize_receipt_convergence_merchant(
      coalesce(financial_transaction.merchant_name, financial_transaction.original_description)
    ) <> ''
 and public.normalize_receipt_convergence_merchant(
      coalesce(financial_transaction.merchant_name, financial_transaction.original_description)
    ) = public.normalize_receipt_convergence_merchant(receipt_extraction.merchant)
join public.bookkeeping_financial_sources financial_source
  on financial_source.financial_transaction_id = financial_transaction.id
 and financial_source.business_id = financial_transaction.business_id
 and financial_source.revoked_at is null
join public.bookkeeping_records financial_record
  on financial_record.id = financial_source.bookkeeping_record_id
 and financial_record.business_id = financial_source.business_id
 and financial_record.source_kind = 'financial_transaction'
join public.bookkeeping_decisions financial_decision
  on financial_decision.bookkeeping_record_id = financial_record.id
 and financial_decision.business_id = financial_record.business_id
 and financial_decision.supersedes_decision_id is null
 and financial_decision.treatment = 'unresolved'
 and financial_decision.bookkeeping_nature is null
 and financial_decision.provenance = 'system'
where receipt_event.event_type = 'kept'
  and receipt_event.provenance = 'user'
  and not exists (select 1 from public.bookkeeping_receipt_events successor
    where successor.supersedes_event_id = receipt_event.id)
  and receipt_extraction.total_amount_cents > 0
  and receipt_extraction.occurred_on is not null
  and public.normalize_receipt_convergence_merchant(receipt_extraction.merchant) <> ''
  and not exists (select 1 from public.bookkeeping_financial_sources source
    where source.business_id = receipt_record.business_id
      and source.bookkeeping_record_id = receipt_record.id and source.revoked_at is null)
  and not exists (select 1 from public.bookkeeping_decisions other
    where other.business_id = receipt_record.business_id
      and other.bookkeeping_record_id = receipt_record.id and other.id <> receipt_decision.id)
  and not exists (select 1 from public.bookkeeping_decisions other
    where other.business_id = financial_record.business_id
      and other.bookkeeping_record_id = financial_record.id and other.id <> financial_decision.id)
  and not exists (select 1 from public.bookkeeping_allocations allocation
    where allocation.business_id = receipt_record.business_id
      and allocation.bookkeeping_record_id in (receipt_record.id, financial_record.id))
  and not exists (select 1 from public.bookkeeping_review_events review
    where review.business_id = receipt_record.business_id
      and review.bookkeeping_record_id in (receipt_record.id, financial_record.id))
  and not exists (
    select 1 from public.bookkeeping_documentation_events documentation
    where documentation.business_id = receipt_record.business_id
      and documentation.bookkeeping_record_id in (receipt_record.id, financial_record.id)
      and documentation.event_type in ('request_opened', 'reopened')
      and not exists (select 1 from public.bookkeeping_documentation_events successor
        where successor.supersedes_event_id = documentation.id)
  )
  and not exists (select 1 from public.bookkeeping_document_links extra_link
    where extra_link.business_id = financial_record.business_id
      and extra_link.bookkeeping_record_id = financial_record.id
      and extra_link.revoked_at is null)
  and not exists (select 1 from public.bookkeeping_document_links extra_link
    where extra_link.business_id = receipt_record.business_id
      and extra_link.bookkeeping_record_id = receipt_record.id
      and extra_link.revoked_at is null and extra_link.id <> document_link.id)
  and not exists (select 1 from public.current_bookkeeping_record_convergences active
    where active.business_id = receipt_record.business_id
      and (active.survivor_record_id in (receipt_record.id, financial_record.id)
        or active.absorbed_record_id in (receipt_record.id, financial_record.id)))
  and (
    financial_transaction.import_method <> 'provider'
    or exists (
      select 1 from public.plaid_transaction_versions plaid_version
      where plaid_version.business_id = financial_transaction.business_id
        and plaid_version.canonical_financial_transaction_id = financial_transaction.id
        and plaid_version.event_type in ('added', 'modified')
        and plaid_version.pending = false
        and not exists (select 1 from public.plaid_transaction_versions plaid_successor
          where plaid_successor.supersedes_version_id = plaid_version.id)
    )
  );

revoke all on public.bookkeeping_receipt_convergence_candidates from public, anon, authenticated;
grant select on public.bookkeeping_receipt_convergence_candidates to service_role;

create or replace function public.attempt_bookkeeping_receipt_convergence(
  p_business_id uuid, p_financial_record_id uuid
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare selected public.bookkeeping_receipt_convergence_candidates%rowtype;
  financial_candidate_count integer; receipt_candidate_count integer;
  convergence_generation integer; convergence_request_key text;
  selected_event public.bookkeeping_record_convergence_events%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended(
    concat(p_business_id::text, ':', p_financial_record_id::text), 61));
  select events.* into selected_event
  from public.current_bookkeeping_record_convergences active
  join public.bookkeeping_record_convergence_events events
    on events.id = active.convergence_event_id
  where active.business_id = p_business_id
    and active.survivor_record_id = p_financial_record_id;
  if found then return selected_event.id; end if;
  select count(*) into financial_candidate_count
  from public.bookkeeping_receipt_convergence_candidates candidates
  where candidates.business_id = p_business_id
    and candidates.survivor_record_id = p_financial_record_id;
  if financial_candidate_count <> 1 then return null; end if;
  select * into selected
  from public.bookkeeping_receipt_convergence_candidates candidates
  where candidates.business_id = p_business_id
    and candidates.survivor_record_id = p_financial_record_id;
  perform pg_advisory_xact_lock(hashtextextended(
    concat(p_business_id::text, ':', selected.absorbed_record_id::text), 61));
  select count(*) into receipt_candidate_count
  from public.bookkeeping_receipt_convergence_candidates candidates
  where candidates.business_id = p_business_id
    and candidates.absorbed_record_id = selected.absorbed_record_id;
  if receipt_candidate_count <> 1 then return null; end if;
  -- Locks force any racing customer action to commit before the final predicate check.
  perform 1 from public.bookkeeping_records where id in (
    selected.survivor_record_id, selected.absorbed_record_id) order by id for update;
  if not exists (select 1 from public.bookkeeping_receipt_convergence_candidates candidates
    where candidates.business_id = p_business_id
      and candidates.survivor_record_id = selected.survivor_record_id
      and candidates.absorbed_record_id = selected.absorbed_record_id
      and candidates.receipt_id = selected.receipt_id
      and candidates.financial_transaction_id = selected.financial_transaction_id)
  then return null; end if;
  select count(*) + 1 into convergence_generation
  from public.bookkeeping_record_convergence_events events
  where events.business_id = p_business_id
    and events.survivor_record_id = selected.survivor_record_id
    and events.absorbed_record_id = selected.absorbed_record_id
    and events.supersedes_event_id is null;
  convergence_request_key := concat('receipt-financial:v1:', selected.receipt_id::text, ':',
    selected.financial_transaction_id::text, ':generation:', convergence_generation::text);
  insert into public.bookkeeping_record_convergence_events (
    business_id, convergence_id, sequence_number, event_type,
    survivor_record_id, absorbed_record_id, receipt_id, financial_transaction_id,
    matcher_key, match_basis, provenance, request_key
  ) values (
    p_business_id, gen_random_uuid(), 1, 'converged',
    selected.survivor_record_id, selected.absorbed_record_id,
    selected.receipt_id, selected.financial_transaction_id,
    'receipt_financial_exact_v1',
    jsonb_build_object(
      'schemaVersion', 1, 'amountRule', 'exact_signed_cents',
      'dateRule', 'exact_canonical_date', 'merchantRule', 'normalized_exact',
      'receiptTotalAmountCents', selected.receipt_total_amount_cents,
      'financialAmountCents', selected.financial_amount_cents,
      'economicDate', selected.financial_date,
      'normalizedMerchant', public.normalize_receipt_convergence_merchant(selected.receipt_merchant),
      'keepEventId', selected.keep_event_id,
      'extractionId', selected.extraction_id,
      'documentLinkId', selected.document_link_id
    ),
    'automation',
    convergence_request_key
  ) on conflict (business_id, request_key) do nothing
  returning * into selected_event;
  if selected_event.id is null then
    select * into selected_event from public.bookkeeping_record_convergence_events
    where business_id = p_business_id
      and request_key = convergence_request_key;
  end if;
  perform public.request_bookkeeping_processing(
    p_business_id, selected.survivor_record_id, 'deterministic_evaluation',
    concat('bookkeeping-evaluator:v1:record:', selected.survivor_record_id::text,
      ':convergence:', selected_event.id::text)
  );
  return selected_event.id;
end;
$$;

create or replace function public.attempt_bookkeeping_receipt_convergence_trigger()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.supersedes_decision_id is null and new.treatment = 'unresolved'
    and new.provenance = 'system'
  then perform public.attempt_bookkeeping_receipt_convergence(
    new.business_id, new.bookkeeping_record_id); end if;
  return null;
end;
$$;
create constraint trigger bookkeeping_decision_attempt_receipt_convergence
  after insert on public.bookkeeping_decisions deferrable initially deferred
  for each row execute function public.attempt_bookkeeping_receipt_convergence_trigger();

create or replace function public.reverse_bookkeeping_record_convergence(
  p_convergence_id uuid, p_expected_current_event_id uuid,
  p_request_key text, p_reason text
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare current_event public.bookkeeping_record_convergence_events%rowtype;
  reversed_id uuid;
begin
  if (select auth.uid()) is null then raise exception 'authentication required'; end if;
  if length(btrim(coalesce(p_request_key, ''))) not between 1 and 200
    or length(btrim(coalesce(p_reason, ''))) not between 1 and 1000
  then raise exception 'reversal request identity and reason are required'; end if;
  select events.id into reversed_id
  from public.bookkeeping_record_convergence_events events
  join public.businesses businesses on businesses.id = events.business_id
  where events.convergence_id = p_convergence_id
    and events.request_key = btrim(p_request_key)
    and events.event_type = 'reversed'
    and businesses.owner_user_id = (select auth.uid());
  if found then return reversed_id; end if;
  select events.* into current_event
  from public.bookkeeping_record_convergence_events events
  join public.businesses businesses on businesses.id = events.business_id
  where events.convergence_id = p_convergence_id
    and events.id = p_expected_current_event_id
    and events.event_type = 'converged'
    and businesses.owner_user_id = (select auth.uid())
    and not exists (select 1 from public.bookkeeping_record_convergence_events successor
      where successor.supersedes_event_id = events.id)
  for update of events;
  if not found then raise exception 'current convergence is unavailable'; end if;
  perform pg_advisory_xact_lock(hashtextextended(current_event.convergence_id::text, 61));
  if exists (select 1 from public.bookkeeping_decisions decision
      where decision.business_id = current_event.business_id
        and decision.bookkeeping_record_id in (
          current_event.survivor_record_id, current_event.absorbed_record_id)
        and (decision.supersedes_decision_id is not null
          or decision.provenance <> 'system' or decision.treatment <> 'unresolved'))
    or exists (select 1 from public.bookkeeping_allocations allocation
      where allocation.business_id = current_event.business_id
        and allocation.bookkeeping_record_id in (
          current_event.survivor_record_id, current_event.absorbed_record_id))
    or exists (select 1 from public.bookkeeping_review_events review
      where review.business_id = current_event.business_id
        and review.bookkeeping_record_id in (
          current_event.survivor_record_id, current_event.absorbed_record_id))
    or exists (select 1 from public.bookkeeping_documentation_events documentation
      where documentation.business_id = current_event.business_id
        and documentation.bookkeeping_record_id in (
          current_event.survivor_record_id, current_event.absorbed_record_id)
        and documentation.event_type in ('request_opened', 'reopened')
        and not exists (select 1 from public.bookkeeping_documentation_events successor
          where successor.supersedes_event_id = documentation.id))
  then raise exception 'convergence has dependent accounting state; guarded correction is required'; end if;
  insert into public.bookkeeping_record_convergence_events (
    business_id, convergence_id, supersedes_event_id, sequence_number,
    event_type, survivor_record_id, absorbed_record_id, receipt_id,
    financial_transaction_id, matcher_key, match_basis, provenance,
    actor_user_id, request_key
  ) values (
    current_event.business_id, current_event.convergence_id, current_event.id, 2,
    'reversed', current_event.survivor_record_id, current_event.absorbed_record_id,
    current_event.receipt_id, current_event.financial_transaction_id,
    current_event.matcher_key,
    current_event.match_basis || jsonb_build_object('reversalReason', btrim(p_reason)),
    'user', (select auth.uid()), btrim(p_request_key)
  ) on conflict (business_id, request_key) do nothing returning id into reversed_id;
  if reversed_id is null then
    select id into reversed_id from public.bookkeeping_record_convergence_events
    where business_id = current_event.business_id and request_key = btrim(p_request_key);
  end if;
  perform public.request_bookkeeping_processing(
    current_event.business_id, current_event.survivor_record_id,
    'deterministic_evaluation', concat('bookkeeping-evaluator:v1:record:',
      current_event.survivor_record_id::text, ':convergence-reversed:', reversed_id::text));
  perform public.request_bookkeeping_processing(
    current_event.business_id, current_event.absorbed_record_id,
    'deterministic_evaluation', concat('bookkeeping-evaluator:v1:record:',
      current_event.absorbed_record_id::text, ':convergence-reversed:', reversed_id::text));
  return reversed_id;
end;
$$;

revoke execute on function public.normalize_receipt_convergence_merchant(text)
  from public, anon, authenticated;
revoke execute on function public.attempt_bookkeeping_receipt_convergence(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.attempt_bookkeeping_receipt_convergence(uuid, uuid)
  to service_role;
revoke execute on function public.reverse_bookkeeping_record_convergence(uuid, uuid, text, text)
  from public, anon;
grant execute on function public.reverse_bookkeeping_record_convergence(uuid, uuid, text, text)
  to authenticated;

comment on table public.bookkeeping_record_convergence_events is
  'Append-only current-identity history joining one kept receipt-only record to one later financial-origin survivor.';
comment on view public.current_bookkeeping_record_convergences is
  'Active receipt-first record aliases; absorbed records remain historical and resolve to financial-origin survivors.';

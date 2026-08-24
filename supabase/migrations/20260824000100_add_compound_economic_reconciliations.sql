-- Bounded compound-economic reconciliation. Ordinary one-transaction/one-record
-- associations remain governed by bookkeeping_financial_sources unchanged.

alter table public.bookkeeping_decisions
  drop constraint bookkeeping_decisions_nature_check;
alter table public.bookkeeping_decisions
  add constraint bookkeeping_decisions_nature_check check (
    bookkeeping_nature is null or bookkeeping_nature in (
      'expense', 'business_income', 'transfer', 'credit_card_payment',
      'refund', 'owner_contribution', 'loan_proceeds', 'loan_principal_payment',
      'other_non_income'
    )
  );

create table public.bookkeeping_compound_reconciliations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  anchor_financial_transaction_id uuid not null,
  anchor_bookkeeping_record_id uuid not null,
  scenario text not null,
  basis_kind text not null,
  basis_reference_ids uuid[] not null default '{}',
  request_key text not null,
  provenance text not null,
  actor_user_id uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint bookkeeping_compound_reconciliations_scope_unique
    unique (id, business_id),
  constraint bookkeeping_compound_reconciliations_request_unique
    unique (business_id, request_key),
  constraint bookkeeping_compound_reconciliations_transaction_fkey
    foreign key (anchor_financial_transaction_id, business_id)
    references public.financial_transactions(id, business_id) on delete restrict,
  constraint bookkeeping_compound_reconciliations_record_fkey
    foreign key (anchor_bookkeeping_record_id, business_id)
    references public.bookkeeping_records(id, business_id) on delete restrict,
  constraint bookkeeping_compound_reconciliations_scenario_check check (
    scenario in ('processor_settlement', 'loan_payment_split', 'batched_deposit', 'later_bank_match')
  ),
  constraint bookkeeping_compound_reconciliations_basis_check check (
    basis_kind in ('trusted_document', 'customer_fact', 'canonical_payment_evidence')
  ),
  constraint bookkeeping_compound_reconciliations_identity_check check (
    length(btrim(request_key)) between 1 and 200
  ),
  constraint bookkeeping_compound_reconciliations_provenance_check check (
    provenance in ('automation', 'user', 'system')
  ),
  constraint bookkeeping_compound_reconciliations_actor_check check (
    (provenance = 'user' and actor_user_id is not null)
    or (provenance <> 'user' and actor_user_id is null)
  )
);

create table public.bookkeeping_compound_reconciliation_links (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  reconciliation_id uuid not null,
  bookkeeping_record_id uuid not null,
  linked_amount_cents bigint not null,
  relationship_role text not null,
  provenance text not null,
  actor_user_id uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint bookkeeping_compound_links_reconciliation_fkey
    foreign key (reconciliation_id, business_id)
    references public.bookkeeping_compound_reconciliations(id, business_id) on delete restrict,
  constraint bookkeeping_compound_links_record_fkey
    foreign key (bookkeeping_record_id, business_id)
    references public.bookkeeping_records(id, business_id) on delete restrict,
  constraint bookkeeping_compound_links_record_unique
    unique (reconciliation_id, bookkeeping_record_id),
  constraint bookkeeping_compound_links_amount_check check (linked_amount_cents <> 0),
  constraint bookkeeping_compound_links_role_check check (
    relationship_role in (
      'settlement_income', 'settlement_fee', 'loan_principal', 'loan_interest',
      'deposit_payment', 'payment_match'
    )
  ),
  constraint bookkeeping_compound_links_provenance_check check (
    provenance in ('automation', 'user', 'system')
  ),
  constraint bookkeeping_compound_links_actor_check check (
    (provenance = 'user' and actor_user_id is not null)
    or (provenance <> 'user' and actor_user_id is null)
  )
);

create table public.bookkeeping_compound_reconciliation_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  reconciliation_id uuid not null,
  supersedes_event_id uuid,
  sequence_number integer not null,
  event_type text not null,
  request_key text not null,
  reason text,
  provenance text not null,
  actor_user_id uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint bookkeeping_compound_events_scope_unique
    unique (id, business_id, reconciliation_id),
  constraint bookkeeping_compound_events_reconciliation_fkey
    foreign key (reconciliation_id, business_id)
    references public.bookkeeping_compound_reconciliations(id, business_id) on delete restrict,
  constraint bookkeeping_compound_events_predecessor_fkey
    foreign key (supersedes_event_id, business_id, reconciliation_id)
    references public.bookkeeping_compound_reconciliation_events(id, business_id, reconciliation_id)
    on delete restrict,
  constraint bookkeeping_compound_events_request_unique unique (business_id, request_key),
  constraint bookkeeping_compound_events_type_check check (event_type in ('activated', 'reversed')),
  constraint bookkeeping_compound_events_sequence_check check (
    (supersedes_event_id is null and sequence_number = 1 and event_type = 'activated')
    or (supersedes_event_id is not null and sequence_number > 1)
  ),
  constraint bookkeeping_compound_events_provenance_check check (
    provenance in ('automation', 'user', 'system')
  ),
  constraint bookkeeping_compound_events_actor_check check (
    (provenance = 'user' and actor_user_id is not null)
    or (provenance <> 'user' and actor_user_id is null)
  )
);

create unique index bookkeeping_compound_events_root_idx
  on public.bookkeeping_compound_reconciliation_events (reconciliation_id)
  where supersedes_event_id is null;
create unique index bookkeeping_compound_events_successor_idx
  on public.bookkeeping_compound_reconciliation_events (supersedes_event_id)
  where supersedes_event_id is not null;
create index bookkeeping_compound_links_record_idx
  on public.bookkeeping_compound_reconciliation_links (business_id, bookkeeping_record_id);

create view public.current_bookkeeping_compound_reconciliations
with (security_invoker = true) as
select reconciliation.business_id, reconciliation.id as reconciliation_id,
  event.id as reconciliation_event_id, reconciliation.anchor_financial_transaction_id,
  reconciliation.anchor_bookkeeping_record_id, reconciliation.scenario,
  reconciliation.basis_kind, reconciliation.basis_reference_ids, event.created_at as activated_at
from public.bookkeeping_compound_reconciliations reconciliation
join public.bookkeeping_compound_reconciliation_events event
  on event.reconciliation_id = reconciliation.id
 and event.business_id = reconciliation.business_id
 and event.event_type = 'activated'
where not exists (
  select 1 from public.bookkeeping_compound_reconciliation_events successor
  where successor.supersedes_event_id = event.id
);

create view public.current_bookkeeping_compound_components
with (security_invoker = true) as
select active.business_id, active.reconciliation_id, active.reconciliation_event_id,
  active.anchor_financial_transaction_id, active.anchor_bookkeeping_record_id,
  active.scenario, link.id as link_id, link.bookkeeping_record_id,
  link.linked_amount_cents, link.relationship_role
from public.current_bookkeeping_compound_reconciliations active
join public.bookkeeping_compound_reconciliation_links link
  on link.reconciliation_id = active.reconciliation_id
 and link.business_id = active.business_id;

create or replace function public.reject_compound_reconciliation_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin raise exception 'compound reconciliation history is append-only'; end;
$$;
create trigger bookkeeping_compound_reconciliations_no_mutation
  before update or delete on public.bookkeeping_compound_reconciliations
  for each row execute function public.reject_compound_reconciliation_mutation();
create trigger bookkeeping_compound_links_no_mutation
  before update or delete on public.bookkeeping_compound_reconciliation_links
  for each row execute function public.reject_compound_reconciliation_mutation();
create trigger bookkeeping_compound_events_no_mutation
  before update or delete on public.bookkeeping_compound_reconciliation_events
  for each row execute function public.reject_compound_reconciliation_mutation();

create or replace function public.create_bookkeeping_compound_reconciliation(
  p_business_id uuid,
  p_anchor_financial_transaction_id uuid,
  p_anchor_bookkeeping_record_id uuid,
  p_scenario text,
  p_basis_kind text,
  p_basis_reference_ids uuid[],
  p_components jsonb,
  p_request_key text
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare selected_business public.businesses%rowtype;
  anchor_transaction public.financial_transactions%rowtype;
  anchor_record public.bookkeeping_records%rowtype;
  selected_reconciliation_id uuid; selected_event_id uuid;
  component jsonb; component_record public.bookkeeping_records%rowtype;
  component_count integer := 0; linked_total numeric := 0;
  role_counts jsonb := '{}'::jsonb; selected_actor uuid := (select auth.uid());
  component_id uuid; component_amount bigint; component_role text;
begin
  if p_scenario not in ('processor_settlement', 'loan_payment_split', 'batched_deposit', 'later_bank_match')
    or p_basis_kind not in ('trusted_document', 'customer_fact', 'canonical_payment_evidence')
    or jsonb_typeof(p_components) <> 'array'
    or jsonb_array_length(p_components) = 0
    or length(btrim(coalesce(p_request_key, ''))) not between 1 and 200
  then raise exception 'compound reconciliation request is invalid'; end if;
  select * into selected_business from public.businesses where id = p_business_id;
  if not found then raise exception 'Business is unavailable'; end if;
  if selected_actor is not null and selected_business.owner_user_id <> selected_actor then
    raise exception 'compound reconciliation Business ownership mismatch';
  end if;
  if p_scenario = 'loan_payment_split'
    and p_basis_kind not in ('trusted_document', 'customer_fact') then
    raise exception 'loan split requires trusted evidence or customer facts';
  end if;
  if p_basis_kind = 'customer_fact' and selected_actor is null then
    raise exception 'customer fact basis requires an authenticated owner';
  end if;
  if p_basis_kind = 'trusted_document' and (
      coalesce(cardinality(p_basis_reference_ids), 0) = 0
      or exists (select 1 from unnest(p_basis_reference_ids) reference_id
        where not exists (select 1 from public.receipts receipt
          where receipt.id = reference_id and receipt.business_id = p_business_id)))
  then raise exception 'trusted document basis is unavailable to this Business'; end if;
  perform pg_advisory_xact_lock(hashtextextended(
    concat(p_business_id::text, ':compound-transaction:', p_anchor_financial_transaction_id::text), 67));
  select id into selected_reconciliation_id
  from public.bookkeeping_compound_reconciliations
  where business_id = p_business_id and request_key = btrim(p_request_key);
  if found then return selected_reconciliation_id; end if;
  select * into anchor_transaction from public.financial_transactions
  where id = p_anchor_financial_transaction_id and business_id = p_business_id for update;
  if not found then raise exception 'anchor financial transaction is unavailable'; end if;
  if anchor_transaction.pending then raise exception 'compound anchor must be posted'; end if;
  select * into anchor_record from public.bookkeeping_records
  where id = p_anchor_bookkeeping_record_id and business_id = p_business_id for update;
  if not found or anchor_record.source_kind <> 'financial_transaction' then
    raise exception 'anchor bookkeeping record is unavailable'; end if;
  if not exists (select 1 from public.bookkeeping_financial_sources source
      where source.business_id = p_business_id
        and source.bookkeeping_record_id = anchor_record.id
        and source.financial_transaction_id = anchor_transaction.id
        and source.revoked_at is null)
    or anchor_record.amount_cents is distinct from anchor_transaction.amount_cents
    or anchor_record.currency is distinct from anchor_transaction.currency
  then raise exception 'anchor direct source identity is invalid'; end if;
  if exists (select 1 from public.current_bookkeeping_compound_reconciliations active
      where active.business_id = p_business_id
        and (active.anchor_financial_transaction_id = anchor_transaction.id
          or active.anchor_bookkeeping_record_id = anchor_record.id))
    or exists (select 1 from public.current_bookkeeping_compound_components active
      where active.business_id = p_business_id
        and active.bookkeeping_record_id = anchor_record.id)
  then raise exception 'anchor already participates in an active compound reconciliation'; end if;
  if not exists (select 1 from public.bookkeeping_decisions decision
      where decision.business_id = p_business_id and decision.bookkeeping_record_id = anchor_record.id
        and decision.supersedes_decision_id is null and decision.provenance = 'system'
        and decision.treatment = 'unresolved' and decision.bookkeeping_nature is null)
    or exists (select 1 from public.bookkeeping_decisions decision
      where decision.business_id = p_business_id and decision.bookkeeping_record_id = anchor_record.id
        and decision.supersedes_decision_id is not null)
    or exists (select 1 from public.bookkeeping_allocations allocation
      where allocation.business_id = p_business_id and allocation.bookkeeping_record_id = anchor_record.id)
    or exists (select 1 from public.bookkeeping_review_events review
      where review.business_id = p_business_id and review.bookkeeping_record_id = anchor_record.id)
  then raise exception 'anchor has dependent or customer-authored bookkeeping state'; end if;

  for component in select value from jsonb_array_elements(p_components) loop
    if jsonb_typeof(component) <> 'object'
      or (select array_agg(key order by key) from jsonb_object_keys(component) key)
        is distinct from array['amountCents','recordId','role']::text[]
      or (component->>'recordId') !~ '^[0-9a-fA-F-]{36}$'
      or (component->>'amountCents') !~ '^-?[0-9]+$'
    then raise exception 'compound component is malformed'; end if;
    component_id := (component->>'recordId')::uuid;
    component_amount := (component->>'amountCents')::bigint;
    component_role := component->>'role';
    if component_role not in (
        'settlement_income', 'settlement_fee', 'loan_principal', 'loan_interest',
        'deposit_payment', 'payment_match')
      or component_amount = 0 or component_id = anchor_record.id then
      raise exception 'compound component amount or identity is invalid'; end if;
    perform pg_advisory_xact_lock(hashtextextended(
      concat(p_business_id::text, ':compound-record:', component_id::text), 67));
    select * into component_record from public.bookkeeping_records
    where id = component_id and business_id = p_business_id for update;
    if not found or component_record.amount_cents is distinct from component_amount
      or component_record.currency is distinct from anchor_transaction.currency
    then raise exception 'compound component facts do not match canonical record'; end if;
    if exists (select 1 from public.current_bookkeeping_compound_reconciliations active
        where active.business_id = p_business_id
          and active.anchor_bookkeeping_record_id = component_id)
      or exists (select 1 from public.current_bookkeeping_compound_components active
        where active.business_id = p_business_id and active.bookkeeping_record_id = component_id)
      or exists (select 1 from public.current_bookkeeping_record_convergences convergence
        where convergence.business_id = p_business_id
          and convergence.absorbed_record_id = component_id)
    then raise exception 'component already participates in incompatible current resolution'; end if;
    if exists (select 1 from public.bookkeeping_financial_sources source
      where source.business_id = p_business_id
        and source.bookkeeping_record_id = component_id and source.revoked_at is null)
    then raise exception 'compound component already has active financial source evidence'; end if;
    component_count := component_count + 1;
    linked_total := linked_total + component_amount;
    role_counts := jsonb_set(role_counts, array[component_role],
      to_jsonb(coalesce((role_counts->>component_role)::integer, 0) + 1));
  end loop;
  if linked_total <> anchor_transaction.amount_cents then
    raise exception 'compound components must reconcile exactly to source signed cents'; end if;
  if p_basis_kind = 'trusted_document' and exists (
      select 1 from unnest(p_basis_reference_ids) reference_id
      where not exists (select 1 from public.bookkeeping_document_links document_link
        where document_link.business_id = p_business_id
          and document_link.receipt_id = reference_id
          and document_link.revoked_at is null
          and (document_link.bookkeeping_record_id = anchor_record.id
            or document_link.bookkeeping_record_id in (
              select (value->>'recordId')::uuid from jsonb_array_elements(p_components) value))))
  then raise exception 'trusted document is not active evidence for this reconciliation'; end if;
  if p_scenario = 'processor_settlement' and not (
      anchor_transaction.amount_cents > 0 and component_count = 2
      and coalesce((role_counts->>'settlement_income')::integer, 0) = 1
      and coalesce((role_counts->>'settlement_fee')::integer, 0) = 1
      and (select (value->>'amountCents')::bigint > 0 from jsonb_array_elements(p_components) value where value->>'role' = 'settlement_income')
      and (select (value->>'amountCents')::bigint < 0 from jsonb_array_elements(p_components) value where value->>'role' = 'settlement_fee'))
  then raise exception 'processor settlement roles or signs are invalid'; end if;
  if p_scenario = 'loan_payment_split' and not (
      anchor_transaction.amount_cents < 0 and component_count = 2
      and coalesce((role_counts->>'loan_principal')::integer, 0) = 1
      and coalesce((role_counts->>'loan_interest')::integer, 0) = 1
      and not exists (select 1 from jsonb_array_elements(p_components) value
        where (value->>'amountCents')::bigint >= 0))
  then raise exception 'loan split roles or signs are invalid'; end if;
  if p_scenario = 'batched_deposit' and not (
      anchor_transaction.amount_cents > 0 and component_count >= 2
      and coalesce((role_counts->>'deposit_payment')::integer, 0) = component_count
      and not exists (select 1 from jsonb_array_elements(p_components) value
        where (value->>'amountCents')::bigint <= 0))
  then raise exception 'batched deposit roles or signs are invalid'; end if;
  if p_scenario = 'later_bank_match' and not (
      component_count = 1 and coalesce((role_counts->>'payment_match')::integer, 0) = 1)
  then raise exception 'later bank match requires one exact payment component'; end if;
  if p_scenario in ('batched_deposit', 'later_bank_match') and exists (
      select 1 from jsonb_array_elements(p_components) value
      where not exists (
        select 1 from public.bookkeeping_decisions decision
        where decision.business_id = p_business_id
          and decision.bookkeeping_record_id = (value->>'recordId')::uuid
          and decision.bookkeeping_nature = 'business_income'
          and decision.treatment = 'business'
          and not exists (select 1 from public.bookkeeping_decisions successor
            where successor.supersedes_decision_id = decision.id)))
  then raise exception 'deposit components require current established customer income'; end if;

  insert into public.bookkeeping_compound_reconciliations (
    business_id, anchor_financial_transaction_id, anchor_bookkeeping_record_id,
    scenario, basis_kind, basis_reference_ids, request_key, provenance, actor_user_id
  ) values (
    p_business_id, anchor_transaction.id, anchor_record.id, p_scenario, p_basis_kind,
    coalesce(p_basis_reference_ids, '{}'), btrim(p_request_key),
    case when selected_actor is null then 'automation' else 'user' end, selected_actor
  ) returning id into selected_reconciliation_id;
  insert into public.bookkeeping_compound_reconciliation_links (
    business_id, reconciliation_id, bookkeeping_record_id, linked_amount_cents,
    relationship_role, provenance, actor_user_id
  ) select p_business_id, selected_reconciliation_id, (value->>'recordId')::uuid,
    (value->>'amountCents')::bigint, value->>'role',
    case when selected_actor is null then 'automation' else 'user' end, selected_actor
  from jsonb_array_elements(p_components) value;
  insert into public.bookkeeping_compound_reconciliation_events (
    business_id, reconciliation_id, sequence_number, event_type, request_key,
    provenance, actor_user_id
  ) values (
    p_business_id, selected_reconciliation_id, 1, 'activated',
    concat(btrim(p_request_key), ':activate'),
    case when selected_actor is null then 'automation' else 'user' end, selected_actor
  ) returning id into selected_event_id;
  for component in select value from jsonb_array_elements(p_components) loop
    perform public.request_bookkeeping_processing(
      p_business_id, (component->>'recordId')::uuid, 'deterministic_evaluation',
      concat('bookkeeping-evaluator:v1:record:', component->>'recordId',
        ':compound:', selected_event_id::text));
  end loop;
  return selected_reconciliation_id;
end;
$$;

create or replace function public.reverse_bookkeeping_compound_reconciliation(
  p_reconciliation_id uuid, p_expected_current_event_id uuid,
  p_request_key text, p_reason text
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare active public.current_bookkeeping_compound_reconciliations%rowtype;
  selected_actor uuid := (select auth.uid()); reversed_id uuid; component record;
begin
  if selected_actor is null then raise exception 'authentication required'; end if;
  select event.id into reversed_id
  from public.bookkeeping_compound_reconciliation_events event
  join public.bookkeeping_compound_reconciliations reconciliation
    on reconciliation.id = event.reconciliation_id and reconciliation.business_id = event.business_id
  join public.businesses business on business.id = event.business_id
  where event.reconciliation_id = p_reconciliation_id
    and event.request_key = btrim(p_request_key) and event.event_type = 'reversed'
    and business.owner_user_id = selected_actor;
  if found then return reversed_id; end if;
  select current.* into active from public.current_bookkeeping_compound_reconciliations current
  join public.businesses business on business.id = current.business_id
  where current.reconciliation_id = p_reconciliation_id
    and current.reconciliation_event_id = p_expected_current_event_id
    and business.owner_user_id = selected_actor;
  if not found then raise exception 'current compound reconciliation is unavailable'; end if;
  perform pg_advisory_xact_lock(hashtextextended(active.reconciliation_id::text, 67));
  if exists (select 1 from public.bookkeeping_decisions decision
      join public.bookkeeping_compound_reconciliation_links link
        on link.bookkeeping_record_id = decision.bookkeeping_record_id
       and link.business_id = decision.business_id
      where link.reconciliation_id = active.reconciliation_id
        and decision.created_at > active.activated_at)
    or exists (select 1 from public.bookkeeping_allocations allocation
      join public.bookkeeping_compound_reconciliation_links link
        on link.bookkeeping_record_id = allocation.bookkeeping_record_id
       and link.business_id = allocation.business_id
      where link.reconciliation_id = active.reconciliation_id
        and allocation.created_at > active.activated_at)
    or exists (select 1 from public.bookkeeping_review_events review
      join public.bookkeeping_compound_reconciliation_links link
        on link.bookkeeping_record_id = review.bookkeeping_record_id
       and link.business_id = review.business_id
      where link.reconciliation_id = active.reconciliation_id
        and review.created_at > active.activated_at)
  then raise exception 'compound reconciliation has dependent state; guarded correction is required'; end if;
  insert into public.bookkeeping_compound_reconciliation_events (
    business_id, reconciliation_id, supersedes_event_id, sequence_number,
    event_type, request_key, reason, provenance, actor_user_id
  ) values (
    active.business_id, active.reconciliation_id, active.reconciliation_event_id, 2,
    'reversed', btrim(p_request_key), btrim(p_reason), 'user', selected_actor
  ) returning id into reversed_id;
  perform public.request_bookkeeping_processing(
    active.business_id, active.anchor_bookkeeping_record_id, 'deterministic_evaluation',
    concat('bookkeeping-evaluator:v1:record:', active.anchor_bookkeeping_record_id::text,
      ':compound-reversed:', reversed_id::text));
  for component in select bookkeeping_record_id from public.bookkeeping_compound_reconciliation_links
    where reconciliation_id = active.reconciliation_id and business_id = active.business_id
  loop
    perform public.request_bookkeeping_processing(
      active.business_id, component.bookkeeping_record_id, 'deterministic_evaluation',
      concat('bookkeeping-evaluator:v1:record:', component.bookkeeping_record_id::text,
        ':compound-reversed:', reversed_id::text));
  end loop;
  return reversed_id;
end;
$$;

create or replace function public.reject_suppressed_compound_anchor_state()
returns trigger language plpgsql set search_path = '' as $$
begin
  if exists (select 1 from public.current_bookkeeping_compound_reconciliations active
      where active.business_id = new.business_id
        and active.anchor_bookkeeping_record_id = new.bookkeeping_record_id)
  then raise exception 'compound anchor is historical; target a current component'; end if;
  return new;
end;
$$;
create constraint trigger bookkeeping_decisions_reject_compound_anchor
  after insert on public.bookkeeping_decisions deferrable initially deferred
  for each row execute function public.reject_suppressed_compound_anchor_state();
create constraint trigger bookkeeping_allocations_reject_compound_anchor
  after insert on public.bookkeeping_allocations deferrable initially deferred
  for each row execute function public.reject_suppressed_compound_anchor_state();
create constraint trigger bookkeeping_review_events_reject_compound_anchor
  after insert on public.bookkeeping_review_events deferrable initially deferred
  for each row execute function public.reject_suppressed_compound_anchor_state();
create constraint trigger bookkeeping_documentation_events_reject_compound_anchor
  after insert on public.bookkeeping_documentation_events deferrable initially deferred
  for each row execute function public.reject_suppressed_compound_anchor_state();

create or replace function public.correct_compound_bookkeeping_record_use(
  p_bookkeeping_record_id uuid, p_expected_current_decision_id uuid,
  p_correction_request_id uuid, p_answer jsonb
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare selected_business_id uuid; selected_record public.bookkeeping_records%rowtype;
  current_decision public.bookkeeping_decisions%rowtype;
  new_decision public.bookkeeping_decisions%rowtype; existing_decision public.bookkeeping_decisions%rowtype;
  answer_keys text[]; answer_use text; personal_magnitude bigint;
  signed_personal bigint; signed_business bigint; preserved_category text;
begin
  select id into selected_business_id from public.businesses
  where owner_user_id = (select auth.uid());
  if selected_business_id is null then raise exception 'Business was not found'; end if;
  select * into existing_decision from public.bookkeeping_decisions
  where business_id = selected_business_id and correction_request_id = p_correction_request_id;
  if found then return jsonb_build_object('decision_id', existing_decision.id,
    'bookkeeping_record_id', existing_decision.bookkeeping_record_id, 'idempotent', true); end if;
  select record.* into selected_record from public.bookkeeping_records record
  join public.current_bookkeeping_compound_components component
    on component.bookkeeping_record_id = record.id and component.business_id = record.business_id
  where record.id = p_bookkeeping_record_id and record.business_id = selected_business_id;
  if not found then raise exception 'Current compound component was not found for this Business'; end if;
  perform pg_advisory_xact_lock(hashtextextended('bookkeeping-record:' || selected_record.id::text, 0));
  select * into current_decision from public.bookkeeping_decisions decision
  where decision.business_id = selected_business_id
    and decision.bookkeeping_record_id = selected_record.id
    and not exists (select 1 from public.bookkeeping_decisions successor
      where successor.supersedes_decision_id = decision.id) for update;
  if current_decision.id is distinct from p_expected_current_decision_id then
    raise exception 'stale current bookkeeping decision'; end if;
  if current_decision.bookkeeping_nature is distinct from 'expense' then
    raise exception 'Only established purchases can use this factual correction'; end if;
  select array_agg(key order by key) into answer_keys from jsonb_object_keys(p_answer) key;
  answer_use := p_answer->>'use';
  if answer_use in ('business', 'personal') then
    if answer_keys is distinct from array['schemaVersion','use']::text[]
      or p_answer->>'schemaVersion' <> '1' then raise exception 'Correction contains unsupported fields'; end if;
  elsif answer_use = 'mixed' then
    if answer_keys is distinct from array['personalAmountCents','schemaVersion','use']::text[]
      or p_answer->>'schemaVersion' <> '1' then raise exception 'Correction contains unsupported fields'; end if;
    begin personal_magnitude := (p_answer->>'personalAmountCents')::bigint;
    exception when others then raise exception 'Personal amount must be whole cents'; end;
    if personal_magnitude <= 0 or personal_magnitude >= abs(selected_record.amount_cents) then
      raise exception 'Personal amount must be between zero and the transaction total'; end if;
  else raise exception 'Correction use is invalid'; end if;
  select allocation.tax_category_key into preserved_category
  from public.bookkeeping_allocations allocation
  where allocation.bookkeeping_decision_id = current_decision.id
    and allocation.allocation_kind = 'business' and allocation.tax_category_key is not null limit 1;
  insert into public.bookkeeping_decisions (
    business_id, bookkeeping_record_id, supersedes_decision_id, bookkeeping_nature,
    treatment, review_status, provenance, actor_user_id, reason, business_purpose,
    correction_request_id
  ) values (
    selected_business_id, selected_record.id, current_decision.id, 'expense',
    case when answer_use = 'mixed' then 'mixed_use' else answer_use end,
    'resolved', 'user', (select auth.uid()),
    case answer_use when 'business' then 'Customer clarified that this purchase was for the business.'
      when 'personal' then 'Customer clarified that this purchase was personal.'
      else 'Customer clarified the personal portion of this purchase.' end,
    current_decision.business_purpose, p_correction_request_id
  ) returning * into new_decision;
  if answer_use = 'business' then
    insert into public.bookkeeping_allocations (business_id, bookkeeping_record_id,
      bookkeeping_decision_id, allocation_kind, amount_cents, tax_category_key)
    values (selected_business_id, selected_record.id, new_decision.id,
      'business', selected_record.amount_cents, preserved_category);
  elsif answer_use = 'personal' then
    insert into public.bookkeeping_allocations (business_id, bookkeeping_record_id,
      bookkeeping_decision_id, allocation_kind, amount_cents)
    values (selected_business_id, selected_record.id, new_decision.id,
      'personal', selected_record.amount_cents);
  else
    signed_personal := sign(selected_record.amount_cents) * personal_magnitude;
    signed_business := selected_record.amount_cents - signed_personal;
    insert into public.bookkeeping_allocations (business_id, bookkeeping_record_id,
      bookkeeping_decision_id, allocation_kind, amount_cents, tax_category_key)
    values
      (selected_business_id, selected_record.id, new_decision.id,
       'business', signed_business, preserved_category),
      (selected_business_id, selected_record.id, new_decision.id,
       'personal', signed_personal, null);
  end if;
  return jsonb_build_object('decision_id', new_decision.id,
    'bookkeeping_record_id', selected_record.id, 'idempotent', false);
end;
$$;

alter table public.bookkeeping_compound_reconciliations enable row level security;
alter table public.bookkeeping_compound_reconciliation_links enable row level security;
alter table public.bookkeeping_compound_reconciliation_events enable row level security;
create policy bookkeeping_compound_reconciliations_select_own
  on public.bookkeeping_compound_reconciliations for select to authenticated
  using (exists (select 1 from public.businesses business
    where business.id = business_id and business.owner_user_id = (select auth.uid())));
create policy bookkeeping_compound_links_select_own
  on public.bookkeeping_compound_reconciliation_links for select to authenticated
  using (exists (select 1 from public.businesses business
    where business.id = business_id and business.owner_user_id = (select auth.uid())));
create policy bookkeeping_compound_events_select_own
  on public.bookkeeping_compound_reconciliation_events for select to authenticated
  using (exists (select 1 from public.businesses business
    where business.id = business_id and business.owner_user_id = (select auth.uid())));
revoke all on public.bookkeeping_compound_reconciliations from public, anon, authenticated;
revoke all on public.bookkeeping_compound_reconciliation_links from public, anon, authenticated;
revoke all on public.bookkeeping_compound_reconciliation_events from public, anon, authenticated;
grant select on public.bookkeeping_compound_reconciliations,
  public.bookkeeping_compound_reconciliation_links,
  public.bookkeeping_compound_reconciliation_events,
  public.current_bookkeeping_compound_reconciliations,
  public.current_bookkeeping_compound_components to authenticated, service_role;
revoke execute on function public.create_bookkeeping_compound_reconciliation(
  uuid, uuid, uuid, text, text, uuid[], jsonb, text) from public, anon;
grant execute on function public.create_bookkeeping_compound_reconciliation(
  uuid, uuid, uuid, text, text, uuid[], jsonb, text) to authenticated, service_role;
revoke execute on function public.reverse_bookkeeping_compound_reconciliation(
  uuid, uuid, text, text) from public, anon;
grant execute on function public.reverse_bookkeeping_compound_reconciliation(
  uuid, uuid, text, text) to authenticated;
revoke execute on function public.correct_compound_bookkeeping_record_use(uuid, uuid, uuid, jsonb)
  from public, anon;
grant execute on function public.correct_compound_bookkeeping_record_use(uuid, uuid, uuid, jsonb)
  to authenticated;

comment on table public.bookkeeping_compound_reconciliations is
  'Bounded Business-scoped identity for an exact compound reconciliation; not a financial event or accounting decision.';
comment on table public.bookkeeping_compound_reconciliation_links is
  'Immutable signed-cent relationships from one source observation to its canonical economic component records.';
comment on view public.current_bookkeeping_compound_reconciliations is
  'Only complete, atomically validated compound groups whose activation remains the current event leaf.';

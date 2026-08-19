-- Narrow authenticated factual use corrections for canonical expense activity.
-- Source financial facts remain immutable; each correction appends a user decision.

alter table public.bookkeeping_decisions
  add column correction_request_id uuid;

create unique index bookkeeping_decisions_correction_request_unique_idx
  on public.bookkeeping_decisions (business_id, correction_request_id)
  where correction_request_id is not null;

grant select on public.bookkeeping_documentation_events to authenticated, service_role;

create or replace function public.correct_bookkeeping_transaction_use(
  p_financial_transaction_id uuid,
  p_expected_current_decision_id uuid,
  p_correction_request_id uuid,
  p_answer jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  authenticated_user_id uuid := (select auth.uid());
  selected_business_id uuid;
  selected_record public.bookkeeping_records%rowtype;
  current_decision public.bookkeeping_decisions%rowtype;
  existing_decision public.bookkeeping_decisions%rowtype;
  new_decision public.bookkeeping_decisions%rowtype;
  source_transaction public.financial_transactions%rowtype;
  answer_keys text[];
  answer_use text;
  personal_magnitude bigint;
  signed_personal bigint;
  signed_business bigint;
  preserved_category text;
begin
  if authenticated_user_id is null then raise exception 'authentication required'; end if;
  if p_correction_request_id is null or p_expected_current_decision_id is null then
    raise exception 'Correction identity and expected decision are required';
  end if;
  select id into selected_business_id from public.businesses
  where owner_user_id = authenticated_user_id;
  if selected_business_id is null then raise exception 'Business was not found'; end if;

  select * into existing_decision from public.bookkeeping_decisions
  where business_id = selected_business_id
    and correction_request_id = p_correction_request_id;
  if found then
    return jsonb_build_object('decision_id', existing_decision.id,
      'bookkeeping_record_id', existing_decision.bookkeeping_record_id,
      'idempotent', true);
  end if;

  select records.* into selected_record
  from public.bookkeeping_records records
  join public.bookkeeping_financial_sources sources
    on sources.bookkeeping_record_id = records.id
   and sources.business_id = records.business_id and sources.revoked_at is null
  join public.financial_transactions transactions
    on transactions.id = sources.financial_transaction_id
   and transactions.business_id = sources.business_id
  where records.business_id = selected_business_id
    and transactions.id = p_financial_transaction_id;
  if selected_record.id is null then raise exception 'Transaction was not found for this Business'; end if;
  select * into source_transaction from public.financial_transactions
  where id = p_financial_transaction_id and business_id = selected_business_id;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('bookkeeping-record:' || selected_record.id::text, 0));

  select decisions.* into current_decision
  from public.bookkeeping_decisions decisions
  where decisions.business_id = selected_business_id
    and decisions.bookkeeping_record_id = selected_record.id
    and not exists (select 1 from public.bookkeeping_decisions successor
      where successor.supersedes_decision_id = decisions.id)
  for update;
  if current_decision.id is distinct from p_expected_current_decision_id then
    raise exception 'stale current bookkeeping decision';
  end if;
  if current_decision.bookkeeping_nature is distinct from 'expense' then
    raise exception 'Only established purchases can use this factual correction';
  end if;
  if source_transaction.amount_cents = 0 then raise exception 'Transaction amount is unavailable'; end if;
  if jsonb_typeof(p_answer) <> 'object' then raise exception 'Correction answer must be an object'; end if;
  select array_agg(key order by key) into answer_keys from jsonb_object_keys(p_answer) key;
  answer_use := p_answer ->> 'use';
  if answer_use in ('business', 'personal') then
    if answer_keys is distinct from array['schemaVersion','use']::text[]
      or p_answer ->> 'schemaVersion' <> '1' then
      raise exception 'Correction contains unsupported fields';
    end if;
  elsif answer_use = 'mixed' then
    if answer_keys is distinct from array['personalAmountCents','schemaVersion','use']::text[]
      or p_answer ->> 'schemaVersion' <> '1' then
      raise exception 'Correction contains unsupported fields';
    end if;
    begin personal_magnitude := (p_answer ->> 'personalAmountCents')::bigint;
    exception when others then raise exception 'Personal amount must be whole cents'; end;
    if personal_magnitude <= 0 or personal_magnitude >= abs(source_transaction.amount_cents) then
      raise exception 'Personal amount must be between zero and the transaction total';
    end if;
  else raise exception 'Correction use is invalid'; end if;

  select allocations.tax_category_key into preserved_category
  from public.bookkeeping_allocations allocations
  where allocations.bookkeeping_decision_id = current_decision.id
    and allocations.allocation_kind = 'business'
    and allocations.tax_category_key is not null limit 1;

  insert into public.bookkeeping_decisions (
    business_id, bookkeeping_record_id, supersedes_decision_id,
    bookkeeping_nature, treatment, review_status, provenance, actor_user_id,
    confidence, reason, business_purpose, correction_request_id
  ) values (
    selected_business_id, selected_record.id, current_decision.id, 'expense',
    case when answer_use = 'mixed' then 'mixed_use' else answer_use end,
    'resolved', 'user', authenticated_user_id, null,
    case answer_use
      when 'business' then 'Customer clarified that this purchase was for the business.'
      when 'personal' then 'Customer clarified that this purchase was personal.'
      else 'Customer clarified the personal portion of this purchase.' end,
    current_decision.business_purpose, p_correction_request_id
  ) returning * into new_decision;

  if answer_use = 'business' then
    insert into public.bookkeeping_allocations (business_id, bookkeeping_record_id,
      bookkeeping_decision_id, allocation_kind, amount_cents, tax_category_key)
    values (selected_business_id, selected_record.id, new_decision.id,
      'business', source_transaction.amount_cents, preserved_category);
  elsif answer_use = 'personal' then
    insert into public.bookkeeping_allocations (business_id, bookkeeping_record_id,
      bookkeeping_decision_id, allocation_kind, amount_cents)
    values (selected_business_id, selected_record.id, new_decision.id,
      'personal', source_transaction.amount_cents);
  else
    signed_personal := sign(source_transaction.amount_cents) * personal_magnitude;
    signed_business := source_transaction.amount_cents - signed_personal;
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

revoke execute on function public.correct_bookkeeping_transaction_use(uuid,uuid,uuid,jsonb)
  from public, anon, service_role;
grant execute on function public.correct_bookkeeping_transaction_use(uuid,uuid,uuid,jsonb)
  to authenticated;

comment on function public.correct_bookkeeping_transaction_use(uuid,uuid,uuid,jsonb) is
  'Authenticated append-only factual business/personal/mixed-use correction for an established canonical expense.';

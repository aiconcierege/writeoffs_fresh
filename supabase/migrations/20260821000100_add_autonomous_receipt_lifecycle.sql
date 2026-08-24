-- Autonomous receipt retention. Customer upload is the truthful retention intent;
-- extraction, matching, and receipt-only creation remain automation provenance.

alter table public.bookkeeping_receipt_extractions
  add column quality_status text,
  add column quality_reasons text[] not null default '{}',
  add column quality_policy_version text;

alter table public.bookkeeping_receipt_extractions
  add constraint bookkeeping_receipt_extractions_quality_check check (
    (quality_status is null and quality_policy_version is null)
    or (
      quality_status in ('usable', 'incomplete', 'suspect')
      and length(btrim(quality_policy_version)) between 1 and 100
    )
  );

comment on column public.bookkeeping_receipt_extractions.quality_status is
  'Versioned deterministic usability assessment; never a customer confirmation or tax conclusion.';

alter table public.bookkeeping_receipt_events
  drop constraint bookkeeping_receipt_events_type_check,
  drop constraint bookkeeping_receipt_events_shape_check;

alter table public.bookkeeping_receipt_events
  add constraint bookkeeping_receipt_events_type_check check (
    event_type in ('uploaded', 'extraction_completed', 'matched', 'unmatched',
      'retained', 'kept', 'discarded')
  ),
  add constraint bookkeeping_receipt_events_shape_check check (
    (event_type = 'uploaded' and extraction_id is null and bookkeeping_record_id is null)
    or (event_type = 'extraction_completed' and extraction_id is not null and bookkeeping_record_id is null)
    or (event_type = 'matched' and bookkeeping_record_id is not null
      and bookkeeping_document_link_id is not null)
    or (event_type in ('retained','kept') and bookkeeping_record_id is not null
      and bookkeeping_document_link_id is not null and extraction_id is not null)
    or (event_type = 'unmatched' and bookkeeping_record_id is null and bookkeeping_document_link_id is null)
    or (event_type = 'discarded')
  ),
  add constraint bookkeeping_receipt_events_semantics_check check (
    (event_type = 'uploaded' and provenance = 'user')
    or (event_type = 'retained' and provenance = 'automation' and actor_user_id is null)
    or (event_type = 'kept' and provenance = 'user')
    or event_type in ('extraction_completed','matched','unmatched','discarded')
  );

create or replace function public.validate_bookkeeping_receipt_event()
returns trigger language plpgsql set search_path = '' as $$
declare predecessor public.bookkeeping_receipt_events%rowtype;
begin
  if new.actor_user_id is not null and not exists (
    select 1 from public.businesses where id = new.business_id and owner_user_id = new.actor_user_id
  ) then raise exception 'receipt event actor does not own Business'; end if;
  if new.supersedes_event_id is not null then
    select * into predecessor from public.bookkeeping_receipt_events where id = new.supersedes_event_id for update;
    if not found or predecessor.business_id <> new.business_id or predecessor.receipt_id <> new.receipt_id
      or predecessor.sequence_number + 1 <> new.sequence_number
    then raise exception 'receipt event predecessor is invalid'; end if;
    if exists (select 1 from public.bookkeeping_receipt_events where supersedes_event_id = predecessor.id)
    then raise exception 'receipt history must supersede its current leaf'; end if;
    if predecessor.event_type = 'discarded'
      or (predecessor.event_type = 'kept' and new.event_type <> 'discarded')
    then raise exception 'completed receipt action is immutable'; end if;
  end if;
  return new;
end;
$$;

create or replace function public.receipt_extraction_quality_v1(
  p_merchant text, p_occurred_on date, p_total_amount_cents bigint
) returns jsonb language plpgsql stable set search_path = '' as $$
declare reasons text[] := '{}'; normalized_merchant text := lower(btrim(coalesce(p_merchant, '')));
  date_digits text; parsed_date date;
begin
  if normalized_merchant = '' then reasons := array_append(reasons, 'MERCHANT_MISSING'); end if;
  if p_occurred_on is null then reasons := array_append(reasons, 'DATE_MISSING');
  elsif p_occurred_on > current_date then reasons := array_append(reasons, 'DATE_IN_FUTURE'); end if;
  if p_total_amount_cents is null then reasons := array_append(reasons, 'TOTAL_MISSING');
  elsif p_total_amount_cents <= 0 then reasons := array_append(reasons, 'TOTAL_INVALID'); end if;
  if normalized_merchant in ('date','total','receipt','invoice','subtotal','tax','amount','purchase')
  then reasons := array_append(reasons, 'GENERIC_MERCHANT'); end if;
  if p_total_amount_cents is not null and p_total_amount_cents > 0
    and mod(p_total_amount_cents, 100) = 0
  then
    date_digits := lpad((p_total_amount_cents / 100)::text, 8, '0');
    if date_digits ~ '^[0-9]{8}$' then
      begin
        parsed_date := make_date(substring(date_digits,5,4)::integer,
          substring(date_digits,1,2)::integer, substring(date_digits,3,2)::integer);
        if to_char(parsed_date, 'MMDDYYYY') = date_digits
        then reasons := array_append(reasons, 'TOTAL_RESEMBLES_DATE'); end if;
      exception when others then null;
      end;
    end if;
  end if;
  if reasons && array['GENERIC_MERCHANT','DATE_IN_FUTURE','TOTAL_INVALID','TOTAL_RESEMBLES_DATE']::text[]
  then return jsonb_build_object('status','suspect','reasons',to_jsonb(reasons),'version','receipt-quality:v1'); end if;
  if reasons <> '{}'::text[]
  then return jsonb_build_object('status','incomplete','reasons',to_jsonb(reasons),'version','receipt-quality:v1'); end if;
  return jsonb_build_object('status','usable','reasons','[]'::jsonb,'version','receipt-quality:v1');
end;
$$;

create view public.bookkeeping_autonomous_receipt_match_candidates
with (security_invoker = true) as
select receipt_event.business_id, receipt_event.receipt_id,
  receipt_event.id as receipt_event_id, receipt_event.extraction_id,
  extraction.merchant as receipt_merchant, extraction.occurred_on as receipt_date,
  extraction.total_amount_cents as receipt_total_amount_cents,
  financial_transaction.id as financial_transaction_id,
  financial_record.id as financial_record_id
from public.bookkeeping_receipt_events receipt_event
join public.bookkeeping_receipt_extractions extraction
  on extraction.id = receipt_event.extraction_id and extraction.business_id = receipt_event.business_id
join public.financial_transactions financial_transaction
  on financial_transaction.business_id = receipt_event.business_id
 and financial_transaction.pending = false
 and financial_transaction.currency = 'USD'
 and financial_transaction.amount_cents = -extraction.total_amount_cents
 and financial_transaction.transaction_date = extraction.occurred_on
 and public.normalize_receipt_convergence_merchant(coalesce(
   financial_transaction.merchant_name, financial_transaction.original_description))
   = public.normalize_receipt_convergence_merchant(extraction.merchant)
join public.bookkeeping_financial_sources financial_source
  on financial_source.business_id = financial_transaction.business_id
 and financial_source.financial_transaction_id = financial_transaction.id
 and financial_source.revoked_at is null
join public.bookkeeping_records financial_record
  on financial_record.id = financial_source.bookkeeping_record_id
 and financial_record.business_id = financial_source.business_id
 and financial_record.source_kind = 'financial_transaction'
join public.bookkeeping_decisions financial_decision
  on financial_decision.business_id = financial_record.business_id
 and financial_decision.bookkeeping_record_id = financial_record.id
 and financial_decision.supersedes_decision_id is null
 and financial_decision.treatment = 'unresolved'
 and financial_decision.bookkeeping_nature is null
 and financial_decision.provenance = 'system'
where receipt_event.event_type = 'extraction_completed'
  and not exists (select 1 from public.bookkeeping_receipt_events successor
    where successor.supersedes_event_id = receipt_event.id)
  and extraction.quality_status = 'usable'
  and extraction.quality_policy_version = 'receipt-quality:v1'
  and public.normalize_receipt_convergence_merchant(extraction.merchant) <> ''
  and not exists (select 1 from public.bookkeeping_decisions other
    where other.business_id = financial_record.business_id
      and other.bookkeeping_record_id = financial_record.id and other.id <> financial_decision.id)
  and not exists (select 1 from public.bookkeeping_allocations allocation
    where allocation.business_id = financial_record.business_id
      and allocation.bookkeeping_record_id = financial_record.id)
  and not exists (select 1 from public.bookkeeping_review_events review
    where review.business_id = financial_record.business_id
      and review.bookkeeping_record_id = financial_record.id)
  and not exists (select 1 from public.bookkeeping_document_links link
    where link.business_id = financial_record.business_id
      and link.bookkeeping_record_id = financial_record.id and link.revoked_at is null)
  and not exists (select 1 from public.current_bookkeeping_record_convergences convergence
    where convergence.business_id = financial_record.business_id
      and (convergence.survivor_record_id = financial_record.id
        or convergence.absorbed_record_id = financial_record.id))
  and (
    financial_transaction.import_method <> 'provider'
    or exists (
      select 1 from public.plaid_transaction_versions version
      where version.business_id = financial_transaction.business_id
        and version.canonical_financial_transaction_id = financial_transaction.id
        and version.event_type in ('added','modified') and version.pending = false
        and not exists (select 1 from public.plaid_transaction_versions successor
          where successor.supersedes_version_id = version.id)
    )
  );

revoke all on public.bookkeeping_autonomous_receipt_match_candidates from public, anon, authenticated;
grant select on public.bookkeeping_autonomous_receipt_match_candidates to service_role;

create or replace function public.finalize_autonomous_bookkeeping_receipt(p_receipt_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare selected_business_id uuid; current_event public.bookkeeping_receipt_events%rowtype;
  extraction public.bookkeeping_receipt_extractions%rowtype; candidate public.bookkeeping_autonomous_receipt_match_candidates%rowtype;
  financial_count integer; receipt_count integer; selected_record public.bookkeeping_records%rowtype;
  selected_link public.bookkeeping_document_links%rowtype; decision_id uuid;
begin
  if (select auth.uid()) is null then raise exception 'authentication required'; end if;
  select business_id into selected_business_id from public.receipts
    where id = p_receipt_id and user_id = (select auth.uid());
  if selected_business_id is null then raise exception 'receipt unavailable'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_receipt_id::text, 53));
  select * into current_event from public.bookkeeping_receipt_events event
    where event.receipt_id = p_receipt_id and not exists (
      select 1 from public.bookkeeping_receipt_events successor where successor.supersedes_event_id = event.id)
    for update;
  if current_event.event_type in ('matched','retained','kept','discarded') then
    return jsonb_build_object('receipt_id',p_receipt_id,'state',current_event.event_type,
      'record_id',current_event.bookkeeping_record_id); end if;
  if current_event.event_type <> 'extraction_completed' then
    return jsonb_build_object('receipt_id',p_receipt_id,'state','processing'); end if;
  select * into extraction from public.bookkeeping_receipt_extractions
    where id = current_event.extraction_id and business_id = selected_business_id;
  if extraction.quality_status <> 'usable' then
    return jsonb_build_object('receipt_id',p_receipt_id,'state','details_unavailable',
      'quality_status',extraction.quality_status); end if;

  select count(*) into financial_count from public.bookkeeping_autonomous_receipt_match_candidates match
    where match.business_id = selected_business_id and match.receipt_id = p_receipt_id;
  if financial_count = 1 then
    select * into candidate from public.bookkeeping_autonomous_receipt_match_candidates match
      where match.business_id = selected_business_id and match.receipt_id = p_receipt_id;
    select count(*) into receipt_count from public.bookkeeping_autonomous_receipt_match_candidates match
      where match.business_id = selected_business_id
        and match.financial_transaction_id = candidate.financial_transaction_id;
    if receipt_count = 1 then
      selected_link := public.attach_bookkeeping_receipt_with_documentation(candidate.financial_record_id,p_receipt_id);
      insert into public.bookkeeping_receipt_events(business_id,receipt_id,supersedes_event_id,sequence_number,
        event_type,bookkeeping_record_id,bookkeeping_document_link_id,extraction_id,provenance,context)
      values(selected_business_id,p_receipt_id,current_event.id,current_event.sequence_number+1,'matched',
        candidate.financial_record_id,selected_link.id,extraction.id,'automation',
        jsonb_build_object('finalizerVersion','receipt-finalizer:v1','matcherVersion','receipt-financial-exact:v1'));
      perform public.request_bookkeeping_processing(selected_business_id,candidate.financial_record_id,
        'deterministic_evaluation',concat('bookkeeping-evaluator:v1:record:',candidate.financial_record_id,
          ':receipt:',p_receipt_id,':extraction:',extraction.id));
      return jsonb_build_object('receipt_id',p_receipt_id,'state','matched','record_id',candidate.financial_record_id);
    end if;
  end if;

  if financial_count > 0 then
    return jsonb_build_object('receipt_id',p_receipt_id,'state','details_unavailable',
      'quality_status','usable','reason','AMBIGUOUS_FINANCIAL_MATCH');
  end if;

  selected_record := public.ensure_bookkeeping_record(selected_business_id,'receipt',null,'automation',
    concat('receipt:',p_receipt_id),-extraction.total_amount_cents,'USD',extraction.occurred_on);
  decision_id := public.ensure_initial_bookkeeping_decision(selected_business_id,selected_record.id);
  selected_link := public.attach_bookkeeping_receipt_with_documentation(selected_record.id,p_receipt_id);
  insert into public.bookkeeping_receipt_events(business_id,receipt_id,supersedes_event_id,sequence_number,
    event_type,bookkeeping_record_id,bookkeeping_document_link_id,extraction_id,provenance,context)
  values(selected_business_id,p_receipt_id,current_event.id,current_event.sequence_number+1,'retained',
    selected_record.id,selected_link.id,extraction.id,'automation',
    jsonb_build_object('finalizerVersion','receipt-finalizer:v1','qualityPolicyVersion',extraction.quality_policy_version));
  return jsonb_build_object('receipt_id',p_receipt_id,'state','retained','record_id',selected_record.id,
    'decision_id',decision_id);
end;
$$;

create or replace function public.record_bookkeeping_receipt_extraction(
  p_receipt_id uuid, p_extraction_key text, p_provider text,
  p_merchant text, p_occurred_on date, p_total_amount_cents bigint, p_raw_payload jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare selected_business_id uuid; selected_extraction public.bookkeeping_receipt_extractions%rowtype;
  current_event public.bookkeeping_receipt_events%rowtype; quality jsonb; next_event_id uuid;
  event_provenance text; event_actor uuid;
begin
  if (select auth.uid()) is null then raise exception 'authentication required'; end if;
  select business_id into selected_business_id from public.receipts
    where id=p_receipt_id and user_id=(select auth.uid());
  if selected_business_id is null then raise exception 'receipt unavailable'; end if;
  if length(btrim(p_extraction_key)) not between 1 and 200 or length(btrim(p_provider)) not between 1 and 100
    then raise exception 'invalid extraction identity'; end if;
  if p_total_amount_cents is not null and p_total_amount_cents <= 0 then raise exception 'receipt total must be positive'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_receipt_id::text,53));
  select * into current_event from public.bookkeeping_receipt_events event where event.receipt_id=p_receipt_id
    and not exists(select 1 from public.bookkeeping_receipt_events successor where successor.supersedes_event_id=event.id) for update;
  if current_event.event_type in ('matched','retained','kept','discarded') then
    return jsonb_build_object('receipt_id',p_receipt_id,'state',current_event.event_type,
      'record_id',current_event.bookkeeping_record_id); end if;
  quality := public.receipt_extraction_quality_v1(p_merchant,p_occurred_on,p_total_amount_cents);
  insert into public.bookkeeping_receipt_extractions(business_id,receipt_id,extraction_key,provider,
    merchant,occurred_on,total_amount_cents,raw_payload,quality_status,quality_reasons,quality_policy_version)
  values(selected_business_id,p_receipt_id,btrim(p_extraction_key),btrim(p_provider),
    left(nullif(btrim(p_merchant),''),500),p_occurred_on,p_total_amount_cents,p_raw_payload,
    quality->>'status',array(select jsonb_array_elements_text(quality->'reasons')),quality->>'version')
  on conflict (business_id,receipt_id,extraction_key) do nothing returning * into selected_extraction;
  if selected_extraction.id is null then select * into selected_extraction from public.bookkeeping_receipt_extractions
    where business_id=selected_business_id and receipt_id=p_receipt_id and extraction_key=btrim(p_extraction_key); end if;
  if selected_extraction.merchant is distinct from left(nullif(btrim(p_merchant),''),500)
    or selected_extraction.occurred_on is distinct from p_occurred_on
    or selected_extraction.total_amount_cents is distinct from p_total_amount_cents
    then raise exception 'extraction retry contains different facts'; end if;
  if current_event.event_type = 'extraction_completed'
    and current_event.extraction_id = selected_extraction.id
  then return public.finalize_autonomous_bookkeeping_receipt(p_receipt_id); end if;
  event_provenance := case when p_provider = 'customer' then 'user' else 'automation' end;
  event_actor := case when p_provider = 'customer' then (select auth.uid()) else null end;
  insert into public.bookkeeping_receipt_events(business_id,receipt_id,supersedes_event_id,sequence_number,
    event_type,extraction_id,provenance,actor_user_id,context)
  values(selected_business_id,p_receipt_id,current_event.id,current_event.sequence_number+1,
    'extraction_completed',selected_extraction.id,event_provenance,event_actor,
    jsonb_build_object('qualityStatus',selected_extraction.quality_status,
      'qualityPolicyVersion',selected_extraction.quality_policy_version))
  on conflict (supersedes_event_id) where supersedes_event_id is not null do nothing
  returning id into next_event_id;
  return public.finalize_autonomous_bookkeeping_receipt(p_receipt_id);
end;
$$;

-- Preserve the explicit legacy Keep contract without manufacturing a second
-- record/decision when autonomous finalization already retained the receipt.
create or replace function public.keep_unmatched_bookkeeping_receipt(p_receipt_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare selected_business_id uuid; current_event public.bookkeeping_receipt_events%rowtype;
  extraction public.bookkeeping_receipt_extractions%rowtype; selected_record public.bookkeeping_records%rowtype;
  selected_link public.bookkeeping_document_links%rowtype; decision_id uuid;
begin
  if (select auth.uid()) is null then raise exception 'authentication required'; end if;
  select business_id into selected_business_id from public.receipts
    where id=p_receipt_id and user_id=(select auth.uid());
  if selected_business_id is null then raise exception 'receipt unavailable'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_receipt_id::text,53));
  select * into current_event from public.bookkeeping_receipt_events where receipt_id=p_receipt_id
    and not exists(select 1 from public.bookkeeping_receipt_events s
      where s.supersedes_event_id=bookkeeping_receipt_events.id) for update;
  if current_event.event_type='kept' then
    return jsonb_build_object('receipt_id',p_receipt_id,'state','kept','record_id',current_event.bookkeeping_record_id);
  end if;
  if current_event.event_type='retained' then
    select decision.id into decision_id from public.bookkeeping_decisions decision
      where decision.business_id=selected_business_id
        and decision.bookkeeping_record_id=current_event.bookkeeping_record_id
        and not exists (select 1 from public.bookkeeping_decisions successor
          where successor.supersedes_decision_id=decision.id);
    insert into public.bookkeeping_receipt_events(business_id,receipt_id,supersedes_event_id,sequence_number,event_type,
      bookkeeping_record_id,bookkeeping_document_link_id,extraction_id,provenance,actor_user_id,context)
    values(selected_business_id,p_receipt_id,current_event.id,current_event.sequence_number+1,'kept',
      current_event.bookkeeping_record_id,current_event.bookkeeping_document_link_id,current_event.extraction_id,
      'user',(select auth.uid()),jsonb_build_object('paymentMethod','unknown','legacyExplicitKeep',true));
    return jsonb_build_object('receipt_id',p_receipt_id,'state','kept',
      'record_id',current_event.bookkeeping_record_id,'decision_id',decision_id);
  end if;
  if current_event.event_type in ('matched','discarded') then raise exception 'receipt has already been completed'; end if;
  select * into extraction from public.bookkeeping_receipt_extractions
    where business_id=selected_business_id and receipt_id=p_receipt_id order by created_at desc,id desc limit 1;
  if extraction.total_amount_cents is null or extraction.occurred_on is null
  then raise exception 'receipt amount and date are required before keeping'; end if;
  selected_record := public.ensure_bookkeeping_record(selected_business_id,'receipt',null,'user',
    concat('receipt:',p_receipt_id),-extraction.total_amount_cents,'USD',extraction.occurred_on);
  decision_id := public.ensure_initial_bookkeeping_decision(selected_business_id,selected_record.id);
  selected_link := public.attach_bookkeeping_receipt_with_documentation(selected_record.id,p_receipt_id);
  insert into public.bookkeeping_receipt_events(business_id,receipt_id,supersedes_event_id,sequence_number,event_type,
    bookkeeping_record_id,bookkeeping_document_link_id,extraction_id,provenance,actor_user_id,context)
  values(selected_business_id,p_receipt_id,current_event.id,current_event.sequence_number+1,'kept',selected_record.id,
    selected_link.id,extraction.id,'user',(select auth.uid()),jsonb_build_object('paymentMethod','unknown'));
  return jsonb_build_object('receipt_id',p_receipt_id,'state','kept',
    'record_id',selected_record.id,'decision_id',decision_id);
end;
$$;

create or replace function public.discard_autonomous_bookkeeping_receipt(
  p_receipt_id uuid, p_request_key text, p_reason text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare selected_business_id uuid; current_event public.bookkeeping_receipt_events%rowtype;
  active_convergence record; reversed_id uuid; selected_link public.bookkeeping_document_links%rowtype;
  deactivate_receipt_only boolean := false;
begin
  if (select auth.uid()) is null then raise exception 'authentication required'; end if;
  if length(btrim(coalesce(p_request_key,''))) not between 1 and 200
    or length(btrim(coalesce(p_reason,''))) not between 1 and 1000
  then raise exception 'discard request identity and reason are required'; end if;
  select business_id into selected_business_id from public.receipts
    where id=p_receipt_id and user_id=(select auth.uid());
  if selected_business_id is null then raise exception 'receipt unavailable'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_receipt_id::text,53));
  select * into current_event from public.bookkeeping_receipt_events event where event.receipt_id=p_receipt_id
    and not exists(select 1 from public.bookkeeping_receipt_events successor where successor.supersedes_event_id=event.id) for update;
  if current_event.event_type='discarded' then return jsonb_build_object('receipt_id',p_receipt_id,'state','discarded'); end if;
  if current_event.bookkeeping_record_id is not null and current_event.event_type in ('retained','kept') then
    deactivate_receipt_only := true;
    select * into active_convergence from public.current_bookkeeping_record_convergences convergence
      where convergence.business_id=selected_business_id
        and convergence.absorbed_record_id=current_event.bookkeeping_record_id;
    if found then
      reversed_id := public.reverse_bookkeeping_record_convergence(active_convergence.convergence_id,
        active_convergence.convergence_event_id,concat('receipt-discard:',btrim(p_request_key)),btrim(p_reason));
    end if;
    if exists (select 1 from public.bookkeeping_decisions decision
        where decision.business_id=selected_business_id
          and decision.bookkeeping_record_id=current_event.bookkeeping_record_id
          and (decision.supersedes_decision_id is not null or decision.provenance <> 'system'
            or decision.treatment <> 'unresolved'))
      or exists (select 1 from public.bookkeeping_allocations allocation
        where allocation.business_id=selected_business_id
          and allocation.bookkeeping_record_id=current_event.bookkeeping_record_id)
      or exists (select 1 from public.bookkeeping_review_events review
        where review.business_id=selected_business_id
          and review.bookkeeping_record_id=current_event.bookkeeping_record_id)
    then raise exception 'receipt has dependent accounting state; guarded correction is required'; end if;
  end if;
  if current_event.bookkeeping_document_link_id is not null then
    selected_link := public.revoke_bookkeeping_receipt_with_documentation(
      current_event.bookkeeping_document_link_id,btrim(p_reason));
  end if;
  insert into public.bookkeeping_receipt_events(business_id,receipt_id,supersedes_event_id,sequence_number,
    event_type,bookkeeping_record_id,bookkeeping_document_link_id,extraction_id,provenance,actor_user_id,context)
  values(selected_business_id,p_receipt_id,current_event.id,current_event.sequence_number+1,'discarded',
    current_event.bookkeeping_record_id,current_event.bookkeeping_document_link_id,current_event.extraction_id,
    'user',(select auth.uid()),jsonb_build_object('reason',btrim(p_reason),'requestKey',btrim(p_request_key),
      'deactivateReceiptOnly',deactivate_receipt_only));
  if current_event.bookkeeping_record_id is not null then
    perform public.request_bookkeeping_processing(selected_business_id,current_event.bookkeeping_record_id,
      'deterministic_evaluation',concat('bookkeeping-evaluator:v1:record:',current_event.bookkeeping_record_id,
        ':receipt-discard:',btrim(p_request_key)));
  end if;
  return jsonb_build_object('receipt_id',p_receipt_id,'state','discarded','reversed_convergence_id',reversed_id);
end;
$$;

-- Legacy Keep and autonomous Retained are both eligible, but Retained must trace
-- to a truthful user-authored upload root owned by the same Business.
create or replace view public.bookkeeping_receipt_convergence_candidates
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
  coalesce(financial_transaction.merchant_name, financial_transaction.original_description) as financial_merchant,
  financial_transaction.currency
from public.bookkeeping_receipt_events receipt_event
join public.receipts receipt on receipt.id = receipt_event.receipt_id and receipt.business_id = receipt_event.business_id
join public.bookkeeping_records receipt_record on receipt_record.id = receipt_event.bookkeeping_record_id
 and receipt_record.business_id = receipt_event.business_id and receipt_record.source_kind = 'receipt'
join public.bookkeeping_receipt_extractions receipt_extraction on receipt_extraction.id = receipt_event.extraction_id
 and receipt_extraction.business_id = receipt_event.business_id and receipt_extraction.receipt_id = receipt_event.receipt_id
join public.bookkeeping_document_links document_link on document_link.id = receipt_event.bookkeeping_document_link_id
 and document_link.business_id = receipt_event.business_id and document_link.bookkeeping_record_id = receipt_event.bookkeeping_record_id
 and document_link.receipt_id = receipt_event.receipt_id and document_link.revoked_at is null
join public.bookkeeping_decisions receipt_decision on receipt_decision.bookkeeping_record_id = receipt_record.id
 and receipt_decision.business_id = receipt_record.business_id and receipt_decision.supersedes_decision_id is null
 and receipt_decision.treatment = 'unresolved' and receipt_decision.bookkeeping_nature is null
 and receipt_decision.provenance = 'system'
join public.financial_transactions financial_transaction on financial_transaction.business_id = receipt_record.business_id
 and financial_transaction.pending = false and financial_transaction.amount_cents < 0
 and financial_transaction.amount_cents = -receipt_extraction.total_amount_cents
 and financial_transaction.currency = receipt_record.currency
 and financial_transaction.transaction_date = receipt_extraction.occurred_on
 and public.normalize_receipt_convergence_merchant(coalesce(financial_transaction.merchant_name,
   financial_transaction.original_description)) <> ''
 and public.normalize_receipt_convergence_merchant(coalesce(financial_transaction.merchant_name,
   financial_transaction.original_description)) = public.normalize_receipt_convergence_merchant(receipt_extraction.merchant)
join public.bookkeeping_financial_sources financial_source on financial_source.financial_transaction_id = financial_transaction.id
 and financial_source.business_id = financial_transaction.business_id and financial_source.revoked_at is null
join public.bookkeeping_records financial_record on financial_record.id = financial_source.bookkeeping_record_id
 and financial_record.business_id = financial_source.business_id and financial_record.source_kind = 'financial_transaction'
join public.bookkeeping_decisions financial_decision on financial_decision.bookkeeping_record_id = financial_record.id
 and financial_decision.business_id = financial_record.business_id and financial_decision.supersedes_decision_id is null
 and financial_decision.treatment = 'unresolved' and financial_decision.bookkeeping_nature is null
 and financial_decision.provenance = 'system'
where (
    (receipt_event.event_type = 'kept' and receipt_event.provenance = 'user')
    or (receipt_event.event_type = 'retained' and receipt_event.provenance = 'automation'
      and exists (select 1 from public.bookkeeping_receipt_events upload
        join public.businesses business on business.id = upload.business_id and business.owner_user_id = upload.actor_user_id
        where upload.business_id = receipt_event.business_id and upload.receipt_id = receipt_event.receipt_id
          and upload.event_type = 'uploaded' and upload.provenance = 'user' and upload.supersedes_event_id is null))
  )
  and not exists (select 1 from public.bookkeeping_receipt_events successor where successor.supersedes_event_id = receipt_event.id)
  and receipt_extraction.total_amount_cents > 0 and receipt_extraction.occurred_on is not null
  and public.normalize_receipt_convergence_merchant(receipt_extraction.merchant) <> ''
  and not exists (select 1 from public.bookkeeping_financial_sources source where source.business_id = receipt_record.business_id
    and source.bookkeeping_record_id = receipt_record.id and source.revoked_at is null)
  and not exists (select 1 from public.bookkeeping_decisions other where other.business_id = receipt_record.business_id
    and other.bookkeeping_record_id = receipt_record.id and other.id <> receipt_decision.id)
  and not exists (select 1 from public.bookkeeping_decisions other where other.business_id = financial_record.business_id
    and other.bookkeeping_record_id = financial_record.id and other.id <> financial_decision.id)
  and not exists (select 1 from public.bookkeeping_allocations allocation where allocation.business_id = receipt_record.business_id
    and allocation.bookkeeping_record_id in (receipt_record.id, financial_record.id))
  and not exists (select 1 from public.bookkeeping_review_events review where review.business_id = receipt_record.business_id
    and review.bookkeeping_record_id in (receipt_record.id, financial_record.id))
  and not exists (select 1 from public.bookkeeping_documentation_events documentation
    where documentation.business_id = receipt_record.business_id
      and documentation.bookkeeping_record_id in (receipt_record.id, financial_record.id)
      and documentation.event_type in ('request_opened','reopened')
      and not exists (select 1 from public.bookkeeping_documentation_events successor
        where successor.supersedes_event_id = documentation.id))
  and not exists (select 1 from public.bookkeeping_document_links extra_link where extra_link.business_id = financial_record.business_id
    and extra_link.bookkeeping_record_id = financial_record.id and extra_link.revoked_at is null)
  and not exists (select 1 from public.bookkeeping_document_links extra_link where extra_link.business_id = receipt_record.business_id
    and extra_link.bookkeeping_record_id = receipt_record.id and extra_link.revoked_at is null and extra_link.id <> document_link.id)
  and not exists (select 1 from public.current_bookkeeping_record_convergences active where active.business_id = receipt_record.business_id
    and (active.survivor_record_id in (receipt_record.id,financial_record.id)
      or active.absorbed_record_id in (receipt_record.id,financial_record.id)))
  and (financial_transaction.import_method <> 'provider' or exists (
    select 1 from public.plaid_transaction_versions plaid_version
    where plaid_version.business_id = financial_transaction.business_id
      and plaid_version.canonical_financial_transaction_id = financial_transaction.id
      and plaid_version.event_type in ('added','modified') and plaid_version.pending = false
      and not exists (select 1 from public.plaid_transaction_versions successor
        where successor.supersedes_version_id = plaid_version.id)));

revoke all on function public.finalize_autonomous_bookkeeping_receipt(uuid) from public, anon;
revoke all on function public.discard_autonomous_bookkeeping_receipt(uuid,text,text) from public, anon;
grant execute on function public.finalize_autonomous_bookkeeping_receipt(uuid) to authenticated;
grant execute on function public.discard_autonomous_bookkeeping_receipt(uuid,text,text) to authenticated;
grant select on public.bookkeeping_receipt_convergence_candidates to service_role;

comment on function public.finalize_autonomous_bookkeeping_receipt(uuid) is
  'Idempotently matches or retains one user-uploaded receipt without fabricating a customer Keep action.';

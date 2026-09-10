-- Phase 1 foundation for the continuous customer-question queue.
-- Contractor question deferrals are append-only, tenant-owned, and bound to
-- the exact current source event so changed evidence naturally becomes askable.

create table public.contractor_question_deferral_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  question_source text not null check(question_source in ('payment_method','w9_status')),
  question_id uuid not null,
  source_version_id uuid not null,
  deferred_until timestamptz not null,
  request_key text not null check(length(btrim(request_key)) between 1 and 200),
  provenance text not null default 'user' check(provenance='user'),
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint contractor_question_deferral_request_unique unique(business_id,request_key),
  constraint contractor_question_deferral_window_check check(deferred_until>created_at)
);

create index contractor_question_deferral_lookup_idx
  on public.contractor_question_deferral_events
  (business_id,question_source,question_id,source_version_id,deferred_until desc);

create trigger contractor_question_deferrals_no_mutation before update or delete
  on public.contractor_question_deferral_events for each row
  execute function public.reject_canonical_bookkeeping_mutation();

alter table public.contractor_question_deferral_events enable row level security;
create policy contractor_question_deferrals_select_own
  on public.contractor_question_deferral_events for select to authenticated
  using(exists(select 1 from public.businesses business
    where business.id=contractor_question_deferral_events.business_id
      and business.owner_user_id=(select auth.uid())));
grant select on public.contractor_question_deferral_events to authenticated,service_role;
grant insert on public.contractor_question_deferral_events to service_role;

create or replace function public.defer_contractor_question(
  p_question_source text,
  p_question_id uuid,
  p_expected_source_version_id uuid,
  p_deferred_until timestamptz,
  p_request_key text
) returns uuid language plpgsql security definer set search_path='' as $$
declare
  actor uuid := (select auth.uid());
  selected_business uuid;
  inserted uuid;
begin
  if actor is null then raise exception 'authentication required'; end if;
  if p_question_source not in ('payment_method','w9_status')
    or p_question_id is null
    or p_expected_source_version_id is distinct from p_question_id
    or p_deferred_until<=now()
    or p_deferred_until>now()+interval '31 days'
    or length(btrim(coalesce(p_request_key,''))) not between 1 and 200
  then raise exception 'contractor question deferral is invalid'; end if;

  select id into selected_business from public.businesses where owner_user_id=actor;
  if selected_business is null then raise exception 'contractor Business is unavailable'; end if;

  select id into inserted from public.contractor_question_deferral_events
    where business_id=selected_business and request_key=btrim(p_request_key);
  if inserted is not null then return inserted; end if;

  if p_question_source='payment_method' then
    if not exists(select 1 from public.current_contractor_payments payment
      where payment.business_id=selected_business and payment.id=p_question_id
        and payment.id=p_expected_source_version_id and payment.payment_method='unknown')
    then raise exception 'contractor question changed'; end if;
  else
    if not exists(select 1 from public.current_contractor_w9_status status
      where status.business_id=selected_business and status.id=p_question_id
        and status.id=p_expected_source_version_id and status.status<>'on_file'
        and exists(select 1 from public.current_contractor_payments payment
          where payment.business_id=selected_business and payment.contractor_id=status.contractor_id))
    then raise exception 'contractor question changed'; end if;
  end if;

  insert into public.contractor_question_deferral_events(
    business_id,question_source,question_id,source_version_id,deferred_until,
    request_key,actor_user_id
  ) values(
    selected_business,p_question_source,p_question_id,p_expected_source_version_id,
    p_deferred_until,btrim(p_request_key),actor
  ) returning id into inserted;
  return inserted;
end $$;

revoke execute on function public.defer_contractor_question(text,uuid,uuid,timestamptz,text)
  from public,anon;
grant execute on function public.defer_contractor_question(text,uuid,uuid,timestamptz,text)
  to authenticated;

comment on table public.contractor_question_deferral_events is
  'Immutable, version-bound temporary unavailability for contractor factual questions; never resolution or approval.';

-- Return only question leaves whose decision and evidence fingerprints still
-- describe current canonical state. Prompt projection remains in application
-- code, but this database gate prevents stale questions from being counted.
create or replace function public.list_current_askable_bookkeeping_question_event_ids(
  p_as_of timestamptz default now()
) returns table(event_id uuid) language sql stable security definer set search_path='' as $$
  select event.id
  from public.bookkeeping_review_events event
  join public.businesses business on business.id=event.business_id
  where business.owner_user_id=(select auth.uid())
    and not exists(select 1 from public.bookkeeping_review_events successor
      where successor.supersedes_event_id=event.id)
    and (event.event_type in ('opened','reopened')
      or (event.event_type='skipped'
        and (event.deferred_until is null or event.deferred_until<=p_as_of)))
    and not exists(select 1 from public.bookkeeping_decisions successor
      where successor.supersedes_decision_id=event.based_on_decision_id)
    and public.current_bookkeeping_evidence_fingerprint(
      event.business_id,event.bookkeeping_record_id) is not distinct from event.evidence_fingerprint
  order by event.created_at,event.id;
$$;

revoke execute on function public.list_current_askable_bookkeeping_question_event_ids(timestamptz)
  from public,anon;
grant execute on function public.list_current_askable_bookkeeping_question_event_ids(timestamptz)
  to authenticated;

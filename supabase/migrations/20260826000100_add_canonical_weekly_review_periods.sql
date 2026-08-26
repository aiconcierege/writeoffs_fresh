-- Period-level Weekly Review is separate from bookkeeping_review_events, which
-- remains the append-only queue of individual factual questions.

create table public.business_review_cadence_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  supersedes_event_id uuid,
  check_in_weekday smallint not null check (check_in_weekday between 0 and 6),
  timezone_name text not null check(length(timezone_name) between 1 and 100),
  effective_from date not null,
  provenance text not null check (provenance in ('user','system')),
  actor_user_id uuid references auth.users(id) on delete restrict,
  request_id uuid,
  created_at timestamptz not null default now(),
  unique (id,business_id),
  foreign key (supersedes_event_id,business_id)
    references public.business_review_cadence_events(id,business_id) on delete restrict,
  check ((provenance='user' and actor_user_id is not null)
    or (provenance='system' and actor_user_id is null))
);
create unique index business_review_cadence_one_successor_idx
  on public.business_review_cadence_events(supersedes_event_id)
  where supersedes_event_id is not null;
create unique index business_review_cadence_one_root_idx
  on public.business_review_cadence_events(business_id)
  where supersedes_event_id is null;
create unique index business_review_cadence_request_idx
  on public.business_review_cadence_events(business_id,request_id) where request_id is not null;

create view public.current_business_review_cadence with (security_invoker=true) as
select event.* from public.business_review_cadence_events event
where not exists(select 1 from public.business_review_cadence_events successor
  where successor.supersedes_event_id=event.id);

create table public.bookkeeping_review_periods (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  period_kind text not null default 'weekly' check(period_kind='weekly'),
  period_start date not null,
  period_end date not null,
  check_in_date date not null,
  cadence_event_id uuid not null,
  membership_scope text not null check(membership_scope in ('expenses','business')),
  model_version integer not null default 1 check(model_version>0),
  created_at timestamptz not null default now(),
  unique(id,business_id),
  unique(business_id,period_kind,check_in_date),
  foreign key(cadence_event_id,business_id)
    references public.business_review_cadence_events(id,business_id) on delete restrict,
  check(period_end=check_in_date-1 and period_start<=period_end)
);

create or replace function public.reject_overlapping_bookkeeping_review_period()
returns trigger language plpgsql set search_path='' as $$
begin
  if exists(select 1 from public.bookkeeping_review_periods period
    where period.business_id=new.business_id and period.id<>new.id
      and daterange(period.period_start,period.period_end,'[]')
        && daterange(new.period_start,new.period_end,'[]'))
  then raise exception 'Weekly review periods cannot overlap'; end if;
  return new;
end $$;
create trigger bookkeeping_review_periods_no_overlap
before insert on public.bookkeeping_review_periods for each row
execute function public.reject_overlapping_bookkeeping_review_period();

create table public.bookkeeping_review_snapshots (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  review_period_id uuid not null,
  revision integer not null check(revision>0),
  membership_scope text not null check(membership_scope in ('expenses','business')),
  currency text not null check(currency ~ '^[A-Z]{3}$'),
  income_cents bigint,
  expense_cents bigint not null,
  unresolved_question_count integer not null check(unresolved_question_count>=0),
  activity_fingerprint text not null check(length(activity_fingerprint) between 1 and 200),
  presentation_version integer not null default 1 check(presentation_version>0),
  generated_at timestamptz not null default now(),
  unique(id,business_id,review_period_id),
  unique(review_period_id,revision),
  foreign key(review_period_id,business_id)
    references public.bookkeeping_review_periods(id,business_id) on delete restrict,
  check((membership_scope='business' and income_cents is not null)
    or (membership_scope='expenses' and income_cents is null))
);

create table public.bookkeeping_review_snapshot_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  review_period_id uuid not null,
  review_snapshot_id uuid not null,
  bookkeeping_record_id uuid not null,
  bookkeeping_decision_id uuid not null,
  financial_transaction_id uuid,
  activity_role text not null check(activity_role in ('income','expense','adjustment','other')),
  display_label text not null check(length(trim(display_label)) between 1 and 240),
  treatment text not null check(treatment in ('business','mixed_use')),
  signed_business_amount_cents bigint not null,
  occurred_on date not null,
  evidence_fingerprint text not null check(length(evidence_fingerprint) between 1 and 200),
  created_at timestamptz not null default now(),
  unique(review_snapshot_id,bookkeeping_record_id,bookkeeping_decision_id),
  foreign key(review_snapshot_id,business_id,review_period_id)
    references public.bookkeeping_review_snapshots(id,business_id,review_period_id) on delete restrict,
  foreign key(bookkeeping_record_id,business_id)
    references public.bookkeeping_records(id,business_id) on delete restrict,
  foreign key(bookkeeping_decision_id,business_id,bookkeeping_record_id)
    references public.bookkeeping_decisions(id,business_id,bookkeeping_record_id) on delete restrict,
  foreign key(financial_transaction_id,business_id)
    references public.financial_transactions(id,business_id) on delete restrict
);

create table public.bookkeeping_review_period_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  review_period_id uuid not null,
  sequence_number integer not null check(sequence_number>0),
  supersedes_event_id uuid,
  event_type text not null check(event_type in (
    'opened','questions_pending','ready','presented','deferred','correction_started',
    'correction_linked','confirmed','closed_unreviewed','reopened')),
  review_snapshot_id uuid,
  deferred_until timestamptz,
  reason text,
  provenance text not null check(provenance in ('user','system','automation')),
  actor_user_id uuid references auth.users(id) on delete restrict,
  request_id uuid,
  occurred_at timestamptz not null default now(),
  unique(id,business_id,review_period_id),
  unique(review_period_id,sequence_number),
  foreign key(review_period_id,business_id)
    references public.bookkeeping_review_periods(id,business_id) on delete restrict,
  foreign key(supersedes_event_id,business_id,review_period_id)
    references public.bookkeeping_review_period_events(id,business_id,review_period_id) on delete restrict,
  foreign key(review_snapshot_id,business_id,review_period_id)
    references public.bookkeeping_review_snapshots(id,business_id,review_period_id) on delete restrict,
  check((provenance='user' and actor_user_id is not null)
    or (provenance<>'user' and actor_user_id is null)),
  check((event_type='deferred' and deferred_until is not null) or event_type<>'deferred'),
  check((event_type in ('presented','confirmed') and review_snapshot_id is not null)
    or event_type not in ('presented','confirmed'))
);
create unique index bookkeeping_review_period_events_one_successor_idx
  on public.bookkeeping_review_period_events(supersedes_event_id)
  where supersedes_event_id is not null;
create unique index bookkeeping_review_period_events_request_idx
  on public.bookkeeping_review_period_events(business_id,request_id)
  where request_id is not null;

create table public.bookkeeping_review_correction_links (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  review_period_id uuid not null,
  review_snapshot_id uuid not null,
  bookkeeping_record_id uuid not null,
  prior_decision_id uuid not null,
  resulting_decision_id uuid not null,
  correction_request_id uuid not null,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique(business_id,correction_request_id),
  foreign key(review_snapshot_id,business_id,review_period_id)
    references public.bookkeeping_review_snapshots(id,business_id,review_period_id) on delete restrict,
  foreign key(prior_decision_id,business_id,bookkeeping_record_id)
    references public.bookkeeping_decisions(id,business_id,bookkeeping_record_id) on delete restrict,
  foreign key(resulting_decision_id,business_id,bookkeeping_record_id)
    references public.bookkeeping_decisions(id,business_id,bookkeeping_record_id) on delete restrict
);

create or replace function public.reject_weekly_review_history_mutation()
returns trigger language plpgsql set search_path='' as $$ begin
  raise exception 'Weekly review history is append-only'; end $$;
create trigger business_review_cadence_immutable before update or delete
  on public.business_review_cadence_events for each row execute function public.reject_weekly_review_history_mutation();
create trigger bookkeeping_review_periods_immutable before update or delete
  on public.bookkeeping_review_periods for each row execute function public.reject_weekly_review_history_mutation();
create trigger bookkeeping_review_snapshots_immutable before update or delete
  on public.bookkeeping_review_snapshots for each row execute function public.reject_weekly_review_history_mutation();
create trigger bookkeeping_review_snapshot_items_immutable before update or delete
  on public.bookkeeping_review_snapshot_items for each row execute function public.reject_weekly_review_history_mutation();
create trigger bookkeeping_review_period_events_immutable before update or delete
  on public.bookkeeping_review_period_events for each row execute function public.reject_weekly_review_history_mutation();
create trigger bookkeeping_review_correction_links_immutable before update or delete
  on public.bookkeeping_review_correction_links for each row execute function public.reject_weekly_review_history_mutation();

create or replace function public.set_business_review_cadence(
  p_check_in_weekday smallint,p_timezone_name text,p_effective_from date,p_request_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare selected_business uuid; current_event public.business_review_cadence_events%rowtype; inserted uuid;
begin
  select id into selected_business from public.businesses where owner_user_id=(select auth.uid());
  if selected_business is null then raise exception 'Business was not found'; end if;
  if p_check_in_weekday not between 0 and 6 then raise exception 'Check-in day is invalid'; end if;
  if p_timezone_name is null or length(p_timezone_name) not between 1 and 100 then raise exception 'Check-in timezone is invalid'; end if;
  perform pg_advisory_xact_lock(hashtextextended('review-cadence:'||selected_business::text,0));
  select id into inserted from public.business_review_cadence_events
    where business_id=selected_business and request_id=p_request_id;
  if inserted is not null then return inserted; end if;
  select * into current_event from public.current_business_review_cadence
    where business_id=selected_business;
  if current_event.id is not null and current_event.check_in_weekday=p_check_in_weekday
    and current_event.timezone_name=p_timezone_name and current_event.effective_from=p_effective_from then return current_event.id; end if;
  insert into public.business_review_cadence_events(business_id,supersedes_event_id,
    check_in_weekday,timezone_name,effective_from,provenance,actor_user_id,request_id)
  values(selected_business,current_event.id,p_check_in_weekday,p_timezone_name,p_effective_from,'user',(select auth.uid()),p_request_id)
  returning id into inserted;
  return inserted;
end $$;

create or replace function public.present_bookkeeping_weekly_review(
  p_business_id uuid,p_review_period_id uuid,p_expected_event_id uuid,p_membership_scope text,
  p_currency text,p_income_cents bigint,p_expense_cents bigint,p_unresolved_question_count integer,
  p_activity_fingerprint text,p_items jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare current_event public.bookkeeping_review_period_events%rowtype; snapshot_id uuid;
  next_revision integer; item jsonb;
begin
  if p_membership_scope not in ('expenses','business') or jsonb_typeof(p_items)<>'array'
    or jsonb_array_length(p_items)=0 then raise exception 'Review presentation is invalid'; end if;
  select * into current_event from public.bookkeeping_review_period_events
    where id=p_expected_event_id and business_id=p_business_id and review_period_id=p_review_period_id for update;
  if not found or current_event.event_type not in ('opened','questions_pending','ready','reopened')
    or exists(select 1 from public.bookkeeping_review_period_events where supersedes_event_id=current_event.id)
  then raise exception 'Review state changed'; end if;
  select coalesce(max(revision),0)+1 into next_revision from public.bookkeeping_review_snapshots
    where review_period_id=p_review_period_id;
  insert into public.bookkeeping_review_snapshots(business_id,review_period_id,revision,membership_scope,
    currency,income_cents,expense_cents,unresolved_question_count,activity_fingerprint,presentation_version)
  values(p_business_id,p_review_period_id,next_revision,p_membership_scope,p_currency,
    case when p_membership_scope='business' then p_income_cents else null end,p_expense_cents,
    p_unresolved_question_count,p_activity_fingerprint,1) returning id into snapshot_id;
  for item in select value from jsonb_array_elements(p_items) loop
    if not exists(select 1 from public.bookkeeping_decisions decision
      where decision.id=(item->>'bookkeepingDecisionId')::uuid
        and decision.bookkeeping_record_id=(item->>'bookkeepingRecordId')::uuid
        and decision.business_id=p_business_id
        and not exists(select 1 from public.bookkeeping_decisions successor where successor.supersedes_decision_id=decision.id))
    then raise exception 'Review item is not a current canonical decision'; end if;
    insert into public.bookkeeping_review_snapshot_items(business_id,review_period_id,review_snapshot_id,
      bookkeeping_record_id,bookkeeping_decision_id,activity_role,display_label,treatment,signed_business_amount_cents,
      financial_transaction_id,occurred_on,evidence_fingerprint)
    values(p_business_id,p_review_period_id,snapshot_id,(item->>'bookkeepingRecordId')::uuid,
      (item->>'bookkeepingDecisionId')::uuid,item->>'activityRole',left(trim(item->>'displayLabel'),240),
      item->>'treatment',
      (item->>'signedBusinessAmountCents')::bigint,(item->>'financialTransactionId')::uuid,
      (item->>'occurredOn')::date,item->>'evidenceFingerprint');
  end loop;
  insert into public.bookkeeping_review_period_events(business_id,review_period_id,sequence_number,
    supersedes_event_id,event_type,review_snapshot_id,provenance)
  values(p_business_id,p_review_period_id,current_event.sequence_number+1,current_event.id,
    'presented',snapshot_id,'system');
  return snapshot_id;
end $$;

create or replace function public.append_customer_review_period_event(
  p_review_period_id uuid,p_expected_event_id uuid,p_event_type text,
  p_review_snapshot_id uuid,p_deferred_until timestamptz,p_request_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare selected_business uuid; current_event public.bookkeeping_review_period_events%rowtype; inserted uuid;
begin
  select id into selected_business from public.businesses where owner_user_id=(select auth.uid());
  if selected_business is null then raise exception 'Business was not found'; end if;
  select id into inserted from public.bookkeeping_review_correction_links
    where business_id=selected_business and correction_request_id=p_correction_request_id;
  if found then return inserted; end if;
  if p_event_type not in ('deferred','correction_started','confirmed') then
    raise exception 'Unsupported customer review action'; end if;
  select * into current_event from public.bookkeeping_review_period_events
    where id=p_expected_event_id and review_period_id=p_review_period_id
      and business_id=selected_business for update;
  if not found or exists(select 1 from public.bookkeeping_review_period_events
    where supersedes_event_id=current_event.id) then raise exception 'Review state changed'; end if;
  if p_event_type='confirmed' and (p_review_snapshot_id is null
    or current_event.event_type not in ('presented','correction_linked')) then
    raise exception 'Only the exact presented review can be confirmed'; end if;
  if p_event_type='confirmed' and p_review_snapshot_id is distinct from current_event.review_snapshot_id then
    raise exception 'Presented review snapshot changed'; end if;
  insert into public.bookkeeping_review_period_events(business_id,review_period_id,
    sequence_number,supersedes_event_id,event_type,review_snapshot_id,deferred_until,
    provenance,actor_user_id,request_id)
  values(selected_business,p_review_period_id,current_event.sequence_number+1,current_event.id,
    p_event_type,coalesce(p_review_snapshot_id,current_event.review_snapshot_id),p_deferred_until,
    'user',(select auth.uid()),p_request_id) returning id into inserted;
  return inserted;
exception when unique_violation then
  select id into inserted from public.bookkeeping_review_period_events
    where business_id=selected_business and request_id=p_request_id;
  return inserted;
end $$;

create or replace function public.link_weekly_review_correction(
  p_review_period_id uuid,p_review_snapshot_id uuid,p_expected_review_event_id uuid,
  p_prior_decision_id uuid,p_resulting_decision_id uuid,p_correction_request_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare selected_business uuid; current_event public.bookkeeping_review_period_events%rowtype;
  resulting public.bookkeeping_decisions%rowtype; inserted uuid;
begin
  select id into selected_business from public.businesses where owner_user_id=(select auth.uid());
  if selected_business is null then raise exception 'Business was not found'; end if;
  select * into current_event from public.bookkeeping_review_period_events
    where id=p_expected_review_event_id and business_id=selected_business
      and review_period_id=p_review_period_id for update;
  if not found or current_event.event_type not in ('presented','correction_linked')
    or current_event.review_snapshot_id is distinct from p_review_snapshot_id
    or exists(select 1 from public.bookkeeping_review_period_events where supersedes_event_id=current_event.id)
  then raise exception 'Presented review changed'; end if;
  select * into resulting from public.bookkeeping_decisions where id=p_resulting_decision_id
    and business_id=selected_business and supersedes_decision_id=p_prior_decision_id;
  if not found or not exists(select 1 from public.bookkeeping_review_snapshot_items item
    where item.review_snapshot_id=p_review_snapshot_id and item.bookkeeping_record_id=resulting.bookkeeping_record_id
      and item.bookkeeping_decision_id=p_prior_decision_id)
  then raise exception 'Correction does not belong to the presented review'; end if;
  insert into public.bookkeeping_review_correction_links(business_id,review_period_id,review_snapshot_id,
    bookkeeping_record_id,prior_decision_id,resulting_decision_id,correction_request_id,actor_user_id)
  values(selected_business,p_review_period_id,p_review_snapshot_id,resulting.bookkeeping_record_id,
    p_prior_decision_id,p_resulting_decision_id,p_correction_request_id,(select auth.uid()))
  returning id into inserted;
  insert into public.bookkeeping_review_period_events(business_id,review_period_id,sequence_number,
    supersedes_event_id,event_type,review_snapshot_id,provenance,actor_user_id,request_id)
  values(selected_business,p_review_period_id,current_event.sequence_number+1,current_event.id,'correction_linked',
    p_review_snapshot_id,'user',(select auth.uid()),p_correction_request_id)
  on conflict(business_id,request_id) where request_id is not null do nothing;
  return inserted;
end $$;

alter table public.business_review_cadence_events enable row level security;
alter table public.bookkeeping_review_periods enable row level security;
alter table public.bookkeeping_review_snapshots enable row level security;
alter table public.bookkeeping_review_snapshot_items enable row level security;
alter table public.bookkeeping_review_period_events enable row level security;
alter table public.bookkeeping_review_correction_links enable row level security;

do $$ declare table_name text; begin foreach table_name in array array[
  'business_review_cadence_events','bookkeeping_review_periods','bookkeeping_review_snapshots',
  'bookkeeping_review_snapshot_items','bookkeeping_review_period_events','bookkeeping_review_correction_links']
loop execute format('create policy %I on public.%I for select to authenticated using (exists(select 1 from public.businesses business where business.id=business_id and business.owner_user_id=(select auth.uid())))',table_name||'_select_own',table_name); end loop; end $$;

grant select on public.business_review_cadence_events,public.current_business_review_cadence,
  public.bookkeeping_review_periods,public.bookkeeping_review_snapshots,
  public.bookkeeping_review_snapshot_items,public.bookkeeping_review_period_events,
  public.bookkeeping_review_correction_links to authenticated,service_role;
grant insert on public.business_review_cadence_events,public.bookkeeping_review_periods,
  public.bookkeeping_review_snapshots,public.bookkeeping_review_snapshot_items,
  public.bookkeeping_review_period_events,public.bookkeeping_review_correction_links to service_role;
revoke execute on function public.set_business_review_cadence(smallint,text,date,uuid) from public,anon;
grant execute on function public.set_business_review_cadence(smallint,text,date,uuid) to authenticated;
revoke execute on function public.append_customer_review_period_event(uuid,uuid,text,uuid,timestamptz,uuid) from public,anon;
grant execute on function public.append_customer_review_period_event(uuid,uuid,text,uuid,timestamptz,uuid) to authenticated;
revoke execute on function public.present_bookkeeping_weekly_review(uuid,uuid,uuid,text,text,bigint,bigint,integer,text,jsonb) from public,anon,authenticated;
grant execute on function public.present_bookkeeping_weekly_review(uuid,uuid,uuid,text,text,bigint,bigint,integer,text,jsonb) to service_role;
revoke execute on function public.link_weekly_review_correction(uuid,uuid,uuid,uuid,uuid,uuid) from public,anon;
grant execute on function public.link_weekly_review_correction(uuid,uuid,uuid,uuid,uuid,uuid) to authenticated;

comment on table public.bookkeeping_review_periods is
  'Stable Business-selected cadence periods. A row exists only for a week with relevant activity.';
comment on table public.bookkeeping_review_snapshots is
  'Immutable period-level presentation confirmed by a customer; never transaction-by-transaction approval.';

-- Extend the existing exact-cent record correction to receipt-only expenses.
-- Imported financial source behavior and compound component behavior are unchanged.
create or replace function public.correct_compound_bookkeeping_record_use(
  p_bookkeeping_record_id uuid, p_expected_current_decision_id uuid,
  p_correction_request_id uuid, p_answer jsonb
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare selected_business_id uuid; selected_record public.bookkeeping_records%rowtype;
  current_decision public.bookkeeping_decisions%rowtype; new_decision public.bookkeeping_decisions%rowtype;
  existing_decision public.bookkeeping_decisions%rowtype; answer_keys text[]; answer_use text;
  personal_magnitude bigint; signed_personal bigint; signed_business bigint; preserved_category text;
begin
  select id into selected_business_id from public.businesses where owner_user_id=(select auth.uid());
  if selected_business_id is null then raise exception 'Business was not found'; end if;
  select * into existing_decision from public.bookkeeping_decisions where business_id=selected_business_id
    and correction_request_id=p_correction_request_id;
  if found then return jsonb_build_object('decision_id',existing_decision.id,
    'bookkeeping_record_id',existing_decision.bookkeeping_record_id,'idempotent',true); end if;
  select record.* into selected_record from public.bookkeeping_records record
  where record.id=p_bookkeeping_record_id and record.business_id=selected_business_id and
    (record.source_kind='receipt' or exists(select 1 from public.current_bookkeeping_compound_components component
      where component.bookkeeping_record_id=record.id and component.business_id=record.business_id));
  if not found then raise exception 'Correctable canonical record was not found for this Business'; end if;
  perform pg_advisory_xact_lock(hashtextextended('bookkeeping-record:'||selected_record.id::text,0));
  select * into current_decision from public.bookkeeping_decisions decision where decision.business_id=selected_business_id
    and decision.bookkeeping_record_id=selected_record.id and not exists(select 1 from public.bookkeeping_decisions successor
      where successor.supersedes_decision_id=decision.id) for update;
  if current_decision.id is distinct from p_expected_current_decision_id then raise exception 'stale current bookkeeping decision'; end if;
  if current_decision.bookkeeping_nature is distinct from 'expense' then raise exception 'Only established purchases can use this factual correction'; end if;
  select array_agg(key order by key) into answer_keys from jsonb_object_keys(p_answer) key;answer_use:=p_answer->>'use';
  if answer_use in('business','personal') then
    if answer_keys is distinct from array['schemaVersion','use']::text[] or p_answer->>'schemaVersion'<>'1' then raise exception 'Correction contains unsupported fields';end if;
  elsif answer_use='mixed' then
    if answer_keys is distinct from array['personalAmountCents','schemaVersion','use']::text[] or p_answer->>'schemaVersion'<>'1' then raise exception 'Correction contains unsupported fields';end if;
    begin personal_magnitude:=(p_answer->>'personalAmountCents')::bigint;exception when others then raise exception 'Personal amount must be whole cents';end;
    if personal_magnitude<=0 or personal_magnitude>=abs(selected_record.amount_cents) then raise exception 'Personal amount must be between zero and the transaction total';end if;
  else raise exception 'Correction use is invalid';end if;
  select allocation.tax_category_key into preserved_category from public.bookkeeping_allocations allocation
    where allocation.bookkeeping_decision_id=current_decision.id and allocation.allocation_kind='business'
      and allocation.tax_category_key is not null limit 1;
  insert into public.bookkeeping_decisions(business_id,bookkeeping_record_id,supersedes_decision_id,bookkeeping_nature,
    treatment,review_status,provenance,actor_user_id,reason,business_purpose,correction_request_id)
  values(selected_business_id,selected_record.id,current_decision.id,'expense',case when answer_use='mixed' then 'mixed_use' else answer_use end,
    'resolved','user',(select auth.uid()),case answer_use when 'business' then 'Customer clarified that this purchase was for the business.'
      when 'personal' then 'Customer clarified that this purchase was personal.' else 'Customer clarified the personal portion of this purchase.' end,
    current_decision.business_purpose,p_correction_request_id) returning * into new_decision;
  if answer_use='business' then insert into public.bookkeeping_allocations(business_id,bookkeeping_record_id,bookkeeping_decision_id,allocation_kind,amount_cents,tax_category_key)
    values(selected_business_id,selected_record.id,new_decision.id,'business',selected_record.amount_cents,preserved_category);
  elsif answer_use='personal' then insert into public.bookkeeping_allocations(business_id,bookkeeping_record_id,bookkeeping_decision_id,allocation_kind,amount_cents)
    values(selected_business_id,selected_record.id,new_decision.id,'personal',selected_record.amount_cents);
  else signed_personal:=sign(selected_record.amount_cents)*personal_magnitude;signed_business:=selected_record.amount_cents-signed_personal;
    insert into public.bookkeeping_allocations(business_id,bookkeeping_record_id,bookkeeping_decision_id,allocation_kind,amount_cents,tax_category_key)
    values(selected_business_id,selected_record.id,new_decision.id,'business',signed_business,preserved_category),
      (selected_business_id,selected_record.id,new_decision.id,'personal',signed_personal,null);end if;
  return jsonb_build_object('decision_id',new_decision.id,'bookkeeping_record_id',selected_record.id,'idempotent',false);
end $$;

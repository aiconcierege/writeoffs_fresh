-- Retain the narrow customer fact missing from supported business-meal records.
-- Business purpose remains canonical on bookkeeping_decisions; transaction and
-- receipt evidence remain authoritative for date, amount, merchant, and place.

insert into public.categories(key,label) values('meals','Business meals') on conflict(key) do nothing;

create table public.bookkeeping_meal_substantiation_facts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  bookkeeping_record_id uuid not null,
  supersedes_fact_id uuid,
  attendee_relationship text not null,
  provenance text not null default 'user',
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint bookkeeping_meal_facts_id_scope_unique unique(id,business_id,bookkeeping_record_id),
  constraint bookkeeping_meal_facts_record_fkey foreign key(bookkeeping_record_id,business_id)
    references public.bookkeeping_records(id,business_id) on delete restrict,
  constraint bookkeeping_meal_facts_predecessor_fkey foreign key(supersedes_fact_id,business_id,bookkeeping_record_id)
    references public.bookkeeping_meal_substantiation_facts(id,business_id,bookkeeping_record_id) on delete restrict,
  constraint bookkeeping_meal_facts_text_check check(length(btrim(attendee_relationship)) between 1 and 1000),
  constraint bookkeeping_meal_facts_provenance_check check(provenance='user'),
  constraint bookkeeping_meal_facts_no_self_check check(supersedes_fact_id is null or supersedes_fact_id<>id)
);
create unique index bookkeeping_meal_facts_one_initial_idx on public.bookkeeping_meal_substantiation_facts(bookkeeping_record_id)
  where supersedes_fact_id is null;
create unique index bookkeeping_meal_facts_one_successor_idx on public.bookkeeping_meal_substantiation_facts(supersedes_fact_id)
  where supersedes_fact_id is not null;
alter table public.bookkeeping_meal_substantiation_facts enable row level security;
create policy bookkeeping_meal_facts_select_own on public.bookkeeping_meal_substantiation_facts for select to authenticated
  using(exists(select 1 from public.businesses b where b.id=business_id and b.owner_user_id=(select auth.uid())));
revoke all on public.bookkeeping_meal_substantiation_facts from public,anon,authenticated,service_role;
grant select on public.bookkeeping_meal_substantiation_facts to authenticated,service_role;

create view public.current_bookkeeping_meal_substantiation_facts
with (security_invoker=true,security_barrier=true) as
select f.id,f.business_id,f.bookkeeping_record_id,f.supersedes_fact_id,
  f.attendee_relationship,f.provenance,f.actor_user_id,f.created_at
from public.bookkeeping_meal_substantiation_facts f
where not exists(select 1 from public.bookkeeping_meal_substantiation_facts s where s.supersedes_fact_id=f.id);
revoke all on public.current_bookkeeping_meal_substantiation_facts from public,anon,authenticated,service_role;
grant select on public.current_bookkeeping_meal_substantiation_facts to authenticated,service_role;

create or replace function public.reject_meal_substantiation_mutation() returns trigger
language plpgsql set search_path='' as $$ begin raise exception 'meal substantiation facts are append-only'; end $$;
create trigger bookkeeping_meal_facts_no_mutation before update or delete on public.bookkeeping_meal_substantiation_facts
for each row execute function public.reject_meal_substantiation_mutation();

-- Idempotently project only supported, current business-meal records whose
-- purpose is already known and whose attendee/relationship fact is still absent.
create or replace function public.ensure_current_meal_substantiation_questions()
returns integer language plpgsql security definer set search_path='' as $$
declare selected_business_id uuid; candidate record; opened_count integer:=0; selected_id uuid;
begin
  if (select auth.uid()) is null then raise exception 'authentication required'; end if;
  select id into selected_business_id from public.businesses where owner_user_id=(select auth.uid());
  if selected_business_id is null then raise exception 'Business is unavailable'; end if;
  for candidate in
    select d.id decision_id,d.bookkeeping_record_id
    from public.bookkeeping_decisions d
    where d.business_id=selected_business_id and d.bookkeeping_nature='expense'
      and d.treatment in ('business','mixed_use') and nullif(btrim(d.business_purpose),'') is not null
      and not exists(select 1 from public.bookkeeping_decisions s where s.supersedes_decision_id=d.id)
      and exists(select 1 from public.bookkeeping_allocations a where a.bookkeeping_decision_id=d.id
        and a.business_id=d.business_id and a.bookkeeping_record_id=d.bookkeeping_record_id
        and a.allocation_kind='business' and a.amount_cents<>0
        and a.tax_category_key in ('meals','business-meals','tax.business-meals'))
      and not exists(select 1 from public.current_bookkeeping_meal_substantiation_facts f
        where f.business_id=d.business_id and f.bookkeeping_record_id=d.bookkeeping_record_id)
      and not exists(select 1 from public.bookkeeping_review_events e
        where e.business_id=d.business_id and e.bookkeeping_record_id=d.bookkeeping_record_id
          and e.issue_key='meal-attendee:'||d.bookkeeping_record_id::text
          and not exists(select 1 from public.bookkeeping_review_events s where s.supersedes_event_id=e.id)
          and e.event_type in ('opened','skipped','reopened'))
  loop
    selected_id:=public.open_bookkeeping_review_issue_v2(selected_business_id,candidate.bookkeeping_record_id,
      candidate.decision_id,'BUSINESS_PURPOSE_NEEDED','meal-attendee:'||candidate.bookkeeping_record_id::text,
      md5(candidate.decision_id::text||':meal-attendee'),
      jsonb_build_object('schemaVersion',1,'reason','BUSINESS_PURPOSE_NEEDED','factType','meal_attendee_relationship'));
    if selected_id is not null then opened_count:=opened_count+1; end if;
  end loop;
  return opened_count;
end $$;

create or replace function public.answer_bookkeeping_meal_substantiation_issue(
  p_review_issue_id uuid,p_expected_current_event_id uuid,p_expected_current_decision_id uuid,
  p_expected_context_fingerprint text,p_expected_evidence_fingerprint text,p_attendee_relationship text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.bookkeeping_review_events%rowtype; d public.bookkeeping_decisions%rowtype;
  copied jsonb; new_decision uuid; fact_id uuid; answered uuid; resolved uuid; clean_text text:=btrim(p_attendee_relationship);
begin
  if (select auth.uid()) is null then raise exception 'authentication required'; end if;
  if length(clean_text) not between 1 and 1000 then raise exception 'meal attendee information must be between 1 and 1000 characters'; end if;
  select * into e from public.bookkeeping_review_events where id=p_expected_current_event_id
    and review_issue_id=p_review_issue_id for update;
  if not found or exists(select 1 from public.bookkeeping_review_events s where s.supersedes_event_id=e.id)
    or e.event_type not in ('opened','skipped','reopened') then raise exception 'current review event changed'; end if;
  if not exists(select 1 from public.businesses b where b.id=e.business_id and b.owner_user_id=(select auth.uid()))
    then raise exception 'review issue is unavailable to the authenticated user'; end if;
  if e.context_fingerprint<>p_expected_context_fingerprint
    or e.evidence_fingerprint is distinct from p_expected_evidence_fingerprint
    or e.question_context->>'factType'<>'meal_attendee_relationship'
    or public.current_bookkeeping_evidence_fingerprint(e.business_id,e.bookkeeping_record_id) is distinct from e.evidence_fingerprint
    then raise exception 'trusted meal context changed'; end if;
  perform pg_advisory_xact_lock(hashtextextended(e.bookkeeping_record_id::text,41));
  select * into d from public.bookkeeping_decisions x where x.id=p_expected_current_decision_id
    and x.business_id=e.business_id and x.bookkeeping_record_id=e.bookkeeping_record_id
    and not exists(select 1 from public.bookkeeping_decisions s where s.supersedes_decision_id=x.id) for update;
  if not found or d.id<>e.based_on_decision_id or d.bookkeeping_nature<>'expense'
    or d.treatment not in ('business','mixed_use') or nullif(btrim(d.business_purpose),'') is null
    then raise exception 'current meal decision changed'; end if;
  -- The trusted issue opener establishes meal context from either a canonical
  -- meal allocation or the separately retained receipt-candidate evidence.
  if exists(select 1 from public.current_bookkeeping_meal_substantiation_facts f where f.business_id=e.business_id
    and f.bookkeeping_record_id=e.bookkeeping_record_id) then raise exception 'meal attendee information already exists'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('kind',a.allocation_kind,'amount_cents',a.amount_cents,
    'tax_category_key',a.tax_category_key,'memo',a.memo) order by a.id),'[]'::jsonb) into copied
    from public.bookkeeping_allocations a where a.bookkeeping_decision_id=d.id;
  new_decision:=public.append_bookkeeping_decision(e.business_id,e.bookkeeping_record_id,d.id,d.bookkeeping_nature,
    d.treatment,'resolved','user',null,d.reason,d.business_purpose,copied);
  insert into public.bookkeeping_meal_substantiation_facts(business_id,bookkeeping_record_id,attendee_relationship,actor_user_id)
    values(e.business_id,e.bookkeeping_record_id,clean_text,(select auth.uid())) returning id into fact_id;
  insert into public.bookkeeping_review_events(business_id,bookkeeping_record_id,review_issue_id,supersedes_event_id,
    sequence_number,event_type,reason,based_on_decision_id,issue_key,context_fingerprint,evidence_fingerprint,
    question_context,answer_payload,resulting_decision_id,provenance,actor_user_id)
    values(e.business_id,e.bookkeeping_record_id,e.review_issue_id,e.id,e.sequence_number+1,'answered',e.reason,d.id,
    e.issue_key,e.context_fingerprint,e.evidence_fingerprint,e.question_context,
    jsonb_build_object('schemaVersion',1,'attendeeRelationship',clean_text),new_decision,'user',(select auth.uid())) returning id into answered;
  insert into public.bookkeeping_review_events(business_id,bookkeeping_record_id,review_issue_id,supersedes_event_id,
    sequence_number,event_type,reason,based_on_decision_id,issue_key,context_fingerprint,evidence_fingerprint,
    question_context,resulting_decision_id,provenance)
    values(e.business_id,e.bookkeeping_record_id,e.review_issue_id,answered,e.sequence_number+2,'resolved',e.reason,d.id,
    e.issue_key,e.context_fingerprint,e.evidence_fingerprint,e.question_context,new_decision,'system') returning id into resolved;
  return jsonb_build_object('business_id',e.business_id,'decision_id',new_decision,'fact_id',fact_id,
    'answered_event_id',answered,'resolved_event_id',resolved);
end $$;

create or replace function public.correct_bookkeeping_meal_substantiation(
  p_fact_id uuid,p_expected_current_fact_id uuid,p_attendee_relationship text
) returns uuid language plpgsql security definer set search_path='' as $$
declare current_fact public.bookkeeping_meal_substantiation_facts%rowtype; inserted uuid; clean_text text:=btrim(p_attendee_relationship);
begin
  if (select auth.uid()) is null then raise exception 'authentication required'; end if;
  if p_fact_id<>p_expected_current_fact_id or length(clean_text) not between 1 and 1000 then raise exception 'invalid correction'; end if;
  select * into current_fact from public.bookkeeping_meal_substantiation_facts f where f.id=p_expected_current_fact_id
    and not exists(select 1 from public.bookkeeping_meal_substantiation_facts s where s.supersedes_fact_id=f.id) for update;
  if not found or not exists(select 1 from public.businesses b where b.id=current_fact.business_id
    and b.owner_user_id=(select auth.uid())) then raise exception 'meal fact is unavailable'; end if;
  insert into public.bookkeeping_meal_substantiation_facts(business_id,bookkeeping_record_id,supersedes_fact_id,
    attendee_relationship,actor_user_id) values(current_fact.business_id,current_fact.bookkeeping_record_id,current_fact.id,
    clean_text,(select auth.uid())) returning id into inserted;
  return inserted;
end $$;

revoke all on function public.ensure_current_meal_substantiation_questions() from public,anon,service_role;
revoke all on function public.answer_bookkeeping_meal_substantiation_issue(uuid,uuid,uuid,text,text,text) from public,anon,service_role;
revoke all on function public.correct_bookkeeping_meal_substantiation(uuid,uuid,text) from public,anon,service_role;
grant execute on function public.ensure_current_meal_substantiation_questions() to authenticated;
grant execute on function public.answer_bookkeeping_meal_substantiation_issue(uuid,uuid,uuid,text,text,text) to authenticated;
grant execute on function public.correct_bookkeeping_meal_substantiation(uuid,uuid,text) to authenticated;

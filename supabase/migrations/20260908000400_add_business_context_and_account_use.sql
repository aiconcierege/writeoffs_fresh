-- Customer-authored account use and derived business context are separate from
-- economic nature, allocation, substantiation, and tax treatment.

create table public.financial_account_use_events(
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  financial_account_id uuid not null,
  designation text not null check(designation in('business_only','business_and_personal')),
  effective_at timestamptz not null,
  supersedes_event_id uuid,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  request_id uuid not null,
  created_at timestamptz not null default now(),
  unique(id,business_id,financial_account_id),
  foreign key(financial_account_id,business_id) references public.financial_accounts(id,business_id) on delete restrict,
  foreign key(supersedes_event_id,business_id,financial_account_id)
    references public.financial_account_use_events(id,business_id,financial_account_id) on delete restrict,
  unique(business_id,request_id)
);
create unique index financial_account_use_one_root_idx on public.financial_account_use_events(financial_account_id)
  where supersedes_event_id is null;
create unique index financial_account_use_one_successor_idx on public.financial_account_use_events(supersedes_event_id)
  where supersedes_event_id is not null;
create view public.current_financial_account_use with(security_invoker=true,security_barrier=true) as
select e.* from public.financial_account_use_events e where not exists(
  select 1 from public.financial_account_use_events successor where successor.supersedes_event_id=e.id);

create table public.bookkeeping_business_context_assessments(
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  bookkeeping_record_id uuid not null,
  supersedes_assessment_id uuid,
  assessment_state text not null check(assessment_state in('established','unknown','conflicting','customer_authoritative')),
  assessment_basis text not null check(assessment_basis in('customer_correction','account_business_only','customer_receipt','none')),
  economic_context text check(economic_context is null or economic_context in('ordinary_expense','restaurant_meal','telecom_service')),
  evaluator_version text not null,
  evidence_fingerprint text not null check(evidence_fingerprint~'^[a-f0-9]{64}$'),
  evidence_references jsonb not null check(jsonb_typeof(evidence_references)='array'),
  created_at timestamptz not null default now(),
  unique(id,business_id,bookkeeping_record_id),
  foreign key(bookkeeping_record_id,business_id) references public.bookkeeping_records(id,business_id) on delete restrict,
  foreign key(supersedes_assessment_id,business_id,bookkeeping_record_id)
    references public.bookkeeping_business_context_assessments(id,business_id,bookkeeping_record_id) on delete restrict
);
create unique index bookkeeping_business_context_one_root_idx
  on public.bookkeeping_business_context_assessments(bookkeeping_record_id) where supersedes_assessment_id is null;
create unique index bookkeeping_business_context_one_successor_idx
  on public.bookkeeping_business_context_assessments(supersedes_assessment_id) where supersedes_assessment_id is not null;
create view public.current_bookkeeping_business_context with(security_invoker=true,security_barrier=true) as
select a.* from public.bookkeeping_business_context_assessments a where not exists(
  select 1 from public.bookkeeping_business_context_assessments successor where successor.supersedes_assessment_id=a.id);

create trigger financial_account_use_events_immutable before update or delete on public.financial_account_use_events
  for each row execute function public.reject_canonical_bookkeeping_mutation();
create trigger bookkeeping_business_context_immutable before update or delete on public.bookkeeping_business_context_assessments
  for each row execute function public.reject_canonical_bookkeeping_mutation();

alter table public.financial_account_use_events enable row level security;
alter table public.bookkeeping_business_context_assessments enable row level security;
create policy financial_account_use_select_own on public.financial_account_use_events for select to authenticated
  using(exists(select 1 from public.businesses b where b.id=business_id and b.owner_user_id=(select auth.uid())));
create policy bookkeeping_business_context_select_own on public.bookkeeping_business_context_assessments for select to authenticated
  using(exists(select 1 from public.businesses b where b.id=business_id and b.owner_user_id=(select auth.uid())));
grant select on public.financial_account_use_events,public.current_financial_account_use,
  public.bookkeeping_business_context_assessments,public.current_bookkeeping_business_context to authenticated,service_role;
grant insert on public.financial_account_use_events,public.bookkeeping_business_context_assessments to service_role;

create or replace function public.set_financial_account_use(
  p_financial_account_id uuid,p_designation text,p_effective_at timestamptz,p_request_id uuid
) returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=(select auth.uid()); selected_business uuid; current_event public.financial_account_use_events%rowtype;
  inserted uuid; affected record;
begin
  if actor is null then raise exception 'authentication required'; end if;
  if p_designation not in('business_only','business_and_personal') or p_effective_at is null or p_request_id is null
    then raise exception 'account use request is invalid'; end if;
  select a.business_id into selected_business from public.financial_accounts a join public.businesses b on b.id=a.business_id
    where a.id=p_financial_account_id and b.owner_user_id=actor and a.archived_at is null;
  if selected_business is null then raise exception 'financial account is unavailable'; end if;
  perform pg_advisory_xact_lock(hashtextextended('account-use:'||p_financial_account_id::text,0));
  select id into inserted from public.financial_account_use_events where business_id=selected_business and request_id=p_request_id;
  if inserted is not null then return inserted; end if;
  select * into current_event from public.financial_account_use_events e where e.business_id=selected_business
    and e.financial_account_id=p_financial_account_id and not exists(select 1 from public.financial_account_use_events s
      where s.supersedes_event_id=e.id) for update;
  if current_event.id is not null and current_event.designation=p_designation
    and current_event.effective_at=p_effective_at then return current_event.id; end if;
  insert into public.financial_account_use_events(business_id,financial_account_id,designation,effective_at,
    supersedes_event_id,actor_user_id,request_id) values(selected_business,p_financial_account_id,p_designation,
    p_effective_at,current_event.id,actor,p_request_id) returning id into inserted;
  for affected in select distinct fs.bookkeeping_record_id from public.financial_transactions ft
    join public.bookkeeping_financial_sources fs on fs.financial_transaction_id=ft.id and fs.business_id=ft.business_id
      and fs.revoked_at is null where ft.business_id=selected_business and ft.financial_account_id=p_financial_account_id loop
    perform public.request_bookkeeping_processing(selected_business,affected.bookkeeping_record_id,'business_context_changed',
      'bookkeeping-business-context:v1:account-use:'||inserted::text||':record:'||affected.bookkeeping_record_id::text);
  end loop;
  return inserted;
end $$;
revoke execute on function public.set_financial_account_use(uuid,text,timestamptz,uuid) from public,anon,service_role;
grant execute on function public.set_financial_account_use(uuid,text,timestamptz,uuid) to authenticated;

create or replace function public.record_bookkeeping_business_context_assessment(
  p_business_id uuid,p_bookkeeping_record_id uuid,p_assessment_state text,p_assessment_basis text,
  p_economic_context text,p_evaluator_version text,p_evidence_fingerprint text,p_evidence_references jsonb
) returns uuid language plpgsql security definer set search_path='' as $$
declare current_assessment public.bookkeeping_business_context_assessments%rowtype; inserted uuid;
begin
  if (select auth.role())<>'service_role' then raise exception 'trusted bookkeeping worker required'; end if;
  if p_assessment_state not in('established','unknown','conflicting','customer_authoritative')
    or p_assessment_basis not in('customer_correction','account_business_only','customer_receipt','none')
    or p_evaluator_version<>'bookkeeping-business-context:v1' or p_evidence_fingerprint!~'^[a-f0-9]{64}$'
    or jsonb_typeof(p_evidence_references)<>'array' then raise exception 'business context assessment is invalid'; end if;
  perform pg_advisory_xact_lock(hashtextextended('business-context:'||p_bookkeeping_record_id::text,0));
  select * into current_assessment from public.bookkeeping_business_context_assessments a where a.business_id=p_business_id
    and a.bookkeeping_record_id=p_bookkeeping_record_id and not exists(
      select 1 from public.bookkeeping_business_context_assessments s where s.supersedes_assessment_id=a.id) for update;
  if current_assessment.id is not null and current_assessment.evidence_fingerprint=p_evidence_fingerprint
    and current_assessment.assessment_state=p_assessment_state and current_assessment.assessment_basis=p_assessment_basis
    and current_assessment.economic_context is not distinct from p_economic_context then return current_assessment.id; end if;
  insert into public.bookkeeping_business_context_assessments(business_id,bookkeeping_record_id,supersedes_assessment_id,
    assessment_state,assessment_basis,economic_context,evaluator_version,evidence_fingerprint,evidence_references)
  values(p_business_id,p_bookkeeping_record_id,current_assessment.id,p_assessment_state,p_assessment_basis,
    p_economic_context,p_evaluator_version,p_evidence_fingerprint,p_evidence_references) returning id into inserted;
  return inserted;
end $$;
revoke execute on function public.record_bookkeeping_business_context_assessment(uuid,uuid,text,text,text,text,text,jsonb)
  from public,anon,authenticated;
grant execute on function public.record_bookkeeping_business_context_assessment(uuid,uuid,text,text,text,text,text,jsonb)
  to service_role;

-- Account-use and receipt-link changes are part of the evidence fingerprint so
-- stale question leaves fail closed without rewriting their history.
create or replace function public.current_bookkeeping_evidence_fingerprint(p_business_id uuid,p_bookkeeping_record_id uuid)
returns text language sql stable security definer set search_path='' as $$
  select md5(concat_ws('|',r.id::text,coalesce(r.amount_cents::text,'unknown'),r.currency,
    coalesce((select string_agg(concat_ws(':',fs.id,ft.id,ft.amount_cents,ft.currency,
      coalesce(au.id::text,'no-account-use'),coalesce(au.designation,'unknown')),'|' order by fs.id)
      from public.bookkeeping_financial_sources fs join public.financial_transactions ft on ft.id=fs.financial_transaction_id
       and ft.business_id=fs.business_id left join public.current_financial_account_use au
       on au.financial_account_id=ft.financial_account_id and au.business_id=ft.business_id
      where fs.business_id=p_business_id and fs.bookkeeping_record_id=p_bookkeeping_record_id and fs.revoked_at is null),'no-financial-source'),
    coalesce((select string_agg(concat_ws(':',l.id,l.receipt_id,l.provenance,
      coalesce(extract(epoch from l.revoked_at)::text,'active'),coalesce(u.id::text,'not-customer-provided')),'|' order by l.id)
      from public.bookkeeping_document_links l left join lateral(select e.id from public.bookkeeping_receipt_events e
        where e.receipt_id=l.receipt_id and e.business_id=l.business_id and e.event_type='uploaded'
          and e.provenance='user' and e.actor_user_id is not null order by e.created_at limit 1)u on true
      where l.business_id=p_business_id and l.bookkeeping_record_id=p_bookkeeping_record_id),'no-documents')))
  from public.bookkeeping_records r where r.id=p_bookkeeping_record_id and r.business_id=p_business_id;
$$;

create or replace function public.enqueue_business_context_for_document_link() returns trigger language plpgsql
security definer set search_path='' as $$ begin
  perform public.request_bookkeeping_processing(new.business_id,new.bookkeeping_record_id,'business_context_changed',
    'bookkeeping-business-context:v1:document-link:'||new.id::text||':'||coalesce(extract(epoch from new.revoked_at)::text,'active'));
  return new;
end $$;
create trigger bookkeeping_document_links_enqueue_business_context after insert or update of revoked_at
  on public.bookkeeping_document_links for each row execute function public.enqueue_business_context_for_document_link();

-- Meal substantiation can be supported by account context even when there is
-- no receipt-meal candidate. It retains the same multi-fact reassessment flow.
create or replace function public.answer_bookkeeping_business_context_meal_issue(
  p_review_issue_id uuid,p_expected_current_event_id uuid,p_expected_current_decision_id uuid,
  p_expected_context_fingerprint text,p_expected_evidence_fingerprint text,p_answer text,
  p_understanding_version text,p_extracted_attendee_relationship text,p_extracted_business_purpose text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.bookkeeping_review_events%rowtype; d public.bookkeeping_decisions%rowtype;
  assessment public.bookkeeping_business_context_assessments%rowtype; copied jsonb; new_decision uuid;
  fact_id uuid; answered uuid; resolved uuid; follow_up uuid; clean text:=btrim(p_answer);
  attendee text:=nullif(btrim(p_extracted_attendee_relationship),'');
  purpose text:=nullif(btrim(p_extracted_business_purpose),''); next_fact text;
begin
  if (select auth.uid()) is null then raise exception 'authentication required'; end if;
  if length(clean) not between 1 and 1000 or p_understanding_version<>'meal-answer-understanding:v1'
    or (attendee is not null and position(attendee in clean)=0)
    or (purpose is not null and position(purpose in clean)=0) then raise exception 'invalid meal answer understanding'; end if;
  select * into e from public.bookkeeping_review_events where id=p_expected_current_event_id
    and review_issue_id=p_review_issue_id;
  if not exists(select 1 from public.businesses b where b.id=e.business_id and b.owner_user_id=(select auth.uid()))
    then raise exception 'review issue is unavailable to the authenticated user'; end if;
  perform pg_advisory_xact_lock(hashtextextended(e.bookkeeping_record_id::text,41));
  select * into e from public.bookkeeping_review_events where id=p_expected_current_event_id
    and review_issue_id=p_review_issue_id for update;
  if not found or e.event_type not in('opened','skipped','reopened')
    or exists(select 1 from public.bookkeeping_review_events s where s.supersedes_event_id=e.id)
    or e.reason<>'BUSINESS_PURPOSE_NEEDED' or e.context_fingerprint<>p_expected_context_fingerprint
    or e.evidence_fingerprint is distinct from p_expected_evidence_fingerprint
    or e.question_context->>'factType'<>'meal_attendee_relationship'
    or public.current_bookkeeping_evidence_fingerprint(e.business_id,e.bookkeeping_record_id)
      is distinct from e.evidence_fingerprint then raise exception 'trusted meal context changed'; end if;
  select * into assessment from public.current_bookkeeping_business_context a
    where a.id=(e.question_context->>'businessContextAssessmentId')::uuid and a.business_id=e.business_id
      and a.bookkeeping_record_id=e.bookkeeping_record_id and a.assessment_state='established'
      and a.economic_context='restaurant_meal';
  if not found then raise exception 'business context changed'; end if;
  select * into d from public.bookkeeping_decisions x where x.id=p_expected_current_decision_id
    and x.business_id=e.business_id and x.bookkeeping_record_id=e.bookkeeping_record_id
    and not exists(select 1 from public.bookkeeping_decisions s where s.supersedes_decision_id=x.id) for update;
  if not found or d.id<>e.based_on_decision_id or d.bookkeeping_nature<>'expense'
    or d.treatment not in('business','mixed_use') then raise exception 'current meal decision changed'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('kind',a.allocation_kind,'amount_cents',a.amount_cents,
    'tax_category_key',case when a.allocation_kind='business' then coalesce(a.tax_category_key,'meals') else a.tax_category_key end,
    'memo',a.memo) order by a.id),'[]'::jsonb) into copied from public.bookkeeping_allocations a
    where a.bookkeeping_decision_id=d.id;
  if attendee is null then next_fact:='meal_attendee_relationship';
  elsif purpose is null and nullif(btrim(d.business_purpose),'') is null then next_fact:='receipt_meal_business_purpose';
  else next_fact:=null; end if;
  new_decision:=public.append_bookkeeping_decision(e.business_id,e.bookkeeping_record_id,d.id,'expense',d.treatment,
    case when next_fact is null then 'resolved' else 'needs_review' end,'user',null,
    'Customer supplied meal substantiation facts.',coalesce(purpose,d.business_purpose),copied);
  if attendee is not null then insert into public.bookkeeping_meal_substantiation_facts(
    business_id,bookkeeping_record_id,attendee_relationship,actor_user_id)
    values(e.business_id,e.bookkeeping_record_id,attendee,(select auth.uid())) returning id into fact_id; end if;
  insert into public.bookkeeping_review_events(business_id,bookkeeping_record_id,review_issue_id,supersedes_event_id,
    sequence_number,event_type,reason,based_on_decision_id,issue_key,context_fingerprint,evidence_fingerprint,
    question_context,answer_payload,resulting_decision_id,provenance,actor_user_id)
  values(e.business_id,e.bookkeeping_record_id,e.review_issue_id,e.id,e.sequence_number+1,'answered',e.reason,d.id,e.issue_key,
    e.context_fingerprint,e.evidence_fingerprint,e.question_context,jsonb_build_object('schemaVersion',1,'answer',clean,
      'understandingVersion',p_understanding_version,'attendeeRelationship',attendee,'businessPurpose',purpose),
    new_decision,'user',(select auth.uid())) returning id into answered;
  insert into public.bookkeeping_review_events(business_id,bookkeeping_record_id,review_issue_id,supersedes_event_id,
    sequence_number,event_type,reason,based_on_decision_id,issue_key,context_fingerprint,evidence_fingerprint,
    question_context,resulting_decision_id,provenance)
  values(e.business_id,e.bookkeeping_record_id,e.review_issue_id,answered,e.sequence_number+2,'resolved',e.reason,d.id,e.issue_key,
    e.context_fingerprint,e.evidence_fingerprint,e.question_context,new_decision,'system') returning id into resolved;
  if next_fact is not null then follow_up:=public.open_bookkeeping_review_issue_v2(e.business_id,e.bookkeeping_record_id,
    new_decision,'BUSINESS_PURPOSE_NEEDED',case when next_fact='meal_attendee_relationship' then 'meal-attendee:' else 'meal-purpose:' end
      ||e.bookkeeping_record_id::text||':after:'||answered::text,
    md5(new_decision::text||':'||next_fact||':'||assessment.id::text),jsonb_build_object('schemaVersion',1,
      'routingVersion','bookkeeping-business-context:v1','understandingVersion',p_understanding_version,
      'reason','BUSINESS_PURPOSE_NEEDED','factType',next_fact,'businessContextAssessmentId',assessment.id,
      'establishedFacts',case when attendee is not null then jsonb_build_array('purchase','meal','attendees')
        when purpose is not null then jsonb_build_array('purchase','meal','businessPurpose')
        else jsonb_build_array('purchase','meal','businessContext') end)); end if;
  return jsonb_build_object('business_id',e.business_id,'decision_id',new_decision,'fact_id',fact_id,
    'answered_event_id',answered,'resolved_event_id',resolved,'follow_up_event_id',follow_up,'remaining_fact_type',next_fact);
end $$;
revoke execute on function public.answer_bookkeeping_business_context_meal_issue(
  uuid,uuid,uuid,text,text,text,text,text,text) from public,anon,service_role;
grant execute on function public.answer_bookkeeping_business_context_meal_issue(
  uuid,uuid,uuid,text,text,text,text,text,text) to authenticated;

-- Bounded reusable facts and attention signals for shared-use and special-treatment
-- deductions. These facts never create a deduction by themselves.

create table public.deduction_business_fact_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  fact_type text not null,
  scope_kind text not null,
  scope_key text not null,
  fact_value jsonb not null,
  effective_on date,
  supersedes_event_id uuid,
  provenance text not null default 'user',
  source text not null,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  reason text not null,
  request_key text not null,
  created_at timestamptz not null default now(),
  constraint deduction_fact_identity_unique unique(id,business_id,fact_type,scope_kind,scope_key),
  constraint deduction_fact_predecessor_fkey foreign key
    (supersedes_event_id,business_id,fact_type,scope_kind,scope_key)
    references public.deduction_business_fact_events(id,business_id,fact_type,scope_kind,scope_key) on delete restrict,
  constraint deduction_fact_type_check check(fact_type in (
    'phone_business_use_percentage','internet_business_use_percentage',
    'home_office_regular_use','home_office_exclusive_use','home_office_square_feet',
    'home_total_square_feet','equipment_business_use_percentage',
    'equipment_placed_in_service_date','recurring_shared_expense_context')),
  constraint deduction_fact_scope_check check(scope_kind in ('business','merchant','bookkeeping_record')),
  constraint deduction_fact_scope_key_check check(length(btrim(scope_key)) between 1 and 200),
  constraint deduction_fact_provenance_check check(provenance='user'),
  constraint deduction_fact_source_check check(source in ('question','deduction_profile','correction')),
  constraint deduction_fact_reason_check check(length(btrim(reason)) between 1 and 500),
  constraint deduction_fact_request_check check(length(btrim(request_key)) between 1 and 200),
  constraint deduction_fact_request_unique unique(business_id,request_key)
);
create unique index deduction_fact_one_root_idx on public.deduction_business_fact_events
  (business_id,fact_type,scope_kind,scope_key) where supersedes_event_id is null;
create unique index deduction_fact_one_successor_idx on public.deduction_business_fact_events
  (supersedes_event_id) where supersedes_event_id is not null;

create view public.current_deduction_business_facts with(security_invoker=true) as
select facts.* from public.deduction_business_fact_events facts
where not exists(select 1 from public.deduction_business_fact_events successor
  where successor.supersedes_event_id=facts.id);

create table public.bookkeeping_decision_deduction_fact_dependencies (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  bookkeeping_record_id uuid not null,
  bookkeeping_decision_id uuid not null,
  fact_event_id uuid not null,
  fact_type text not null,
  scope_kind text not null,
  scope_key text not null,
  created_at timestamptz not null default now(),
  constraint decision_deduction_fact_decision_fkey foreign key
    (bookkeeping_decision_id,business_id,bookkeeping_record_id)
    references public.bookkeeping_decisions(id,business_id,bookkeeping_record_id) on delete restrict,
  constraint decision_deduction_fact_event_fkey foreign key
    (fact_event_id,business_id,fact_type,scope_kind,scope_key)
    references public.deduction_business_fact_events(id,business_id,fact_type,scope_kind,scope_key) on delete restrict,
  constraint decision_deduction_fact_unique unique(bookkeeping_decision_id,fact_event_id)
);

create table public.bookkeeping_tax_treatment_deduction_fact_dependencies (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  tax_treatment_id uuid not null,
  fact_event_id uuid not null,
  fact_type text not null,
  scope_kind text not null,
  scope_key text not null,
  created_at timestamptz not null default now(),
  constraint tax_deduction_fact_treatment_fkey foreign key(tax_treatment_id,business_id)
    references public.bookkeeping_tax_treatments(id,business_id) on delete restrict,
  constraint tax_deduction_fact_event_fkey foreign key
    (fact_event_id,business_id,fact_type,scope_kind,scope_key)
    references public.deduction_business_fact_events(id,business_id,fact_type,scope_kind,scope_key) on delete restrict,
  constraint tax_deduction_fact_unique unique(tax_treatment_id,fact_event_id)
);

create table public.bookkeeping_tax_treatment_deduction_fact_invalidations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  tax_treatment_id uuid not null unique,
  triggering_fact_event_id uuid not null,
  fact_type text not null,
  scope_kind text not null,
  scope_key text not null,
  reason text not null,
  created_at timestamptz not null default now(),
  constraint tax_deduction_invalidation_treatment_fkey foreign key(tax_treatment_id,business_id)
    references public.bookkeeping_tax_treatments(id,business_id) on delete restrict,
  constraint tax_deduction_invalidation_event_fkey foreign key
    (triggering_fact_event_id,business_id,fact_type,scope_kind,scope_key)
    references public.deduction_business_fact_events(id,business_id,fact_type,scope_kind,scope_key) on delete restrict,
  constraint tax_deduction_invalidation_reason_check check(length(btrim(reason)) between 1 and 500)
);

create table public.deduction_attention_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  attention_id uuid not null,
  supersedes_event_id uuid,
  sequence_number integer not null,
  event_type text not null,
  fact_type text not null,
  scope_kind text not null,
  scope_key text not null,
  bookkeeping_record_id uuid,
  question_type text not null,
  prompt text not null,
  guidance text,
  answer_value jsonb,
  signal_key text not null,
  signal_version text not null,
  provenance text not null,
  actor_user_id uuid references auth.users(id) on delete restrict,
  request_key text not null,
  created_at timestamptz not null default now(),
  constraint deduction_attention_identity_unique unique(id,business_id,attention_id),
  constraint deduction_attention_record_fkey foreign key(bookkeeping_record_id,business_id)
    references public.bookkeeping_records(id,business_id) on delete restrict,
  constraint deduction_attention_predecessor_fkey foreign key(supersedes_event_id,business_id,attention_id)
    references public.deduction_attention_events(id,business_id,attention_id) on delete restrict,
  constraint deduction_attention_type_check check(event_type in ('opened','answered','deferred','resolved')),
  constraint deduction_attention_question_check check(question_type in ('percentage','yes_no','integer','date')),
  constraint deduction_attention_fact_check check(fact_type in (
    'phone_business_use_percentage','internet_business_use_percentage',
    'home_office_regular_use','home_office_exclusive_use','home_office_square_feet',
    'home_total_square_feet','equipment_business_use_percentage','equipment_placed_in_service_date')),
  constraint deduction_attention_scope_check check(scope_kind in ('business','merchant','bookkeeping_record')),
  constraint deduction_attention_text_check check(length(btrim(scope_key)) between 1 and 200
    and length(btrim(prompt)) between 1 and 500 and (guidance is null or length(guidance)<=500)
    and length(btrim(signal_key)) between 1 and 200 and length(btrim(signal_version)) between 1 and 100
    and length(btrim(request_key)) between 1 and 200),
  constraint deduction_attention_event_shape_check check(
    (event_type in ('opened','resolved') and provenance in ('automation','system') and actor_user_id is null)
    or (event_type in ('answered','deferred') and provenance='user' and actor_user_id is not null)),
  constraint deduction_attention_sequence_check check(sequence_number>0)
);
create unique index deduction_attention_one_root_idx on public.deduction_attention_events
  (business_id,signal_key) where supersedes_event_id is null;
create unique index deduction_attention_one_successor_idx on public.deduction_attention_events
  (supersedes_event_id) where supersedes_event_id is not null;
create unique index deduction_attention_request_unique on public.deduction_attention_events(business_id,request_key);

create view public.current_deduction_attentions with(security_invoker=true) as
select events.* from public.deduction_attention_events events
where not exists(select 1 from public.deduction_attention_events successor
  where successor.supersedes_event_id=events.id);

create table public.bookkeeping_special_treatment_signals (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  bookkeeping_record_id uuid not null,
  signal_type text not null,
  signal_version text not null,
  reason_code text not null,
  provenance text not null default 'automation',
  created_at timestamptz not null default now(),
  constraint special_treatment_record_fkey foreign key(bookkeeping_record_id,business_id)
    references public.bookkeeping_records(id,business_id) on delete restrict,
  constraint special_treatment_signal_check check(signal_type='equipment_review'
    and reason_code='POSSIBLE_DURABLE_EQUIPMENT' and provenance='automation'),
  constraint special_treatment_signal_unique unique(business_id,bookkeeping_record_id,signal_type,signal_version)
);

create or replace function public.validate_deduction_fact_value(
  p_fact_type text,p_scope_kind text,p_scope_key text,p_value jsonb,p_effective_on date
) returns void language plpgsql stable set search_path='' as $$
declare integer_value integer; text_value text;
begin
 if p_scope_kind='business' and p_scope_key<>'business' then raise exception 'Business fact scope is invalid'; end if;
 if p_fact_type like 'home_office_%' and p_scope_kind<>'business' then raise exception 'home-office fact must be Business-scoped'; end if;
 if p_fact_type in ('phone_business_use_percentage','internet_business_use_percentage') and p_scope_kind<>'merchant' then raise exception 'shared-use fact must be merchant-scoped'; end if;
 if p_fact_type like 'equipment_%' and p_scope_kind<>'bookkeeping_record' then raise exception 'equipment fact must be record-scoped'; end if;
 if p_fact_type like '%_percentage' then
   if jsonb_typeof(p_value)<>'number' then raise exception 'percentage must be an integer'; end if;
   integer_value:=(p_value#>>'{}')::integer;
   if integer_value<1 or integer_value>100 or to_jsonb(integer_value)<>p_value then raise exception 'percentage must be an integer from 1 to 100'; end if;
 elsif p_fact_type in ('home_office_regular_use','home_office_exclusive_use') then
   if jsonb_typeof(p_value)<>'boolean' then raise exception 'home-office answer must be yes or no'; end if;
 elsif p_fact_type in ('home_office_square_feet','home_total_square_feet') then
   if jsonb_typeof(p_value)<>'number' then raise exception 'square feet must be an integer'; end if;
   integer_value:=(p_value#>>'{}')::integer;
   if integer_value<1 or integer_value>100000 or to_jsonb(integer_value)<>p_value then raise exception 'square feet are invalid'; end if;
 elsif p_fact_type='equipment_placed_in_service_date' then
   if jsonb_typeof(p_value)<>'string' then raise exception 'placed-in-service date is invalid'; end if;
   text_value:=p_value#>>'{}';
   begin
     if text_value::date>current_date then raise exception 'placed-in-service date is invalid'; end if;
   exception when invalid_datetime_format or datetime_field_overflow then
     raise exception 'placed-in-service date is invalid';
   end;
 elsif p_fact_type='recurring_shared_expense_context' then
   if jsonb_typeof(p_value)<>'object' or not (p_value ? 'expenseType')
     or p_value->>'expenseType' not in ('phone','internet') then raise exception 'shared expense context is invalid'; end if;
 end if;
 if p_effective_on is not null and p_effective_on>current_date then raise exception 'fact effective date cannot be future'; end if;
end; $$;

create or replace function public.record_deduction_business_fact(
 p_fact_type text,p_scope_kind text,p_scope_key text,p_value jsonb,p_effective_on date,
 p_expected_current_event_id uuid,p_source text,p_reason text,p_request_key text
) returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=(select auth.uid()); v_business_id uuid; current_event public.deduction_business_fact_events%rowtype; inserted_id uuid;
 dependency record;
begin
 if actor is null then raise exception 'authentication required'; end if;
 select id into v_business_id from public.businesses where owner_user_id=actor for update;
 if v_business_id is null then raise exception 'Business is unavailable'; end if;
 if p_source not in ('question','deduction_profile','correction') or length(btrim(coalesce(p_request_key,''))) not between 1 and 200
   or length(btrim(coalesce(p_reason,''))) not between 1 and 500 then raise exception 'deduction fact request is invalid'; end if;
 perform public.validate_deduction_fact_value(p_fact_type,p_scope_kind,btrim(p_scope_key),p_value,p_effective_on);
 if p_scope_kind='bookkeeping_record' and not exists(select 1 from public.bookkeeping_records
   where id=btrim(p_scope_key)::uuid and business_id=v_business_id) then
   raise exception 'deduction fact record does not belong to Business';
 end if;
 select * into current_event from public.deduction_business_fact_events facts
  where facts.business_id=v_business_id and facts.fact_type=p_fact_type and facts.scope_kind=p_scope_kind and facts.scope_key=btrim(p_scope_key)
  and not exists(select 1 from public.deduction_business_fact_events successor where successor.supersedes_event_id=facts.id) for update;
 if found and current_event.fact_value=p_value and current_event.effective_on is not distinct from p_effective_on then return current_event.id; end if;
 if current_event.id is distinct from p_expected_current_event_id then raise exception 'deduction fact changed before this answer was saved'; end if;
 insert into public.deduction_business_fact_events(business_id,fact_type,scope_kind,scope_key,fact_value,effective_on,
   supersedes_event_id,source,actor_user_id,reason,request_key)
 values(v_business_id,p_fact_type,p_scope_kind,btrim(p_scope_key),p_value,p_effective_on,current_event.id,p_source,actor,
   btrim(p_reason),btrim(p_request_key)) returning id into inserted_id;
 insert into public.bookkeeping_tax_treatment_deduction_fact_invalidations(business_id,tax_treatment_id,triggering_fact_event_id,
   fact_type,scope_kind,scope_key,reason)
 select dependencies.business_id,dependencies.tax_treatment_id,inserted_id,p_fact_type,p_scope_kind,btrim(p_scope_key),
   'A reusable deduction fact used by this treatment changed.'
 from public.bookkeeping_tax_treatment_deduction_fact_dependencies dependencies
 where dependencies.business_id=v_business_id and dependencies.fact_event_id=current_event.id
 on conflict(tax_treatment_id) do nothing;
 for dependency in select distinct bookkeeping_record_id from public.bookkeeping_decision_deduction_fact_dependencies
   where business_id=v_business_id and fact_event_id=current_event.id loop
   perform public.request_bookkeeping_processing(v_business_id,dependency.bookkeeping_record_id,'deduction_fact_changed',
     concat('deduction-intelligence:v1:fact:',inserted_id,':record:',dependency.bookkeeping_record_id));
 end loop;
 return inserted_id;
end; $$;

create or replace function public.open_deduction_attention(
 p_business_id uuid,p_bookkeeping_record_id uuid,p_fact_type text,p_scope_kind text,p_scope_key text,
 p_question_type text,p_prompt text,p_guidance text,p_signal_key text,p_signal_version text
) returns uuid language plpgsql security definer set search_path='' as $$
declare selected_id uuid; current_fact uuid;
begin
 if p_bookkeeping_record_id is not null and not exists(select 1 from public.bookkeeping_records
   where id=p_bookkeeping_record_id and business_id=p_business_id) then raise exception 'attention record does not belong to Business'; end if;
 select id into current_fact from public.current_deduction_business_facts where business_id=p_business_id
   and fact_type=p_fact_type and scope_kind=p_scope_kind and scope_key=p_scope_key;
 if current_fact is not null then return null; end if;
 select attention_id into selected_id from public.deduction_attention_events where business_id=p_business_id and signal_key=p_signal_key limit 1;
 if selected_id is not null then return selected_id; end if;
 selected_id:=gen_random_uuid();
 insert into public.deduction_attention_events(id,business_id,attention_id,sequence_number,event_type,fact_type,scope_kind,scope_key,
  bookkeeping_record_id,question_type,prompt,guidance,signal_key,signal_version,provenance,request_key)
 values(selected_id,p_business_id,selected_id,1,'opened',p_fact_type,p_scope_kind,p_scope_key,p_bookkeeping_record_id,
  p_question_type,btrim(p_prompt),nullif(btrim(p_guidance),''),p_signal_key,p_signal_version,'automation',concat('open:',p_signal_key));
 return selected_id;
exception when unique_violation then
 select attention_id into selected_id from public.deduction_attention_events where business_id=p_business_id and signal_key=p_signal_key limit 1;
 return selected_id;
end; $$;

create or replace function public.answer_deduction_attention(
 p_attention_id uuid,p_expected_event_id uuid,p_value jsonb,p_request_key text
) returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=(select auth.uid()); current_event public.deduction_attention_events%rowtype; fact_id uuid; next_id uuid:=gen_random_uuid(); expected_fact uuid;
begin
 if actor is null then raise exception 'authentication required'; end if;
 select attention.* into current_event from public.current_deduction_attentions attention join public.businesses business
  on business.id=attention.business_id and business.owner_user_id=actor
  where attention.attention_id=p_attention_id for update;
 if not found or current_event.id is distinct from p_expected_event_id or current_event.event_type not in ('opened','deferred')
 then raise exception 'deduction question changed'; end if;
 select id into expected_fact from public.current_deduction_business_facts where business_id=current_event.business_id
  and fact_type=current_event.fact_type and scope_kind=current_event.scope_kind and scope_key=current_event.scope_key;
 fact_id:=public.record_deduction_business_fact(current_event.fact_type,current_event.scope_kind,current_event.scope_key,p_value,current_date,
  expected_fact,'question','Customer answered a reusable deduction fact question.',concat(p_request_key,':fact'));
 insert into public.deduction_attention_events(id,business_id,attention_id,supersedes_event_id,sequence_number,event_type,fact_type,
  scope_kind,scope_key,bookkeeping_record_id,question_type,prompt,guidance,answer_value,signal_key,signal_version,provenance,actor_user_id,request_key)
 values(next_id,current_event.business_id,current_event.attention_id,current_event.id,current_event.sequence_number+1,'answered',current_event.fact_type,
  current_event.scope_kind,current_event.scope_key,current_event.bookkeeping_record_id,current_event.question_type,current_event.prompt,current_event.guidance,
  p_value,current_event.signal_key,current_event.signal_version,'user',actor,btrim(p_request_key));
 return fact_id;
end; $$;

create or replace function public.defer_deduction_attention(
 p_attention_id uuid,p_expected_event_id uuid,p_request_key text
) returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=(select auth.uid()); current_event public.deduction_attention_events%rowtype; next_id uuid:=gen_random_uuid();
begin
 select attention.* into current_event from public.current_deduction_attentions attention join public.businesses business
  on business.id=attention.business_id and business.owner_user_id=actor where attention.attention_id=p_attention_id for update;
 if not found or current_event.id is distinct from p_expected_event_id or current_event.event_type not in ('opened','deferred')
 then raise exception 'deduction question changed'; end if;
 insert into public.deduction_attention_events(id,business_id,attention_id,supersedes_event_id,sequence_number,event_type,fact_type,
  scope_kind,scope_key,bookkeeping_record_id,question_type,prompt,guidance,signal_key,signal_version,provenance,actor_user_id,request_key)
 values(next_id,current_event.business_id,current_event.attention_id,current_event.id,current_event.sequence_number+1,'deferred',current_event.fact_type,
  current_event.scope_kind,current_event.scope_key,current_event.bookkeeping_record_id,current_event.question_type,current_event.prompt,current_event.guidance,
  current_event.signal_key,current_event.signal_version,'user',actor,btrim(p_request_key)); return next_id;
end; $$;

create trigger deduction_fact_no_mutation before update or delete on public.deduction_business_fact_events
 for each row execute function public.reject_canonical_bookkeeping_mutation();
create trigger decision_deduction_fact_no_mutation before update or delete on public.bookkeeping_decision_deduction_fact_dependencies
 for each row execute function public.reject_canonical_bookkeeping_mutation();
create trigger tax_deduction_fact_no_mutation before update or delete on public.bookkeeping_tax_treatment_deduction_fact_dependencies
 for each row execute function public.reject_canonical_bookkeeping_mutation();
create trigger tax_deduction_fact_invalidation_no_mutation before update or delete on public.bookkeeping_tax_treatment_deduction_fact_invalidations
 for each row execute function public.reject_canonical_bookkeeping_mutation();
create trigger deduction_attention_no_mutation before update or delete on public.deduction_attention_events
 for each row execute function public.reject_canonical_bookkeeping_mutation();
create trigger special_treatment_signal_no_mutation before update or delete on public.bookkeeping_special_treatment_signals
 for each row execute function public.reject_canonical_bookkeeping_mutation();

alter table public.deduction_business_fact_events enable row level security;
alter table public.bookkeeping_decision_deduction_fact_dependencies enable row level security;
alter table public.bookkeeping_tax_treatment_deduction_fact_dependencies enable row level security;
alter table public.bookkeeping_tax_treatment_deduction_fact_invalidations enable row level security;
alter table public.deduction_attention_events enable row level security;
alter table public.bookkeeping_special_treatment_signals enable row level security;
create policy deduction_facts_select_own on public.deduction_business_fact_events for select to authenticated using(exists(
 select 1 from public.businesses where businesses.id=deduction_business_fact_events.business_id and owner_user_id=(select auth.uid())));
create policy decision_deduction_facts_select_own on public.bookkeeping_decision_deduction_fact_dependencies for select to authenticated using(exists(
 select 1 from public.businesses where businesses.id=bookkeeping_decision_deduction_fact_dependencies.business_id and owner_user_id=(select auth.uid())));
create policy tax_deduction_facts_select_own on public.bookkeeping_tax_treatment_deduction_fact_dependencies for select to authenticated using(exists(
 select 1 from public.businesses where businesses.id=bookkeeping_tax_treatment_deduction_fact_dependencies.business_id and owner_user_id=(select auth.uid())));
create policy tax_deduction_fact_invalidations_select_own on public.bookkeeping_tax_treatment_deduction_fact_invalidations for select to authenticated using(exists(
 select 1 from public.businesses where businesses.id=bookkeeping_tax_treatment_deduction_fact_invalidations.business_id and owner_user_id=(select auth.uid())));
create policy deduction_attentions_select_own on public.deduction_attention_events for select to authenticated using(exists(
 select 1 from public.businesses where businesses.id=deduction_attention_events.business_id and owner_user_id=(select auth.uid())));
create policy special_treatment_select_own on public.bookkeeping_special_treatment_signals for select to authenticated using(exists(
 select 1 from public.businesses where businesses.id=bookkeeping_special_treatment_signals.business_id and owner_user_id=(select auth.uid())));
revoke all on public.deduction_business_fact_events,public.bookkeeping_decision_deduction_fact_dependencies,
 public.bookkeeping_tax_treatment_deduction_fact_dependencies,public.deduction_attention_events,
 public.bookkeeping_tax_treatment_deduction_fact_invalidations,public.bookkeeping_special_treatment_signals from public,anon,authenticated;
grant select on public.deduction_business_fact_events,public.bookkeeping_decision_deduction_fact_dependencies,
 public.bookkeeping_tax_treatment_deduction_fact_dependencies,public.deduction_attention_events,
 public.bookkeeping_tax_treatment_deduction_fact_invalidations,public.bookkeeping_special_treatment_signals,
 public.current_deduction_business_facts,public.current_deduction_attentions to authenticated;
grant select on public.current_deduction_business_facts,public.current_deduction_attentions to service_role;
grant select,insert on public.deduction_business_fact_events,public.bookkeeping_decision_deduction_fact_dependencies,
 public.bookkeeping_tax_treatment_deduction_fact_dependencies,public.deduction_attention_events,
 public.bookkeeping_tax_treatment_deduction_fact_invalidations,public.bookkeeping_special_treatment_signals to service_role;
revoke execute on function public.validate_deduction_fact_value(text,text,text,jsonb,date),
 public.open_deduction_attention(uuid,uuid,text,text,text,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.open_deduction_attention(uuid,uuid,text,text,text,text,text,text,text,text) to service_role;
revoke execute on function public.record_deduction_business_fact(text,text,text,jsonb,date,uuid,text,text,text),
 public.answer_deduction_attention(uuid,uuid,jsonb,text),public.defer_deduction_attention(uuid,uuid,text) from public,anon;
grant execute on function public.record_deduction_business_fact(text,text,text,jsonb,date,uuid,text,text,text),
 public.answer_deduction_attention(uuid,uuid,jsonb,text),public.defer_deduction_attention(uuid,uuid,text) to authenticated,service_role;

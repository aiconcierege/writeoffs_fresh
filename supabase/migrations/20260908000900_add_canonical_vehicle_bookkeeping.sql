-- Canonical vehicle bookkeeping extends, but never rewrites, the immutable mileage ledger.
-- Vehicle identity, ownership, annual method/use facts, expense association, and tax
-- calculations remain separate so a bank transaction is always preserved even when its
-- deduction is suppressed by the selected method.

insert into public.categories(key,label) values ('car-truck','Car and truck expenses') on conflict(key) do nothing;
grant select on public.business_vehicles,public.canonical_mileage_entries,public.canonical_mileage_events to service_role;
grant select on public.current_canonical_mileage_entries to service_role;

create table public.vehicle_identity_events(
  id uuid primary key default gen_random_uuid(), business_id uuid not null, vehicle_id uuid not null,
  supersedes_event_id uuid, ownership text not null check(ownership in('owned','leased','unknown')),
  business_use_began_on date, lease_started_on date, lease_ended_on date,
  lease_document_receipt_id uuid, request_key text not null, actor_user_id uuid not null references auth.users(id) on delete restrict,
  provenance text not null default 'customer' check(provenance in('customer','document','system')),
  created_at timestamptz not null default now(), unique(business_id,request_key), unique(id,business_id,vehicle_id),
  foreign key(vehicle_id,business_id) references public.business_vehicles(id,business_id) on delete restrict,
  foreign key(supersedes_event_id,business_id,vehicle_id) references public.vehicle_identity_events(id,business_id,vehicle_id) on delete restrict,
  check((ownership='leased' and (lease_ended_on is null or lease_started_on is null or lease_ended_on>=lease_started_on))
    or (ownership<>'leased' and lease_started_on is null and lease_ended_on is null and lease_document_receipt_id is null))
);
create unique index vehicle_identity_root_unique on public.vehicle_identity_events(vehicle_id) where supersedes_event_id is null;
create unique index vehicle_identity_successor_unique on public.vehicle_identity_events(supersedes_event_id) where supersedes_event_id is not null;
create view public.current_vehicle_identities with(security_invoker=true,security_barrier=true) as
select event.* from public.vehicle_identity_events event where not exists(
  select 1 from public.vehicle_identity_events successor where successor.supersedes_event_id=event.id);

create table public.vehicle_tax_year_method_events(
  id uuid primary key default gen_random_uuid(), business_id uuid not null, vehicle_id uuid not null,
  tax_year integer not null check(tax_year between 2000 and 2200), supersedes_event_id uuid,
  method text not null check(method in('standard_mileage','actual_expenses','unresolved','cpa_review')),
  reason text not null, request_key text not null, actor_user_id uuid not null references auth.users(id) on delete restrict,
  provenance text not null default 'customer' check(provenance in('customer','system','cpa')),
  created_at timestamptz not null default now(), unique(business_id,request_key), unique(id,business_id,vehicle_id,tax_year),
  foreign key(vehicle_id,business_id) references public.business_vehicles(id,business_id) on delete restrict,
  foreign key(supersedes_event_id,business_id,vehicle_id,tax_year)
    references public.vehicle_tax_year_method_events(id,business_id,vehicle_id,tax_year) on delete restrict
);
create unique index vehicle_method_root_unique on public.vehicle_tax_year_method_events(vehicle_id,tax_year) where supersedes_event_id is null;
create unique index vehicle_method_successor_unique on public.vehicle_tax_year_method_events(supersedes_event_id) where supersedes_event_id is not null;
create view public.current_vehicle_tax_year_methods with(security_invoker=true,security_barrier=true) as
select event.* from public.vehicle_tax_year_method_events event where not exists(
  select 1 from public.vehicle_tax_year_method_events successor where successor.supersedes_event_id=event.id);

create table public.vehicle_tax_year_use_events(
  id uuid primary key default gen_random_uuid(), business_id uuid not null, vehicle_id uuid not null,
  tax_year integer not null check(tax_year between 2000 and 2200), supersedes_event_id uuid,
  total_miles_milli bigint not null check(total_miles_milli>0), source text not null check(source in('customer_odometer','customer_total','document')),
  request_key text not null, actor_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(), unique(business_id,request_key), unique(id,business_id,vehicle_id,tax_year),
  foreign key(vehicle_id,business_id) references public.business_vehicles(id,business_id) on delete restrict,
  foreign key(supersedes_event_id,business_id,vehicle_id,tax_year)
    references public.vehicle_tax_year_use_events(id,business_id,vehicle_id,tax_year) on delete restrict
);
create unique index vehicle_use_root_unique on public.vehicle_tax_year_use_events(vehicle_id,tax_year) where supersedes_event_id is null;
create unique index vehicle_use_successor_unique on public.vehicle_tax_year_use_events(supersedes_event_id) where supersedes_event_id is not null;
create view public.current_vehicle_tax_year_use with(security_invoker=true,security_barrier=true) as
select event.* from public.vehicle_tax_year_use_events event where not exists(
  select 1 from public.vehicle_tax_year_use_events successor where successor.supersedes_event_id=event.id);

create table public.vehicle_expense_association_events(
  id uuid primary key default gen_random_uuid(), business_id uuid not null, bookkeeping_record_id uuid not null,
  vehicle_id uuid not null, supersedes_event_id uuid,
  event_type text not null check(event_type in('associated','removed')),
  expense_kind text not null check(expense_kind in('fuel','insurance','repair','maintenance','registration','tires','parking','tolls','lease_payment','other_operating','purchase','improvement')),
  evidence_fingerprint text not null check(evidence_fingerprint~'^[a-f0-9]{64}$'), evidence_references jsonb not null check(jsonb_typeof(evidence_references)='array'),
  request_key text not null, actor_user_id uuid references auth.users(id) on delete restrict,
  provenance text not null check(provenance in('customer','automation','document')),
  created_at timestamptz not null default now(), unique(business_id,request_key), unique(id,business_id,bookkeeping_record_id),
  foreign key(bookkeeping_record_id,business_id) references public.bookkeeping_records(id,business_id) on delete restrict,
  foreign key(vehicle_id,business_id) references public.business_vehicles(id,business_id) on delete restrict,
  foreign key(supersedes_event_id,business_id,bookkeeping_record_id)
    references public.vehicle_expense_association_events(id,business_id,bookkeeping_record_id) on delete restrict,
  check((provenance='automation' and actor_user_id is null) or (provenance<>'automation' and actor_user_id is not null))
);
create unique index vehicle_expense_root_unique on public.vehicle_expense_association_events(bookkeeping_record_id) where supersedes_event_id is null;
create unique index vehicle_expense_successor_unique on public.vehicle_expense_association_events(supersedes_event_id) where supersedes_event_id is not null;
create view public.current_vehicle_expense_associations with(security_invoker=true,security_barrier=true) as
select event.* from public.vehicle_expense_association_events event where event.event_type='associated' and not exists(
  select 1 from public.vehicle_expense_association_events successor where successor.supersedes_event_id=event.id);

create table public.vehicle_mileage_rates(
  id uuid primary key default gen_random_uuid(), tax_year integer not null, effective_from date not null,
  effective_through date not null, rate_millis_per_mile integer not null check(rate_millis_per_mile>0),
  rule_version integer not null, authority_reference text not null, authority_url text not null,
  created_at timestamptz not null default now(), unique(effective_from,effective_through,rule_version),
  check(extract(year from effective_from)=tax_year and extract(year from effective_through)=tax_year and effective_through>=effective_from)
);
insert into public.vehicle_mileage_rates(tax_year,effective_from,effective_through,rate_millis_per_mile,rule_version,authority_reference,authority_url) values
 (2025,'2025-01-01','2025-12-31',70000,1,'IRS IR-2024-312','https://www.irs.gov/newsroom/irs-increases-the-standard-mileage-rate-for-business-use-in-2025-key-rate-increases-3-cents-to-70-cents-per-mile'),
 (2026,'2026-01-01','2026-06-30',72500,1,'IRS Notice 2026-10','https://www.irs.gov/irb/2026-04_IRB'),
 (2026,'2026-07-01','2026-12-31',76000,2,'IRS Announcement 2026-11','https://www.irs.gov/irb/2026-29_IRB');

create table public.vehicle_deduction_assessments(
  id uuid primary key default gen_random_uuid(), business_id uuid not null, vehicle_id uuid not null,
  tax_year integer not null, supersedes_assessment_id uuid, assessment_version text not null,
  method_event_id uuid, use_event_id uuid, business_miles_milli bigint not null,
  total_miles_milli bigint, business_use_basis_points integer check(business_use_basis_points between 0 and 10000),
  mileage_deduction_cents bigint, actual_expense_cents bigint not null,
  deductible_actual_expense_cents bigint, excluded_actual_expense_cents bigint not null,
  status text not null check(status in('ready','requires_facts','cpa_review')),
  cpa_review_reasons jsonb not null check(jsonb_typeof(cpa_review_reasons)='array'),
  evidence_fingerprint text not null check(evidence_fingerprint~'^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(), unique(id,business_id,vehicle_id,tax_year),
  foreign key(vehicle_id,business_id) references public.business_vehicles(id,business_id) on delete restrict,
  foreign key(method_event_id,business_id,vehicle_id,tax_year) references public.vehicle_tax_year_method_events(id,business_id,vehicle_id,tax_year) on delete restrict,
  foreign key(use_event_id,business_id,vehicle_id,tax_year) references public.vehicle_tax_year_use_events(id,business_id,vehicle_id,tax_year) on delete restrict,
  foreign key(supersedes_assessment_id,business_id,vehicle_id,tax_year) references public.vehicle_deduction_assessments(id,business_id,vehicle_id,tax_year) on delete restrict
);
create unique index vehicle_assessment_root_unique on public.vehicle_deduction_assessments(vehicle_id,tax_year) where supersedes_assessment_id is null;
create unique index vehicle_assessment_successor_unique on public.vehicle_deduction_assessments(supersedes_assessment_id) where supersedes_assessment_id is not null;
create view public.current_vehicle_deduction_assessments with(security_invoker=true,security_barrier=true) as
select assessment.* from public.vehicle_deduction_assessments assessment where not exists(
 select 1 from public.vehicle_deduction_assessments successor where successor.supersedes_assessment_id=assessment.id);

do $$ declare table_name text; begin foreach table_name in array array['vehicle_identity_events','vehicle_tax_year_method_events','vehicle_tax_year_use_events','vehicle_expense_association_events','vehicle_deduction_assessments'] loop
  execute format('alter table public.%I enable row level security',table_name);
  execute format('create policy %I on public.%I for select to authenticated using(exists(select 1 from public.businesses b where b.id=business_id and b.owner_user_id=(select auth.uid())))',table_name||'_select_own',table_name);
  execute format('revoke all on public.%I from public,anon,authenticated',table_name);
  execute format('grant select on public.%I to authenticated,service_role',table_name);
 end loop; end $$;
grant select on public.current_vehicle_identities,public.current_vehicle_tax_year_methods,public.current_vehicle_tax_year_use,
 public.current_vehicle_expense_associations,public.current_vehicle_deduction_assessments to authenticated,service_role;
grant insert on public.vehicle_expense_association_events,public.vehicle_deduction_assessments to service_role;
revoke all on public.vehicle_mileage_rates from public,anon,authenticated;
grant select on public.vehicle_mileage_rates to authenticated,service_role;

create or replace function public.reject_vehicle_bookkeeping_mutation() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'vehicle bookkeeping history is append-only'; end $$;
create trigger vehicle_identity_immutable before update or delete on public.vehicle_identity_events for each row execute function public.reject_vehicle_bookkeeping_mutation();
create trigger vehicle_method_immutable before update or delete on public.vehicle_tax_year_method_events for each row execute function public.reject_vehicle_bookkeeping_mutation();
create trigger vehicle_use_immutable before update or delete on public.vehicle_tax_year_use_events for each row execute function public.reject_vehicle_bookkeeping_mutation();
create trigger vehicle_expense_immutable before update or delete on public.vehicle_expense_association_events for each row execute function public.reject_vehicle_bookkeeping_mutation();
create trigger vehicle_assessment_immutable before update or delete on public.vehicle_deduction_assessments for each row execute function public.reject_vehicle_bookkeeping_mutation();
create trigger vehicle_rates_immutable before update or delete on public.vehicle_mileage_rates for each row execute function public.reject_vehicle_bookkeeping_mutation();

create or replace function public.record_vehicle_identity(p_vehicle_id uuid,p_expected_event_id uuid,p_ownership text,
 p_business_use_began_on date,p_lease_started_on date,p_lease_ended_on date,p_request_key text)
returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=(select auth.uid()); selected_business uuid; current_event public.vehicle_identity_events%rowtype; result uuid;
begin
 if actor is null then raise exception 'authentication required'; end if;
 select v.business_id into selected_business from public.business_vehicles v join public.businesses b on b.id=v.business_id
  where v.id=p_vehicle_id and b.owner_user_id=actor;
 if selected_business is null or p_ownership not in('owned','leased','unknown') or length(btrim(coalesce(p_request_key,''))) not between 1 and 160 then raise exception 'valid vehicle facts required'; end if;
 select id into result from public.vehicle_identity_events where business_id=selected_business and request_key=btrim(p_request_key); if result is not null then return result; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_vehicle_id::text,91));
 select * into current_event from public.current_vehicle_identities where business_id=selected_business and vehicle_id=p_vehicle_id;
 if (current_event.id is null and p_expected_event_id is not null) or (current_event.id is not null and current_event.id is distinct from p_expected_event_id) then raise exception 'vehicle facts changed; reload'; end if;
 insert into public.vehicle_identity_events(business_id,vehicle_id,supersedes_event_id,ownership,business_use_began_on,lease_started_on,lease_ended_on,request_key,actor_user_id)
 values(selected_business,p_vehicle_id,current_event.id,p_ownership,p_business_use_began_on,case when p_ownership='leased' then p_lease_started_on end,case when p_ownership='leased' then p_lease_ended_on end,btrim(p_request_key),actor) returning id into result;
 return result;
end $$;

create or replace function public.record_vehicle_tax_year_method(p_vehicle_id uuid,p_tax_year integer,p_expected_event_id uuid,p_method text,p_request_key text)
returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=(select auth.uid()); selected_business uuid; current_event public.vehicle_tax_year_method_events%rowtype; identity_event public.vehicle_identity_events%rowtype; result uuid;
begin
 if actor is null then raise exception 'authentication required'; end if;
 select v.business_id into selected_business from public.business_vehicles v join public.businesses b on b.id=v.business_id where v.id=p_vehicle_id and b.owner_user_id=actor;
 if selected_business is null or p_tax_year not between 2000 and 2200 or p_method not in('standard_mileage','actual_expenses','unresolved','cpa_review') or length(btrim(coalesce(p_request_key,''))) not between 1 and 160 then raise exception 'valid vehicle method required'; end if;
 select id into result from public.vehicle_tax_year_method_events where business_id=selected_business and request_key=btrim(p_request_key); if result is not null then return result; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_vehicle_id::text||':'||p_tax_year::text,92));
 select * into current_event from public.current_vehicle_tax_year_methods where business_id=selected_business and vehicle_id=p_vehicle_id and tax_year=p_tax_year;
 if (current_event.id is null and p_expected_event_id is not null) or (current_event.id is not null and current_event.id is distinct from p_expected_event_id) then raise exception 'vehicle method changed; reload'; end if;
 select * into identity_event from public.current_vehicle_identities where business_id=selected_business and vehicle_id=p_vehicle_id;
 if identity_event.ownership='leased' and p_method<>'standard_mileage' and exists(
   select 1 from public.vehicle_tax_year_method_events prior where prior.business_id=selected_business and prior.vehicle_id=p_vehicle_id and prior.method='standard_mileage'
 ) then raise exception 'leased vehicle standard mileage must remain for the lease period; CPA review required'; end if;
 if identity_event.ownership='owned' and p_method='standard_mileage' and exists(
   select 1 from public.vehicle_tax_year_method_events prior where prior.business_id=selected_business and prior.vehicle_id=p_vehicle_id and prior.tax_year<p_tax_year and prior.method='actual_expenses'
 ) then raise exception 'standard mileage eligibility needs CPA review after prior actual-expense use'; end if;
 insert into public.vehicle_tax_year_method_events(business_id,vehicle_id,tax_year,supersedes_event_id,method,reason,request_key,actor_user_id)
 values(selected_business,p_vehicle_id,p_tax_year,current_event.id,p_method,'Customer chose how WriteOffs should track the vehicle for this year.',btrim(p_request_key),actor) returning id into result;
 return result;
end $$;

create or replace function public.record_vehicle_tax_year_total_miles(p_vehicle_id uuid,p_tax_year integer,p_expected_event_id uuid,p_total_miles_milli bigint,p_request_key text)
returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=(select auth.uid()); selected_business uuid; current_event public.vehicle_tax_year_use_events%rowtype; business_miles bigint; result uuid;
begin
 if actor is null then raise exception 'authentication required'; end if;
 select v.business_id into selected_business from public.business_vehicles v join public.businesses b on b.id=v.business_id where v.id=p_vehicle_id and b.owner_user_id=actor;
 select coalesce(sum(m.miles_milli),0) into business_miles from public.current_canonical_mileage_entries m where m.business_id=selected_business and m.vehicle_id=p_vehicle_id and extract(year from m.occurred_on)=p_tax_year;
 if selected_business is null or p_tax_year not between 2000 and 2200 or p_total_miles_milli<=0 or p_total_miles_milli<business_miles or length(btrim(coalesce(p_request_key,''))) not between 1 and 160 then raise exception 'total miles must include all recorded business miles'; end if;
 select id into result from public.vehicle_tax_year_use_events where business_id=selected_business and request_key=btrim(p_request_key); if result is not null then return result; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_vehicle_id::text||':'||p_tax_year::text,93));
 select * into current_event from public.current_vehicle_tax_year_use where business_id=selected_business and vehicle_id=p_vehicle_id and tax_year=p_tax_year;
 if (current_event.id is null and p_expected_event_id is not null) or (current_event.id is not null and current_event.id is distinct from p_expected_event_id) then raise exception 'vehicle mileage facts changed; reload'; end if;
 insert into public.vehicle_tax_year_use_events(business_id,vehicle_id,tax_year,supersedes_event_id,total_miles_milli,source,request_key,actor_user_id)
 values(selected_business,p_vehicle_id,p_tax_year,current_event.id,p_total_miles_milli,'customer_total',btrim(p_request_key),actor) returning id into result;
 return result;
end $$;

create or replace function public.associate_customer_vehicle_expense(p_bookkeeping_record_id uuid,p_vehicle_id uuid,p_expense_kind text,p_request_key text)
returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=(select auth.uid()); selected_business uuid; result uuid;
begin
 if actor is null then raise exception 'authentication required'; end if;
 select record.business_id into selected_business from public.bookkeeping_records record join public.businesses b on b.id=record.business_id
  where record.id=p_bookkeeping_record_id and b.owner_user_id=actor;
 if selected_business is null or not exists(select 1 from public.business_vehicles v where v.id=p_vehicle_id and v.business_id=selected_business and v.archived_at is null)
   or p_expense_kind not in('fuel','insurance','repair','maintenance','registration','tires','parking','tolls','lease_payment','other_operating','purchase','improvement')
   or length(btrim(coalesce(p_request_key,''))) not between 1 and 160 then raise exception 'valid vehicle expense facts required'; end if;
 select id into result from public.vehicle_expense_association_events where business_id=selected_business and request_key=btrim(p_request_key); if result is not null then return result; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_bookkeeping_record_id::text,94));
 if exists(select 1 from public.vehicle_expense_association_events event where event.business_id=selected_business and event.bookkeeping_record_id=p_bookkeeping_record_id) then raise exception 'vehicle expense association changed; reload'; end if;
 insert into public.vehicle_expense_association_events(business_id,bookkeeping_record_id,vehicle_id,event_type,expense_kind,evidence_fingerprint,evidence_references,request_key,actor_user_id,provenance)
 values(selected_business,p_bookkeeping_record_id,p_vehicle_id,'associated',p_expense_kind,
   encode(extensions.digest(('vehicle-customer:v1:'||p_bookkeeping_record_id::text||':'||p_vehicle_id::text||':'||p_expense_kind)::bytea,'sha256'),'hex'),
   jsonb_build_array('customer_vehicle_selection'),btrim(p_request_key),actor,'customer') returning id into result;
 perform public.request_bookkeeping_processing(selected_business,p_bookkeeping_record_id,'deterministic_evaluation',
   'bookkeeping-evaluator:v1:record:'||p_bookkeeping_record_id::text||':vehicle-association:'||result::text);
 return result;
end $$;

revoke execute on function public.record_vehicle_identity(uuid,uuid,text,date,date,date,text) from public,anon;
revoke execute on function public.record_vehicle_tax_year_method(uuid,integer,uuid,text,text) from public,anon;
revoke execute on function public.record_vehicle_tax_year_total_miles(uuid,integer,uuid,bigint,text) from public,anon;
revoke execute on function public.associate_customer_vehicle_expense(uuid,uuid,text,text) from public,anon;
grant execute on function public.record_vehicle_identity(uuid,uuid,text,date,date,date,text) to authenticated;
grant execute on function public.record_vehicle_tax_year_method(uuid,integer,uuid,text,text) to authenticated;
grant execute on function public.record_vehicle_tax_year_total_miles(uuid,integer,uuid,bigint,text) to authenticated;
grant execute on function public.associate_customer_vehicle_expense(uuid,uuid,text,text) to authenticated;

create or replace function public.enqueue_vehicle_year_reevaluation() returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform public.request_bookkeeping_processing(association.business_id,association.bookkeeping_record_id,'deterministic_evaluation',
   'bookkeeping-evaluator:v1:record:'||association.bookkeeping_record_id::text||':vehicle-year:'||new.vehicle_id::text||':'||new.tax_year::text||':'||new.id::text)
 from public.current_vehicle_expense_associations association
 join public.bookkeeping_records record on record.id=association.bookkeeping_record_id and record.business_id=association.business_id
 where association.business_id=new.business_id and association.vehicle_id=new.vehicle_id and extract(year from record.occurred_on)=new.tax_year;
 return new;
end $$;
create trigger vehicle_method_enqueue after insert on public.vehicle_tax_year_method_events for each row execute function public.enqueue_vehicle_year_reevaluation();
create trigger vehicle_use_enqueue after insert on public.vehicle_tax_year_use_events for each row execute function public.enqueue_vehicle_year_reevaluation();
revoke execute on function public.enqueue_vehicle_year_reevaluation() from public,anon,authenticated,service_role;

comment on table public.vehicle_tax_year_method_events is 'Immutable per-vehicle/year deduction-method history; no silent method switching.';
comment on table public.vehicle_expense_association_events is 'Immutable links from preserved economic transactions to a vehicle and real-world expense kind.';
comment on table public.vehicle_deduction_assessments is 'Versioned vehicle/year tax calculation snapshots and CPA-review boundaries.';

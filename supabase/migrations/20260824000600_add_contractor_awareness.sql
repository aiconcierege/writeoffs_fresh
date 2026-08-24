-- Bounded contractor identity, payment association, and W-9 awareness.
-- These tables add context to canonical expenses; they are not a second ledger
-- and never make a definitive information-return filing determination.

create table public.canonical_contractors (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete restrict,
 request_key text not null, actor_user_id uuid not null references auth.users(id) on delete restrict,
 provenance text not null default 'user', created_at timestamptz not null default now(),
 constraint contractors_scope_unique unique(id,business_id), constraint contractors_request_unique unique(business_id,request_key),
 constraint contractors_provenance_check check(provenance='user')
);
create table public.canonical_contractor_events (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete restrict,
 contractor_id uuid not null, supersedes_event_id uuid, event_type text not null, display_name text not null,
 business_name text, active boolean not null, reason text, request_key text not null,
 provenance text not null default 'user', actor_user_id uuid not null references auth.users(id) on delete restrict,
 created_at timestamptz not null default now(),
 constraint contractor_events_scope_unique unique(id,business_id,contractor_id),
 constraint contractor_events_contractor_fkey foreign key(contractor_id,business_id) references public.canonical_contractors(id,business_id) on delete restrict,
 constraint contractor_events_predecessor_fkey foreign key(supersedes_event_id,business_id,contractor_id) references public.canonical_contractor_events(id,business_id,contractor_id) on delete restrict,
 constraint contractor_events_type_check check(event_type in ('created','corrected','status_changed')),
 constraint contractor_events_text_check check(length(btrim(display_name)) between 1 and 200 and (business_name is null or length(business_name)<=200) and (reason is null or length(reason)<=500)),
 constraint contractor_events_request_unique unique(business_id,request_key), constraint contractor_events_provenance_check check(provenance='user')
);
create unique index contractor_events_root_idx on public.canonical_contractor_events(contractor_id) where supersedes_event_id is null;
create unique index contractor_events_successor_idx on public.canonical_contractor_events(supersedes_event_id) where supersedes_event_id is not null;
create view public.current_canonical_contractors with(security_invoker=true) as select contractor.id,contractor.business_id,
 event.id current_event_id,event.display_name,event.business_name,event.active,event.created_at last_changed_at
 from public.canonical_contractors contractor join public.canonical_contractor_events event on event.contractor_id=contractor.id and event.business_id=contractor.business_id
 where not exists(select 1 from public.canonical_contractor_events successor where successor.supersedes_event_id=event.id);

create table public.contractor_payment_events (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete restrict,
 payment_association_id uuid not null, supersedes_event_id uuid, bookkeeping_record_id uuid not null, contractor_id uuid not null,
 event_type text not null, amount_cents bigint not null, paid_on date not null, payment_method text not null,
 payment_method_source text not null, reason text, request_key text not null, provenance text not null default 'user',
 actor_user_id uuid not null references auth.users(id) on delete restrict, created_at timestamptz not null default now(),
 constraint contractor_payment_scope_unique unique(id,business_id,payment_association_id),
 constraint contractor_payment_record_fkey foreign key(bookkeeping_record_id,business_id) references public.bookkeeping_records(id,business_id) on delete restrict,
 constraint contractor_payment_contractor_fkey foreign key(contractor_id,business_id) references public.canonical_contractors(id,business_id) on delete restrict,
 constraint contractor_payment_predecessor_fkey foreign key(supersedes_event_id,business_id,payment_association_id) references public.contractor_payment_events(id,business_id,payment_association_id) on delete restrict,
 constraint contractor_payment_type_check check(event_type in ('associated','corrected','removed')),
 constraint contractor_payment_amount_check check(amount_cents<0),
 constraint contractor_payment_method_check check(payment_method in ('cash','check','ach_zelle','payment_card','third_party_service','other','unknown')),
 constraint contractor_payment_method_source_check check(payment_method_source in ('manual_source','financial_source','customer','unknown')),
 constraint contractor_payment_request_unique unique(business_id,request_key), constraint contractor_payment_provenance_check check(provenance='user')
);
create unique index contractor_payment_root_idx on public.contractor_payment_events(payment_association_id) where supersedes_event_id is null;
create unique index contractor_payment_successor_idx on public.contractor_payment_events(supersedes_event_id) where supersedes_event_id is not null;
create unique index contractor_payment_one_root_per_record_idx on public.contractor_payment_events(business_id,bookkeeping_record_id) where supersedes_event_id is null;
create view public.current_contractor_payments with(security_invoker=true) as select events.* from public.contractor_payment_events events
 where not exists(select 1 from public.contractor_payment_events successor where successor.supersedes_event_id=events.id) and events.event_type<>'removed';

create table public.contractor_w9_events (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete restrict,
 contractor_id uuid not null, supersedes_event_id uuid, status text not null, evidence_note text, reason text,
 request_key text not null, provenance text not null default 'user', actor_user_id uuid not null references auth.users(id) on delete restrict,
 created_at timestamptz not null default now(), constraint contractor_w9_scope_unique unique(id,business_id,contractor_id),
 constraint contractor_w9_contractor_fkey foreign key(contractor_id,business_id) references public.canonical_contractors(id,business_id) on delete restrict,
 constraint contractor_w9_predecessor_fkey foreign key(supersedes_event_id,business_id,contractor_id) references public.contractor_w9_events(id,business_id,contractor_id) on delete restrict,
 constraint contractor_w9_status_check check(status in ('unknown','needed','on_file','needs_attention')),
 constraint contractor_w9_note_check check((evidence_note is null or length(evidence_note)<=500) and (reason is null or length(reason)<=500)),
 constraint contractor_w9_request_unique unique(business_id,request_key), constraint contractor_w9_provenance_check check(provenance='user')
);
create unique index contractor_w9_root_idx on public.contractor_w9_events(contractor_id) where supersedes_event_id is null;
create unique index contractor_w9_successor_idx on public.contractor_w9_events(supersedes_event_id) where supersedes_event_id is not null;
create view public.current_contractor_w9_status with(security_invoker=true) as select events.* from public.contractor_w9_events events
 where not exists(select 1 from public.contractor_w9_events successor where successor.supersedes_event_id=events.id);

create table public.contractor_awareness_rule_versions (
 id uuid primary key default gen_random_uuid(), tax_year integer not null, rule_key text not null,
 rule_version text not null, attention_amount_cents bigint not null, status text not null,
 created_at timestamptz not null default now(),
 constraint contractor_awareness_rule_unique unique(tax_year,rule_key,rule_version),
 constraint contractor_awareness_rule_check check(tax_year between 2000 and 2100 and rule_key='contractor_information_reporting_attention'
   and attention_amount_cents>0 and status in ('active','retired'))
);
insert into public.contractor_awareness_rule_versions(tax_year,rule_key,rule_version,attention_amount_cents,status) values
 (2025,'contractor_information_reporting_attention','contractor-awareness:v1',60000,'active'),
 (2026,'contractor_information_reporting_attention','contractor-awareness:v1',60000,'active');

create or replace function public.contractor_owner_business() returns public.businesses language plpgsql security definer set search_path='' as $$
declare selected public.businesses%rowtype; begin select * into selected from public.businesses where owner_user_id=(select auth.uid());
if not found then raise exception 'contractor Business is unavailable'; end if; return selected; end; $$;
create or replace function public.create_canonical_contractor(p_display_name text,p_business_name text,p_request_key text) returns uuid
language plpgsql security definer set search_path='' as $$ declare business public.businesses%rowtype; existing uuid; selected uuid:=gen_random_uuid(); begin
 business:=public.contractor_owner_business(); if length(btrim(coalesce(p_display_name,''))) not between 1 and 200 or length(btrim(coalesce(p_request_key,''))) not between 1 and 120 then raise exception 'contractor facts are invalid'; end if;
 select id into existing from public.canonical_contractors where business_id=business.id and request_key=btrim(p_request_key); if found then return existing; end if;
 insert into public.canonical_contractors(id,business_id,request_key,actor_user_id) values(selected,business.id,btrim(p_request_key),(select auth.uid()));
 insert into public.canonical_contractor_events(business_id,contractor_id,event_type,display_name,business_name,active,request_key,actor_user_id)
 values(business.id,selected,'created',btrim(p_display_name),nullif(btrim(p_business_name),''),true,concat(p_request_key,':created'),(select auth.uid()));
 insert into public.contractor_w9_events(business_id,contractor_id,status,request_key,actor_user_id) values(business.id,selected,'unknown',concat(p_request_key,':w9'),(select auth.uid())); return selected; end; $$;
create or replace function public.correct_canonical_contractor(p_contractor_id uuid,p_expected_event_id uuid,p_display_name text,p_business_name text,p_active boolean,p_request_key text) returns uuid
language plpgsql security definer set search_path='' as $$ declare business public.businesses%rowtype; current_event public.canonical_contractor_events%rowtype; next_id uuid:=gen_random_uuid(); begin
 business:=public.contractor_owner_business(); select * into current_event from public.canonical_contractor_events event where event.contractor_id=p_contractor_id and event.business_id=business.id and not exists(select 1 from public.canonical_contractor_events successor where successor.supersedes_event_id=event.id) for update;
 if exists(select 1 from public.canonical_contractor_events where business_id=business.id and request_key=btrim(p_request_key)) then return (select id from public.canonical_contractor_events where business_id=business.id and request_key=btrim(p_request_key)); end if;
 if not found or current_event.id is distinct from p_expected_event_id then raise exception 'contractor changed; reload before correcting'; end if;
 if length(btrim(coalesce(p_display_name,''))) not between 1 and 200 then raise exception 'contractor facts are invalid'; end if;
 insert into public.canonical_contractor_events(id,business_id,contractor_id,supersedes_event_id,event_type,display_name,business_name,active,reason,request_key,actor_user_id)
 values(next_id,business.id,p_contractor_id,current_event.id,case when current_event.active is distinct from p_active then 'status_changed' else 'corrected' end,btrim(p_display_name),nullif(btrim(p_business_name),''),p_active,'Customer corrected contractor details.',btrim(p_request_key),(select auth.uid())); return next_id; end; $$;
create or replace function public.associate_contractor_payment(p_bookkeeping_record_id uuid,p_contractor_id uuid,p_expected_event_id uuid,p_payment_method text,p_payment_method_source text,p_remove boolean,p_request_key text) returns uuid
language plpgsql security definer set search_path='' as $$ declare business public.businesses%rowtype; record public.bookkeeping_records%rowtype; current_event public.contractor_payment_events%rowtype; association_id uuid; next_id uuid:=gen_random_uuid(); begin
 business:=public.contractor_owner_business(); if not exists(select 1 from public.current_canonical_contractors where id=p_contractor_id and business_id=business.id and (active or p_remove)) then raise exception 'contractor is unavailable'; end if;
 if exists(select 1 from public.contractor_payment_events where business_id=business.id and request_key=btrim(p_request_key)) then return (select id from public.contractor_payment_events where business_id=business.id and request_key=btrim(p_request_key)); end if;
 select * into record from public.bookkeeping_records where id=p_bookkeeping_record_id and business_id=business.id for update; if not found or record.amount_cents>=0 or record.occurred_on is null then raise exception 'contractor payment must be a dated outflow'; end if;
 if not exists(select 1 from public.bookkeeping_decisions decision where decision.bookkeeping_record_id=record.id and decision.business_id=business.id and decision.bookkeeping_nature='expense' and decision.treatment in ('business','mixed_use') and not exists(select 1 from public.bookkeeping_decisions successor where successor.supersedes_decision_id=decision.id)) then raise exception 'contractor payment must be a current business expense'; end if;
 select * into current_event from public.contractor_payment_events event where business_id=business.id and bookkeeping_record_id=record.id
  and not exists(select 1 from public.contractor_payment_events successor where successor.supersedes_event_id=event.id) for update;
 if current_event.id is distinct from p_expected_event_id and not (current_event.event_type='removed' and p_expected_event_id is null) then raise exception 'contractor payment changed; reload before correcting'; end if;
 if p_payment_method not in ('cash','check','ach_zelle','payment_card','third_party_service','other','unknown') or p_payment_method_source not in ('manual_source','financial_source','customer','unknown') then raise exception 'payment method is invalid'; end if;
 association_id:=coalesce(current_event.payment_association_id,gen_random_uuid());
 insert into public.contractor_payment_events(id,business_id,payment_association_id,supersedes_event_id,bookkeeping_record_id,contractor_id,event_type,amount_cents,paid_on,payment_method,payment_method_source,reason,request_key,actor_user_id)
 values(next_id,business.id,association_id,current_event.id,record.id,p_contractor_id,case when p_remove then 'removed' when current_event.id is null then 'associated' else 'corrected' end,record.amount_cents,record.occurred_on,p_payment_method,p_payment_method_source,case when p_remove then 'Customer removed contractor context.' else 'Customer confirmed contractor payment facts.' end,btrim(p_request_key),(select auth.uid())); return next_id; end; $$;
create or replace function public.record_contractor_w9_status(p_contractor_id uuid,p_expected_event_id uuid,p_status text,p_evidence_note text,p_request_key text) returns uuid
language plpgsql security definer set search_path='' as $$ declare business public.businesses%rowtype; current_event public.contractor_w9_events%rowtype; next_id uuid:=gen_random_uuid(); begin
 business:=public.contractor_owner_business(); select * into current_event from public.contractor_w9_events event where contractor_id=p_contractor_id and business_id=business.id
  and not exists(select 1 from public.contractor_w9_events successor where successor.supersedes_event_id=event.id) for update;
 if exists(select 1 from public.contractor_w9_events where business_id=business.id and request_key=btrim(p_request_key)) then return (select id from public.contractor_w9_events where business_id=business.id and request_key=btrim(p_request_key)); end if;
 if not found or current_event.id is distinct from p_expected_event_id then raise exception 'W-9 status changed; reload before correcting'; end if;
 if p_status not in ('unknown','needed','on_file','needs_attention') then raise exception 'W-9 status is invalid'; end if;
 insert into public.contractor_w9_events(id,business_id,contractor_id,supersedes_event_id,status,evidence_note,reason,request_key,actor_user_id)
 values(next_id,business.id,p_contractor_id,current_event.id,p_status,nullif(btrim(p_evidence_note),''),'Customer updated W-9 availability.',btrim(p_request_key),(select auth.uid())); return next_id; end; $$;

create trigger contractors_no_mutation before update or delete on public.canonical_contractors for each row execute function public.reject_canonical_bookkeeping_mutation();
create trigger contractor_events_no_mutation before update or delete on public.canonical_contractor_events for each row execute function public.reject_canonical_bookkeeping_mutation();
create trigger contractor_payments_no_mutation before update or delete on public.contractor_payment_events for each row execute function public.reject_canonical_bookkeeping_mutation();
create trigger contractor_w9_no_mutation before update or delete on public.contractor_w9_events for each row execute function public.reject_canonical_bookkeeping_mutation();
create trigger contractor_rules_no_mutation before update or delete on public.contractor_awareness_rule_versions for each row execute function public.reject_canonical_bookkeeping_mutation();
alter table public.canonical_contractors enable row level security; alter table public.canonical_contractor_events enable row level security; alter table public.contractor_payment_events enable row level security; alter table public.contractor_w9_events enable row level security;
create policy contractors_select_own on public.canonical_contractors for select to authenticated using(exists(select 1 from public.businesses where id=canonical_contractors.business_id and owner_user_id=(select auth.uid())));
create policy contractor_events_select_own on public.canonical_contractor_events for select to authenticated using(exists(select 1 from public.businesses where id=canonical_contractor_events.business_id and owner_user_id=(select auth.uid())));
create policy contractor_payments_select_own on public.contractor_payment_events for select to authenticated using(exists(select 1 from public.businesses where id=contractor_payment_events.business_id and owner_user_id=(select auth.uid())));
create policy contractor_w9_select_own on public.contractor_w9_events for select to authenticated using(exists(select 1 from public.businesses where id=contractor_w9_events.business_id and owner_user_id=(select auth.uid())));
grant select on public.canonical_contractors,public.canonical_contractor_events,public.contractor_payment_events,public.contractor_w9_events,public.current_canonical_contractors,public.current_contractor_payments,public.current_contractor_w9_status,public.contractor_awareness_rule_versions to authenticated,service_role;
grant insert on public.canonical_contractors,public.canonical_contractor_events,public.contractor_payment_events,public.contractor_w9_events to service_role;
revoke execute on function public.contractor_owner_business(),public.create_canonical_contractor(text,text,text),public.correct_canonical_contractor(uuid,uuid,text,text,boolean,text),public.associate_contractor_payment(uuid,uuid,uuid,text,text,boolean,text),public.record_contractor_w9_status(uuid,uuid,text,text,text) from public,anon;
grant execute on function public.create_canonical_contractor(text,text,text),public.correct_canonical_contractor(uuid,uuid,text,text,boolean,text),public.associate_contractor_payment(uuid,uuid,uuid,text,text,boolean,text),public.record_contractor_w9_status(uuid,uuid,text,text,text) to authenticated,service_role;

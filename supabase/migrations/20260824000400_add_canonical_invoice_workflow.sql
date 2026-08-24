-- Optional invoice context for cash-basis bookkeeping. Invoices never create
-- income; only a link to an already-established canonical income record can
-- move an invoice to paid.

create table public.invoice_customers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  display_name text not null,
  email text,
  normalized_identity text not null,
  request_key text not null,
  provenance text not null default 'user',
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint invoice_customers_id_business_unique unique(id,business_id),
  constraint invoice_customers_request_unique unique(business_id,request_key),
  constraint invoice_customers_identity_unique unique(business_id,normalized_identity),
  constraint invoice_customers_name_check check(length(btrim(display_name)) between 1 and 200),
  constraint invoice_customers_email_check check(email is null or (length(email)<=320 and position('@' in email)>1)),
  constraint invoice_customers_provenance_check check(provenance='user')
);

create table public.canonical_invoices (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  customer_id uuid not null,
  invoice_sequence bigint not null,
  invoice_number text not null,
  original_amount_cents bigint not null,
  original_currency text not null default 'USD',
  original_issue_date date not null,
  original_due_date date,
  original_description text not null,
  original_job_label text,
  original_location text,
  original_note text,
  request_key text not null,
  provenance text not null default 'user',
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint canonical_invoices_id_business_unique unique(id,business_id),
  constraint canonical_invoices_customer_fkey foreign key(customer_id,business_id)
    references public.invoice_customers(id,business_id) on delete restrict,
  constraint canonical_invoices_number_unique unique(business_id,invoice_number),
  constraint canonical_invoices_sequence_unique unique(business_id,invoice_sequence),
  constraint canonical_invoices_request_unique unique(business_id,request_key),
  constraint canonical_invoices_amount_check check(original_amount_cents>0),
  constraint canonical_invoices_currency_check check(original_currency~'^[A-Z]{3}$'),
  constraint canonical_invoices_dates_check check(original_due_date is null or original_due_date>=original_issue_date),
  constraint canonical_invoices_description_check check(length(btrim(original_description)) between 1 and 500),
  constraint canonical_invoices_context_check check(
    (original_job_label is null or length(original_job_label)<=200)
    and (original_location is null or length(original_location)<=300)
    and (original_note is null or length(original_note)<=1000)),
  constraint canonical_invoices_provenance_check check(provenance='user')
);

create table public.canonical_invoice_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  invoice_id uuid not null,
  supersedes_event_id uuid,
  event_type text not null,
  customer_id uuid not null,
  customer_name text not null,
  customer_email text,
  amount_cents bigint not null,
  currency text not null,
  issue_date date not null,
  due_date date,
  description text not null,
  job_label text,
  location text,
  note text,
  reason text,
  request_key text not null,
  provenance text not null default 'user',
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint canonical_invoice_events_scope_unique unique(id,business_id,invoice_id),
  constraint canonical_invoice_events_invoice_fkey foreign key(invoice_id,business_id)
    references public.canonical_invoices(id,business_id) on delete restrict,
  constraint canonical_invoice_events_customer_fkey foreign key(customer_id,business_id)
    references public.invoice_customers(id,business_id) on delete restrict,
  constraint canonical_invoice_events_predecessor_fkey
    foreign key(supersedes_event_id,business_id,invoice_id)
    references public.canonical_invoice_events(id,business_id,invoice_id) on delete restrict,
  constraint canonical_invoice_events_type_check check(event_type in ('created','corrected','sent','paid','canceled')),
  constraint canonical_invoice_events_amount_check check(amount_cents>0),
  constraint canonical_invoice_events_currency_check check(currency~'^[A-Z]{3}$'),
  constraint canonical_invoice_events_dates_check check(due_date is null or due_date>=issue_date),
  constraint canonical_invoice_events_text_check check(
    length(btrim(customer_name)) between 1 and 200 and length(btrim(description)) between 1 and 500
    and (customer_email is null or (length(customer_email)<=320 and position('@' in customer_email)>1))
    and (job_label is null or length(job_label)<=200) and (location is null or length(location)<=300)
    and (note is null or length(note)<=1000) and (reason is null or length(reason)<=500)),
  constraint canonical_invoice_events_request_unique unique(business_id,request_key),
  constraint canonical_invoice_events_provenance_check check(provenance='user')
);
create unique index canonical_invoice_events_root_idx on public.canonical_invoice_events(invoice_id) where supersedes_event_id is null;
create unique index canonical_invoice_events_successor_idx on public.canonical_invoice_events(supersedes_event_id) where supersedes_event_id is not null;

create table public.invoice_income_links (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  invoice_id uuid not null,
  bookkeeping_record_id uuid not null,
  linked_amount_cents bigint not null,
  request_key text not null,
  provenance text not null default 'user',
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint invoice_income_links_scope_unique unique(id,business_id),
  constraint invoice_income_links_invoice_fkey foreign key(invoice_id,business_id)
    references public.canonical_invoices(id,business_id) on delete restrict,
  constraint invoice_income_links_record_fkey foreign key(bookkeeping_record_id,business_id)
    references public.bookkeeping_records(id,business_id) on delete restrict,
  constraint invoice_income_links_invoice_unique unique(invoice_id),
  constraint invoice_income_links_record_unique unique(bookkeeping_record_id),
  constraint invoice_income_links_request_unique unique(business_id,request_key),
  constraint invoice_income_links_amount_check check(linked_amount_cents>0),
  constraint invoice_income_links_provenance_check check(provenance='user')
);

create view public.current_canonical_invoices with(security_invoker=true) as
select invoice.id,invoice.business_id,invoice.invoice_number,invoice.invoice_sequence,
  event.id as current_event_id,event.event_type,
  case when event.event_type='paid' then 'paid' when event.event_type='canceled' then 'canceled' else 'awaiting_payment' end as status,
  event.customer_id,event.customer_name,event.customer_email,event.amount_cents,event.currency,
  event.issue_date,event.due_date,event.description,event.job_label,event.location,event.note,
  event.created_at as last_changed_at,link.id as income_link_id,link.bookkeeping_record_id
from public.canonical_invoices invoice
join public.canonical_invoice_events event on event.invoice_id=invoice.id and event.business_id=invoice.business_id
left join public.invoice_income_links link on link.invoice_id=invoice.id and link.business_id=invoice.business_id
where not exists(select 1 from public.canonical_invoice_events successor where successor.supersedes_event_id=event.id);

create or replace function public.reject_invoice_history_mutation() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'invoice history is append-only'; end; $$;
create trigger invoice_customers_no_mutation before update or delete on public.invoice_customers for each row execute function public.reject_invoice_history_mutation();
create trigger canonical_invoices_no_mutation before update or delete on public.canonical_invoices for each row execute function public.reject_invoice_history_mutation();
create trigger canonical_invoice_events_no_mutation before update or delete on public.canonical_invoice_events for each row execute function public.reject_invoice_history_mutation();
create trigger invoice_income_links_no_mutation before update or delete on public.invoice_income_links for each row execute function public.reject_invoice_history_mutation();

create or replace function public.invoice_owner_business() returns public.businesses
language plpgsql security definer set search_path='' as $$
declare selected public.businesses%rowtype;
begin select * into selected from public.businesses where owner_user_id=(select auth.uid());
if not found then raise exception 'invoice Business is unavailable'; end if; return selected; end; $$;

create or replace function public.invoice_customer(
  p_business_id uuid,p_name text,p_email text,p_request_key text
) returns public.invoice_customers language plpgsql security definer set search_path='' as $$
declare selected public.invoice_customers%rowtype; actor uuid:=(select auth.uid()); identity text;
begin
  identity:=lower(regexp_replace(btrim(p_name),'\s+',' ','g'))||'|'||lower(btrim(coalesce(p_email,'')));
  select * into selected from public.invoice_customers where business_id=p_business_id and normalized_identity=identity;
  if found then return selected; end if;
  insert into public.invoice_customers(business_id,display_name,email,normalized_identity,request_key,actor_user_id)
  values(p_business_id,btrim(p_name),nullif(lower(btrim(p_email)),''),identity,p_request_key,actor)
  on conflict(business_id,normalized_identity) do nothing returning * into selected;
  if not found then select * into selected from public.invoice_customers where business_id=p_business_id and normalized_identity=identity; end if;
  return selected;
end; $$;

create or replace function public.create_canonical_invoice(
  p_customer_name text,p_customer_email text,p_amount_cents bigint,p_currency text,
  p_issue_date date,p_due_date date,p_description text,p_job_label text,p_location text,
  p_note text,p_request_key text
) returns uuid language plpgsql security definer set search_path='' as $$
declare business public.businesses%rowtype; customer public.invoice_customers%rowtype;
  selected public.canonical_invoices%rowtype; selected_customer public.invoice_customers%rowtype;
  event_id uuid:=gen_random_uuid(); next_sequence bigint;
begin
  business:=public.invoice_owner_business();
  if p_amount_cents<=0 or p_currency!~'^[A-Z]{3}$' or p_issue_date is null
    or p_issue_date>current_date or (p_due_date is not null and p_due_date<p_issue_date)
    or length(btrim(coalesce(p_customer_name,''))) not between 1 and 200
    or length(btrim(coalesce(p_description,''))) not between 1 and 500
    or length(btrim(coalesce(p_request_key,''))) not between 1 and 120
  then raise exception 'invoice facts are invalid'; end if;
  perform pg_advisory_xact_lock(hashtextextended(concat(business.id,':invoice:',btrim(p_request_key)),79));
  select * into selected from public.canonical_invoices where business_id=business.id and request_key=btrim(p_request_key);
  if found then
    select * into selected_customer from public.invoice_customers where id=selected.customer_id and business_id=business.id;
    if selected.original_amount_cents is distinct from p_amount_cents
      or selected.original_currency is distinct from upper(p_currency)
      or selected.original_issue_date is distinct from p_issue_date
      or selected.original_due_date is distinct from p_due_date
      or selected.original_description is distinct from btrim(p_description)
      or selected.original_job_label is distinct from nullif(btrim(p_job_label),'')
      or selected.original_location is distinct from nullif(btrim(p_location),'')
      or selected.original_note is distinct from nullif(btrim(p_note),'')
      or selected_customer.display_name is distinct from btrim(p_customer_name)
      or selected_customer.email is distinct from nullif(lower(btrim(p_customer_email)),'')
    then raise exception 'invoice request identity was reused with different facts'; end if;
    return selected.id;
  end if;
  customer:=public.invoice_customer(business.id,p_customer_name,p_customer_email,concat('invoice-customer:',p_request_key));
  perform pg_advisory_xact_lock(hashtextextended(concat(business.id,':invoice-number'),79));
  select coalesce(max(invoice_sequence),0)+1 into next_sequence from public.canonical_invoices where business_id=business.id;
  insert into public.canonical_invoices(business_id,customer_id,invoice_sequence,invoice_number,
    original_amount_cents,original_currency,original_issue_date,original_due_date,original_description,
    original_job_label,original_location,original_note,request_key,actor_user_id)
  values(business.id,customer.id,next_sequence,concat('INV-',lpad(next_sequence::text,4,'0')),
    p_amount_cents,upper(p_currency),p_issue_date,p_due_date,btrim(p_description),nullif(btrim(p_job_label),''),
    nullif(btrim(p_location),''),nullif(btrim(p_note),''),btrim(p_request_key),(select auth.uid())) returning * into selected;
  insert into public.canonical_invoice_events(id,business_id,invoice_id,event_type,customer_id,customer_name,
    customer_email,amount_cents,currency,issue_date,due_date,description,job_label,location,note,request_key,actor_user_id)
  values(event_id,business.id,selected.id,'created',customer.id,customer.display_name,customer.email,
    p_amount_cents,upper(p_currency),p_issue_date,p_due_date,btrim(p_description),nullif(btrim(p_job_label),''),
    nullif(btrim(p_location),''),nullif(btrim(p_note),''),concat(btrim(p_request_key),':created'),(select auth.uid()));
  return selected.id;
end; $$;

create or replace function public.correct_canonical_invoice(
  p_invoice_id uuid,p_expected_current_event_id uuid,p_customer_name text,p_customer_email text,
  p_amount_cents bigint,p_currency text,p_issue_date date,p_due_date date,p_description text,
  p_job_label text,p_location text,p_note text,p_request_key text
) returns uuid language plpgsql security definer set search_path='' as $$
declare business public.businesses%rowtype; current_event public.canonical_invoice_events%rowtype;
 customer public.invoice_customers%rowtype; next_event uuid:=gen_random_uuid();
begin
 business:=public.invoice_owner_business();
 if exists(select 1 from public.canonical_invoice_events where business_id=business.id and request_key=btrim(p_request_key)) then return p_invoice_id; end if;
 select event.* into current_event from public.canonical_invoice_events event where event.invoice_id=p_invoice_id and event.business_id=business.id
  and not exists(select 1 from public.canonical_invoice_events successor where successor.supersedes_event_id=event.id) for update;
 if not found or current_event.id is distinct from p_expected_current_event_id then raise exception 'invoice changed; reload before correcting'; end if;
 if current_event.event_type in ('paid','canceled') or exists(select 1 from public.invoice_income_links where invoice_id=p_invoice_id)
 then raise exception 'paid or canceled invoice cannot be corrected'; end if;
 if p_amount_cents<=0 or p_currency!~'^[A-Z]{3}$' or p_issue_date>current_date or (p_due_date is not null and p_due_date<p_issue_date)
  or length(btrim(coalesce(p_customer_name,''))) not between 1 and 200 or length(btrim(coalesce(p_description,''))) not between 1 and 500
 then raise exception 'invoice facts are invalid'; end if;
 customer:=public.invoice_customer(business.id,p_customer_name,p_customer_email,concat('invoice-correction-customer:',p_request_key));
 insert into public.canonical_invoice_events(id,business_id,invoice_id,supersedes_event_id,event_type,customer_id,customer_name,
  customer_email,amount_cents,currency,issue_date,due_date,description,job_label,location,note,reason,request_key,actor_user_id)
 values(next_event,business.id,p_invoice_id,current_event.id,'corrected',customer.id,customer.display_name,customer.email,
  p_amount_cents,upper(p_currency),p_issue_date,p_due_date,btrim(p_description),nullif(btrim(p_job_label),''),
  nullif(btrim(p_location),''),nullif(btrim(p_note),''),'Customer corrected invoice details.',btrim(p_request_key),(select auth.uid()));
 return p_invoice_id;
end; $$;

create or replace function public.mark_canonical_invoice_sent(
 p_invoice_id uuid,p_expected_current_event_id uuid,p_request_key text
) returns uuid language plpgsql security definer set search_path='' as $$
declare business public.businesses%rowtype; current_event public.canonical_invoice_events%rowtype; next_event uuid:=gen_random_uuid();
begin business:=public.invoice_owner_business();
 if exists(select 1 from public.canonical_invoice_events where business_id=business.id and request_key=btrim(p_request_key)) then return p_invoice_id; end if;
 select event.* into current_event from public.canonical_invoice_events event where event.invoice_id=p_invoice_id and event.business_id=business.id
  and not exists(select 1 from public.canonical_invoice_events successor where successor.supersedes_event_id=event.id) for update;
 if not found or current_event.id is distinct from p_expected_current_event_id or current_event.event_type in ('paid','canceled') then raise exception 'invoice cannot be marked shared'; end if;
 if current_event.event_type='sent' then return p_invoice_id; end if;
 insert into public.canonical_invoice_events(id,business_id,invoice_id,supersedes_event_id,event_type,customer_id,customer_name,customer_email,
  amount_cents,currency,issue_date,due_date,description,job_label,location,note,reason,request_key,actor_user_id)
 select next_event,business.id,p_invoice_id,current_event.id,'sent',current_event.customer_id,current_event.customer_name,current_event.customer_email,
  current_event.amount_cents,current_event.currency,current_event.issue_date,current_event.due_date,current_event.description,current_event.job_label,
  current_event.location,current_event.note,'Customer marked invoice as shared.',btrim(p_request_key),(select auth.uid()); return p_invoice_id;
end; $$;

create or replace function public.cancel_canonical_invoice(
 p_invoice_id uuid,p_expected_current_event_id uuid,p_request_key text,p_reason text
) returns uuid language plpgsql security definer set search_path='' as $$
declare business public.businesses%rowtype; current_event public.canonical_invoice_events%rowtype; next_event uuid:=gen_random_uuid();
begin business:=public.invoice_owner_business();
 if exists(select 1 from public.canonical_invoice_events where business_id=business.id and request_key=btrim(p_request_key)) then return p_invoice_id; end if;
 select event.* into current_event from public.canonical_invoice_events event where event.invoice_id=p_invoice_id and event.business_id=business.id
  and not exists(select 1 from public.canonical_invoice_events successor where successor.supersedes_event_id=event.id) for update;
 if not found or current_event.id is distinct from p_expected_current_event_id or current_event.event_type in ('paid','canceled')
  or exists(select 1 from public.invoice_income_links where invoice_id=p_invoice_id)
 then raise exception 'paid, canceled, or changed invoice cannot be canceled'; end if;
 insert into public.canonical_invoice_events(id,business_id,invoice_id,supersedes_event_id,event_type,customer_id,customer_name,customer_email,
  amount_cents,currency,issue_date,due_date,description,job_label,location,note,reason,request_key,actor_user_id)
 select next_event,business.id,p_invoice_id,current_event.id,'canceled',current_event.customer_id,current_event.customer_name,current_event.customer_email,
  current_event.amount_cents,current_event.currency,current_event.issue_date,current_event.due_date,current_event.description,current_event.job_label,
  current_event.location,current_event.note,btrim(p_reason),btrim(p_request_key),(select auth.uid()); return p_invoice_id;
end; $$;

create or replace function public.link_invoice_to_business_income(
 p_invoice_id uuid,p_expected_current_event_id uuid,p_bookkeeping_record_id uuid,p_request_key text
) returns uuid language plpgsql security definer set search_path='' as $$
declare business public.businesses%rowtype; invoice public.current_canonical_invoices%rowtype; record public.bookkeeping_records%rowtype;
 link_id uuid; paid_event_id uuid:=gen_random_uuid();
begin business:=public.invoice_owner_business();
 select id into link_id from public.invoice_income_links where business_id=business.id and request_key=btrim(p_request_key); if found then return link_id; end if;
 perform 1 from public.canonical_invoices where id=p_invoice_id and business_id=business.id for update;
 select current.* into invoice from public.current_canonical_invoices current where current.id=p_invoice_id and current.business_id=business.id;
 if not found or invoice.current_event_id is distinct from p_expected_current_event_id or invoice.status<>'awaiting_payment' then raise exception 'invoice is unavailable for payment'; end if;
 perform 1 from public.canonical_invoice_events where id=invoice.current_event_id and business_id=business.id for update;
 select * into record from public.bookkeeping_records where id=p_bookkeeping_record_id and business_id=business.id for update;
 if not found or record.amount_cents is distinct from invoice.amount_cents or record.currency is distinct from invoice.currency
  or record.occurred_on<invoice.issue_date then raise exception 'income does not exactly satisfy invoice'; end if;
 if not exists(select 1 from public.bookkeeping_decisions decision where decision.business_id=business.id and decision.bookkeeping_record_id=record.id
  and decision.bookkeeping_nature='business_income' and decision.treatment='business'
  and not exists(select 1 from public.bookkeeping_decisions successor where successor.supersedes_decision_id=decision.id))
 then raise exception 'invoice payment requires established business income'; end if;
 if exists(select 1 from public.current_bookkeeping_compound_reconciliations active where active.business_id=business.id and active.anchor_bookkeeping_record_id=record.id)
  or exists(select 1 from public.current_bookkeeping_record_convergences convergence where convergence.business_id=business.id and convergence.absorbed_record_id=record.id)
  or exists(select 1 from public.manual_financial_source_events event where event.business_id=business.id and event.bookkeeping_record_id=record.id
    and exists(select 1 from public.manual_financial_source_events successor where successor.supersedes_event_id=event.id))
 then raise exception 'invoice payment record is not current'; end if;
 insert into public.invoice_income_links(business_id,invoice_id,bookkeeping_record_id,linked_amount_cents,request_key,actor_user_id)
 values(business.id,invoice.id,record.id,invoice.amount_cents,btrim(p_request_key),(select auth.uid())) returning id into link_id;
 insert into public.canonical_invoice_events(id,business_id,invoice_id,supersedes_event_id,event_type,customer_id,customer_name,customer_email,
  amount_cents,currency,issue_date,due_date,description,job_label,location,note,reason,request_key,actor_user_id)
 values(paid_event_id,business.id,invoice.id,invoice.current_event_id,'paid',invoice.customer_id,invoice.customer_name,invoice.customer_email,
  invoice.amount_cents,invoice.currency,invoice.issue_date,invoice.due_date,invoice.description,invoice.job_label,invoice.location,invoice.note,
  'Customer associated established business income with this invoice.',concat(btrim(p_request_key),':paid'),(select auth.uid()));
 return link_id;
end; $$;

alter table public.invoice_customers enable row level security; alter table public.canonical_invoices enable row level security;
alter table public.canonical_invoice_events enable row level security; alter table public.invoice_income_links enable row level security;
create policy invoice_customers_select_own on public.invoice_customers for select to authenticated using(exists(select 1 from public.businesses where businesses.id=invoice_customers.business_id and businesses.owner_user_id=(select auth.uid())));
create policy canonical_invoices_select_own on public.canonical_invoices for select to authenticated using(exists(select 1 from public.businesses where businesses.id=canonical_invoices.business_id and businesses.owner_user_id=(select auth.uid())));
create policy canonical_invoice_events_select_own on public.canonical_invoice_events for select to authenticated using(exists(select 1 from public.businesses where businesses.id=canonical_invoice_events.business_id and businesses.owner_user_id=(select auth.uid())));
create policy invoice_income_links_select_own on public.invoice_income_links for select to authenticated using(exists(select 1 from public.businesses where businesses.id=invoice_income_links.business_id and businesses.owner_user_id=(select auth.uid())));
revoke all on public.invoice_customers,public.canonical_invoices,public.canonical_invoice_events,public.invoice_income_links from public,anon,authenticated;
grant select on public.invoice_customers,public.canonical_invoices,public.canonical_invoice_events,public.invoice_income_links,public.current_canonical_invoices to authenticated;
grant select,insert on public.invoice_customers,public.canonical_invoices,public.canonical_invoice_events,public.invoice_income_links to service_role;
revoke execute on function public.invoice_owner_business(),public.invoice_customer(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.create_canonical_invoice(text,text,bigint,text,date,date,text,text,text,text,text),
 public.correct_canonical_invoice(uuid,uuid,text,text,bigint,text,date,date,text,text,text,text,text),
 public.mark_canonical_invoice_sent(uuid,uuid,text),public.cancel_canonical_invoice(uuid,uuid,text,text),
 public.link_invoice_to_business_income(uuid,uuid,uuid,text) to authenticated;
revoke execute on function public.create_canonical_invoice(text,text,bigint,text,date,date,text,text,text,text,text),
 public.correct_canonical_invoice(uuid,uuid,text,text,bigint,text,date,date,text,text,text,text,text),
 public.mark_canonical_invoice_sent(uuid,uuid,text),public.cancel_canonical_invoice(uuid,uuid,text,text),
 public.link_invoice_to_business_income(uuid,uuid,uuid,text) from public,anon;
grant execute on function public.invoice_owner_business(),public.invoice_customer(uuid,text,text,text),
 public.create_canonical_invoice(text,text,bigint,text,date,date,text,text,text,text,text),
 public.correct_canonical_invoice(uuid,uuid,text,text,bigint,text,date,date,text,text,text,text,text),
 public.mark_canonical_invoice_sent(uuid,uuid,text),public.cancel_canonical_invoice(uuid,uuid,text,text),
 public.link_invoice_to_business_income(uuid,uuid,uuid,text) to service_role;

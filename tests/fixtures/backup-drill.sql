create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
do $$ begin
  if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
end $$;

create table public.businesses(id uuid primary key, owner_user_id uuid not null, name text not null);
create table public.receipts(id uuid primary key, business_id uuid not null references public.businesses, storage_path text not null, amount_cents bigint not null);
create table public.bookkeeping_records(id uuid primary key, business_id uuid not null references public.businesses, amount_cents bigint not null);
create table public.bookkeeping_decisions(id uuid primary key, business_id uuid not null references public.businesses, record_id uuid not null references public.bookkeeping_records, treatment text not null, is_current boolean not null);
create table public.customer_correction_events(id uuid primary key, business_id uuid not null references public.businesses, record_id uuid not null references public.bookkeeping_records, correction text not null, created_at timestamptz not null);
create table public.canonical_mileage_entries(id uuid primary key, business_id uuid not null references public.businesses, miles numeric(12,3) not null, occurred_on date not null);

alter table public.businesses enable row level security;
alter table public.receipts enable row level security;
alter table public.bookkeeping_records enable row level security;
alter table public.bookkeeping_decisions enable row level security;
alter table public.customer_correction_events enable row level security;
alter table public.canonical_mileage_entries enable row level security;

create policy businesses_own on public.businesses to authenticated using(owner_user_id=auth.uid());
create policy receipts_own on public.receipts to authenticated using(exists(select 1 from public.businesses b where b.id=business_id and b.owner_user_id=auth.uid()));
create policy records_own on public.bookkeeping_records to authenticated using(exists(select 1 from public.businesses b where b.id=business_id and b.owner_user_id=auth.uid()));
create policy decisions_own on public.bookkeeping_decisions to authenticated using(exists(select 1 from public.businesses b where b.id=business_id and b.owner_user_id=auth.uid()));
create policy corrections_own on public.customer_correction_events to authenticated using(exists(select 1 from public.businesses b where b.id=business_id and b.owner_user_id=auth.uid()));
create policy mileage_own on public.canonical_mileage_entries to authenticated using(exists(select 1 from public.businesses b where b.id=business_id and b.owner_user_id=auth.uid()));

grant usage on schema public,auth to authenticated;
grant select on all tables in schema public to authenticated;
grant execute on function auth.uid() to authenticated;

insert into public.businesses values
 ('10000000-0000-0000-0000-000000000001','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Tenant A'),
 ('20000000-0000-0000-0000-000000000002','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','Tenant B');
insert into public.receipts values
 ('30000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001','receipts/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/drill-receipt.pdf',21789);
insert into public.bookkeeping_records values
 ('40000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000001',21789);
insert into public.bookkeeping_decisions values
 ('50000000-0000-0000-0000-000000000005','10000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000004','personal',true);
insert into public.customer_correction_events values
 ('60000000-0000-0000-0000-000000000006','10000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000004','personal','2026-09-09T12:00:00Z');
insert into public.canonical_mileage_entries values
 ('70000000-0000-0000-0000-000000000007','10000000-0000-0000-0000-000000000001',12.375,'2026-09-08');

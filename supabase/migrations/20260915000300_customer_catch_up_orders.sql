-- Consent and payment authorize historical service coverage; neither changes books.
create table public.customer_catch_up_orders (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  start_month date not null check(extract(day from start_month)=1),
  included_from date not null,
  additional_months integer not null check(additional_months>0),
  amount_cents integer not null check(amount_cents=additional_months*2000),
  consent_at timestamptz not null default now(),
  paid_at timestamptz,
  provider_session_id text unique,
  unique(business_id,start_month)
);
alter table public.customer_catch_up_orders enable row level security;
revoke all on public.customer_catch_up_orders from public,anon,authenticated;
grant select on public.customer_catch_up_orders to authenticated;
grant all on public.customer_catch_up_orders to service_role;
create policy catch_up_orders_own on public.customer_catch_up_orders for select to authenticated using(
  exists(select 1 from public.businesses b where b.id=business_id and b.owner_user_id=(select auth.uid())));

create function public.customer_coverage_start(p_business_id uuid) returns date language sql stable security definer set search_path='' as $$
 select least((s.joined_month-interval '1 month')::date,s.grandfathered_start_date,
   (select min(o.start_month) from public.customer_catch_up_orders o where o.business_id=s.business_id and o.paid_at is not null))
 from public.business_customer_setup s where s.business_id=p_business_id
$$;
revoke all on function public.customer_coverage_start(uuid) from public,anon,authenticated;

create function public.choose_customer_start_month(p_start_month date,p_agreed boolean default false,p_confirm boolean default false,p_expected_amount integer default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare selected_id uuid:=public.require_customer_setup_owner(); joined date; covered date; months integer; selected_order public.customer_catch_up_orders%rowtype;
begin
 select joined_month into joined from public.business_customer_setup where business_id=selected_id for update;
 if p_start_month is null or extract(day from p_start_month)<>1 or p_start_month>joined or p_start_month<'1900-01-01' then raise exception 'invalid starting month'; end if;
 covered:=public.customer_coverage_start(selected_id);
 months:=greatest(0,(extract(year from covered)::integer-extract(year from p_start_month)::integer)*12+extract(month from covered)::integer-extract(month from p_start_month)::integer);
 if months=0 then
   if p_confirm then update public.businesses set catch_up_start_date=p_start_month where id=selected_id; end if;
   return jsonb_build_object('ready',true,'additionalMonths',0,'totalCents',0,'includedFrom',covered);
 end if;
 if coalesce(p_agreed,false) and p_expected_amount is distinct from months*2000 then raise exception 'quote changed; review the charge again'; end if;
 if not coalesce(p_agreed,false) then return jsonb_build_object('ready',false,'additionalMonths',months,'totalCents',months*2000,'includedFrom',covered); end if;
 insert into public.customer_catch_up_orders(business_id,start_month,included_from,additional_months,amount_cents)
 values(selected_id,p_start_month,covered,months,months*2000) on conflict(business_id,start_month) do nothing;
 select * into selected_order from public.customer_catch_up_orders where business_id=selected_id and start_month=p_start_month;
 if selected_order.amount_cents<>months*2000 then raise exception 'coverage changed; catch-up quote needs review'; end if;
 return jsonb_build_object('ready',false,'orderId',selected_order.id,'additionalMonths',selected_order.additional_months,'totalCents',selected_order.amount_cents,'includedFrom',selected_order.included_from);
end; $$;
revoke all on function public.choose_customer_start_month(date,boolean,boolean,integer) from public,anon;
grant execute on function public.choose_customer_start_month(date,boolean,boolean,integer) to authenticated;

create function public.guard_customer_coverage() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.catch_up_start_date is distinct from old.catch_up_start_date and new.catch_up_start_date is not null
   and (public.customer_coverage_start(new.id) is null or new.catch_up_start_date<public.customer_coverage_start(new.id))
   then raise exception 'historical coverage requires confirmed payment'; end if;
 return new;
end; $$;
create trigger customer_coverage_authority before update of catch_up_start_date on public.businesses
for each row execute function public.guard_customer_coverage();

create function public.confirm_customer_catch_up_payment(p_order_id uuid,p_session_id text,p_amount integer)
returns void language plpgsql security definer set search_path='' as $$
declare selected_order public.customer_catch_up_orders%rowtype;
begin
 select * into selected_order from public.customer_catch_up_orders where id=p_order_id for update;
 if not found or selected_order.amount_cents<>p_amount or selected_order.provider_session_id is distinct from p_session_id then raise exception 'payment mismatch'; end if;
 if selected_order.paid_at is not null then return; end if;
 update public.customer_catch_up_orders set paid_at=now() where id=p_order_id;
 update public.businesses set catch_up_start_date=least(catch_up_start_date,selected_order.start_month) where id=selected_order.business_id;
end; $$;
revoke all on function public.confirm_customer_catch_up_payment(uuid,text,integer) from public,anon,authenticated;
grant execute on function public.confirm_customer_catch_up_payment(uuid,text,integer) to service_role;

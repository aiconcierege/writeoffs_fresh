-- Keep abandoned checkout history while allowing a newly consented quote.
-- Only one unpaid checkout can authorize a business at a time.
alter table public.customer_catch_up_orders add column canceled_at timestamptz;
alter table public.customer_catch_up_orders drop constraint customer_catch_up_orders_business_id_start_month_key;
create unique index customer_catch_up_current_start on public.customer_catch_up_orders(business_id,start_month) where canceled_at is null;
create unique index customer_catch_up_one_pending on public.customer_catch_up_orders(business_id) where paid_at is null and canceled_at is null;
create or replace function public.choose_customer_start_month(p_start_month date,p_agreed boolean default false,p_confirm boolean default false,p_expected_amount integer default null)
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
 values(selected_id,p_start_month,covered,months,months*2000) on conflict(business_id,start_month) where canceled_at is null do nothing;
 select * into selected_order from public.customer_catch_up_orders where business_id=selected_id and start_month=p_start_month and canceled_at is null;
 if selected_order.amount_cents<>months*2000 then raise exception 'coverage changed; catch-up quote needs review'; end if;
 return jsonb_build_object('ready',false,'orderId',selected_order.id,'additionalMonths',selected_order.additional_months,'totalCents',selected_order.amount_cents,'includedFrom',selected_order.included_from);
end; $$;

create or replace function public.confirm_customer_catch_up_payment(p_order_id uuid,p_session_id text,p_amount integer)
returns void language plpgsql security definer set search_path='' as $$
declare selected_order public.customer_catch_up_orders%rowtype;
begin
 select * into selected_order from public.customer_catch_up_orders where id=p_order_id for update;
 if not found or selected_order.canceled_at is not null or selected_order.amount_cents<>p_amount or selected_order.provider_session_id is distinct from p_session_id then raise exception 'payment mismatch'; end if;
 if selected_order.paid_at is not null then return; end if;
 update public.customer_catch_up_orders set paid_at=now() where id=p_order_id;
 update public.businesses set catch_up_start_date=least(catch_up_start_date,selected_order.start_month) where id=selected_order.business_id;
end; $$;

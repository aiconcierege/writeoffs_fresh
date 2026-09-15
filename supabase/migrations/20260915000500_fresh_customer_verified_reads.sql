-- These new customer read models require the same verified session as the UI.
create policy customer_setup_verified_session on public.business_customer_setup
as restrictive for select to authenticated using(coalesce((select auth.jwt()->>'aal'),'')='aal2');
create policy catch_up_orders_verified_session on public.customer_catch_up_orders
as restrictive for select to authenticated using(coalesce((select auth.jwt()->>'aal'),'')='aal2');
create policy historical_mileage_verified_session on public.historical_mileage_facts
as restrictive for select to authenticated using(coalesce((select auth.jwt()->>'aal'),'')='aal2');

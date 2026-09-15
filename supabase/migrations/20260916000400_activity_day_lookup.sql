-- Setup/cadence writers already validate timezone names. Avoid scanning the
-- PostgreSQL timezone catalog for every row of a Transactions work page.
create or replace function public.bookkeeping_activity_day(p_business_id uuid,p_as_of timestamptz default now())
returns date language plpgsql stable security definer set search_path='' as $$
declare zone text;
begin
 select coalesce(s.timezone_name,c.timezone_name,'UTC') into zone from public.businesses b
 left join public.business_customer_setup s on s.business_id=b.id
 left join public.current_business_review_cadence c on c.business_id=b.id where b.id=p_business_id;
 begin return (p_as_of at time zone coalesce(zone,'UTC'))::date;
 exception when invalid_parameter_value then return (p_as_of at time zone 'UTC')::date;end;
end; $$;

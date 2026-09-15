-- A customer-reported historical total is not a fabricated individual trip.
create table public.historical_mileage_facts (
 id uuid primary key default gen_random_uuid(),
 business_id uuid not null references public.businesses(id) on delete cascade,
 tax_year integer not null,
 vehicle_id uuid references public.business_vehicles(id) on delete restrict,
 answer text not null check(answer in ('entered','zero','deferred')),
 periods jsonb,
 request_id uuid not null,
 supersedes_id uuid unique references public.historical_mileage_facts(id),
 created_at timestamptz not null default now(),
 unique(business_id,request_id),
 check((answer='entered' and jsonb_typeof(periods)='array') or (answer<>'entered' and periods is null))
);
alter table public.historical_mileage_facts enable row level security;
revoke all on public.historical_mileage_facts from public,anon,authenticated;
grant select on public.historical_mileage_facts to authenticated;
grant select,insert,delete on public.historical_mileage_facts to service_role;
create policy historical_mileage_own on public.historical_mileage_facts for select to authenticated using(
 exists(select 1 from public.businesses b where b.id=business_id and b.owner_user_id=(select auth.uid())));
create view public.current_historical_mileage with(security_invoker=true) as
select f.* from public.historical_mileage_facts f where not exists(select 1 from public.historical_mileage_facts next where next.supersedes_id=f.id);
grant select on public.current_historical_mileage to authenticated,service_role;

create function public.record_historical_mileage(p_answer text,p_periods jsonb,p_vehicle_id uuid,p_request_id uuid,p_expected_id uuid default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare selected_id uuid:=public.require_customer_setup_owner(); joined date; prior uuid; result_id uuid; item jsonb; expected_from date; through_date date;
begin
 select joined_month into joined from public.business_customer_setup where business_id=selected_id for update;
 select id into result_id from public.historical_mileage_facts where business_id=selected_id and request_id=p_request_id;
 if found then
  if not exists(select 1 from public.historical_mileage_facts where id=result_id and answer=p_answer and periods is not distinct from p_periods and vehicle_id is not distinct from p_vehicle_id) then raise exception 'request already used for another answer'; end if;
  return result_id;
 end if;
 if p_answer is null or p_answer not in ('entered','zero','deferred') then raise exception 'invalid mileage answer'; end if;
 if p_vehicle_id is not null and not exists(select 1 from public.business_vehicles where id=p_vehicle_id and business_id=selected_id) then raise exception 'vehicle unavailable'; end if;
 select id into prior from public.current_historical_mileage where business_id=selected_id and tax_year=extract(year from joined);
 if prior is distinct from p_expected_id then raise exception 'historical mileage changed'; end if;
 if p_answer='entered' then
  if p_periods is null or jsonb_typeof(p_periods)<>'array' or jsonb_array_length(p_periods) not between 1 and 12 then raise exception 'historical periods required'; end if;
  expected_from:=date_trunc('year',joined)::date;
  for item in select value from jsonb_array_elements(p_periods) loop
   if (item->>'from')::date is distinct from expected_from or (item->>'through')::date<expected_from
    or (item->>'through')::date>=joined or (item->>'milesMilli') is null
    or (item->>'milesMilli')::numeric<0 or (item->>'milesMilli')::numeric>1000000000
    or trunc((item->>'milesMilli')::numeric)<>(item->>'milesMilli')::numeric then raise exception 'invalid historical mileage period'; end if;
   through_date:=(item->>'through')::date;expected_from:=through_date+1;
  end loop;
  if expected_from<>joined then raise exception 'historical mileage period incomplete'; end if;
 elsif p_periods is not null then raise exception 'deferred and zero answers have no invented miles'; end if;
 insert into public.historical_mileage_facts(business_id,tax_year,vehicle_id,answer,periods,request_id,supersedes_id)
 values(selected_id,extract(year from joined),p_vehicle_id,p_answer,p_periods,p_request_id,prior) returning id into result_id;
 return result_id;
end; $$;
revoke all on function public.record_historical_mileage(text,jsonb,uuid,uuid,uuid) from public,anon;
grant execute on function public.record_historical_mileage(text,jsonb,uuid,uuid,uuid) to authenticated;

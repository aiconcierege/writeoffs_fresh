-- Retained materials history must not block a correction to current business facts.
-- No tax method is inferred and no historical answer is erased.
create or replace function public.record_business_fact_changes(
  p_business_id uuid,
  p_changes jsonb,
  p_expected_event_ids jsonb,
  p_source text,
  p_reason text,
  p_request_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  authenticated_user_id uuid := auth.uid();
  selected_business public.businesses%rowtype;
  fact record;
  current_event public.business_fact_events%rowtype;
  new_event_id uuid;
  result jsonb := '{}'::jsonb;
  next_business_stage text;
  next_business_start_month date;
  next_uses_job_materials text;
  next_keeps_future_sale text;
  next_prior_handling text;
  did_change boolean := false;
begin
  if authenticated_user_id is null then raise exception 'authentication required'; end if;
  if p_source not in ('onboarding', 'settings') then raise exception 'business fact source is invalid'; end if;
  if p_changes is null or jsonb_typeof(p_changes) <> 'object' or p_changes = '{}'::jsonb then
    raise exception 'at least one Business fact change is required';
  end if;
  if p_expected_event_ids is null or jsonb_typeof(p_expected_event_ids) <> 'object' then
    raise exception 'expected Business fact revisions are required';
  end if;
  if length(btrim(coalesce(p_reason, ''))) not between 1 and 500
    or length(btrim(coalesce(p_request_key, ''))) not between 1 and 200 then
    raise exception 'business fact reason or request key is invalid';
  end if;

  select * into selected_business from public.businesses
  where id = p_business_id and owner_user_id = authenticated_user_id for update;
  if not found then raise exception 'Business is unavailable'; end if;

  if exists (
    select 1 from jsonb_object_keys(p_changes) as keys(key)
    where keys.key not in ('business_stage', 'business_start_month',
      'uses_customer_job_materials', 'keeps_future_sale_merchandise', 'prior_materials_handling')
  ) then raise exception 'unsupported Business fact key'; end if;

  next_business_stage := case when p_changes ? 'business_stage'
    then p_changes ->> 'business_stage' else selected_business.business_stage end;
  next_business_start_month := case when p_changes ? 'business_start_month'
    then (p_changes ->> 'business_start_month')::date else selected_business.business_start_month end;
  next_uses_job_materials := case when p_changes ? 'uses_customer_job_materials'
    then p_changes ->> 'uses_customer_job_materials' else selected_business.uses_customer_job_materials end;
  next_keeps_future_sale := case when p_changes ? 'keeps_future_sale_merchandise'
    then p_changes ->> 'keeps_future_sale_merchandise' else selected_business.keeps_future_sale_merchandise end;
  next_prior_handling := case when p_changes ? 'prior_materials_handling'
    then p_changes ->> 'prior_materials_handling' else selected_business.prior_materials_handling end;

  if next_business_stage is not null and next_business_stage not in ('new', 'existing') then
    raise exception 'business stage is invalid';
  end if;
  if next_business_start_month is not null and
    (extract(day from next_business_start_month) <> 1 or next_business_start_month > current_date) then
    raise exception 'business start month is invalid';
  end if;
  if next_uses_job_materials is not null and next_uses_job_materials not in ('yes', 'no', 'not_sure') then
    raise exception 'customer-job materials answer is invalid';
  end if;
  if next_keeps_future_sale is not null and next_keeps_future_sale not in ('yes', 'no', 'not_sure') then
    raise exception 'future-sale merchandise answer is invalid';
  end if;
  if next_prior_handling is not null and next_prior_handling not in
    ('deduct_purchases', 'count_year_end', 'accountant_handles', 'not_sure') then
    raise exception 'prior materials handling answer is invalid';
  end if;

  for fact in select key, value from jsonb_each(p_changes) loop
    select events.* into current_event
    from public.business_fact_events as events
    where events.business_id = p_business_id and events.fact_key = fact.key
      and not exists (select 1 from public.business_fact_events as successors
        where successors.supersedes_event_id = events.id)
    for update;

    if found and current_event.fact_value is not distinct from (fact.value #>> '{}') then
      result := result || jsonb_build_object(fact.key, current_event.id::text);
      continue;
    end if;
    if coalesce(current_event.id::text, '') is distinct from
      coalesce(p_expected_event_ids ->> fact.key, '') then
      raise exception 'Business fact changed before this answer was saved';
    end if;

    insert into public.business_fact_events (
      business_id, fact_key, fact_value, supersedes_event_id, actor_user_id,
      provenance, source, reason, request_key
    ) values (
      p_business_id, fact.key, fact.value #>> '{}', current_event.id,
      authenticated_user_id, 'user', p_source, btrim(p_reason),
      btrim(p_request_key) || ':' || fact.key
    ) returning id into new_event_id;
    did_change := true;

    insert into public.bookkeeping_tax_treatment_invalidations (
      business_id, tax_treatment_id, triggering_business_fact_event_id, reason
    )
    select dependencies.business_id, dependencies.tax_treatment_id, new_event_id,
      'A Business fact used by this tax treatment was corrected.'
    from public.bookkeeping_tax_treatment_business_fact_dependencies as dependencies
    where dependencies.business_id = p_business_id
      and dependencies.fact_key = fact.key
      and dependencies.based_on_business_fact_event_id <> new_event_id
    on conflict (tax_treatment_id) do nothing;

    result := result || jsonb_build_object(fact.key, new_event_id::text);
  end loop;

  update public.businesses set
    business_stage = next_business_stage,
    business_start_month = next_business_start_month,
    uses_customer_job_materials = next_uses_job_materials,
    keeps_future_sale_merchandise = next_keeps_future_sale,
    prior_materials_handling = next_prior_handling,
    onboarding_state = case when did_change then 'in_progress' else onboarding_state end,
    onboarding_version = 3
  where id = p_business_id;

  return result;
exception when unique_violation then
  raise exception 'Business fact changed before this answer was saved';
end;
$$;


-- Reject incomplete or ambiguous period boundaries before preserving a factual total.
create or replace function public.record_historical_mileage(p_answer text,p_periods jsonb,p_vehicle_id uuid,p_request_id uuid,p_expected_id uuid default null)
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
   if (item->>'through') is null or (item->>'from') !~ '^\d{4}-\d{2}-\d{2}$' or (item->>'through') !~ '^\d{4}-\d{2}-\d{2}$'
    or (item->>'from')::date is distinct from expected_from or (item->>'through')::date<expected_from
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

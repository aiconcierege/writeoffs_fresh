-- Phase 1: explicit setup completion replaces the obsolete weekday prerequisite.
-- Historical facts are retained, including legacy materials answers and cadence.
alter table public.businesses drop constraint businesses_prior_materials_applicability_check;
alter table public.businesses drop constraint businesses_onboarding_start_method_check;
alter table public.businesses add constraint businesses_onboarding_start_method_check
  check(onboarding_start_method is null or onboarding_start_method in ('connected_financial_accounts','statement_uploads','receipts'));

create table public.business_customer_setup (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  joined_month date not null check(extract(day from joined_month)=1),
  grandfathered_start_date date,
  completed_at timestamptz,
  timezone_name text,
  created_at timestamptz not null default now()
);
-- No new charge or repeated onboarding for customers who already supplied facts.
insert into public.business_customer_setup(business_id,joined_month,grandfathered_start_date,completed_at,timezone_name)
select b.id,date_trunc('month',coalesce(m.created_at,b.created_at))::date,b.catch_up_start_date,
  case when c.id is not null then now() end,c.timezone_name
from public.businesses b left join public.business_memberships m on m.business_id=b.id
left join public.current_business_review_cadence c on c.business_id=b.id;

alter table public.business_customer_setup enable row level security;
revoke all on public.business_customer_setup from public,anon,authenticated;
grant select on public.business_customer_setup to authenticated;
grant all on public.business_customer_setup to service_role;
create policy customer_setup_select_own on public.business_customer_setup for select to authenticated
using(exists(select 1 from public.businesses b where b.id=business_id and b.owner_user_id=(select auth.uid())));

create function public.require_customer_setup_owner() returns uuid language plpgsql security definer set search_path='' as $$
declare selected_id uuid;
begin
  if auth.uid() is null or coalesce(auth.jwt()->>'aal','')<>'aal2' then raise exception 'verified session required'; end if;
  select b.id into selected_id from public.businesses b where b.owner_user_id=auth.uid();
  if selected_id is null or not public.customer_has_active_membership()
    or exists(select 1 from public.current_customer_membership where business_id=selected_id and deletion_status is not null)
    then raise exception 'active membership required'; end if;
  insert into public.business_customer_setup(business_id,joined_month)
    select selected_id,date_trunc('month',m.created_at)::date from public.business_memberships m where m.business_id=selected_id
    on conflict do nothing;
  return selected_id;
end; $$;
revoke all on function public.require_customer_setup_owner() from public,anon;
grant execute on function public.require_customer_setup_owner() to authenticated;

create function public.complete_customer_setup(p_timezone text) returns void language plpgsql security definer set search_path='' as $$
declare selected_id uuid:=public.require_customer_setup_owner();
begin
  if not exists(select 1 from pg_timezone_names where name=p_timezone) then raise exception 'invalid timezone'; end if;
  if not exists(select 1 from public.businesses where id=selected_id and onboarding_state='completed') then raise exception 'complete onboarding first'; end if;
  if exists(select 1 from public.list_plaid_connection_accounts() a
    where a.connection_status='active' and not exists(select 1 from public.current_financial_account_use u where u.financial_account_id=a.id))
    then raise exception 'choose how you use each account'; end if;
  update public.business_customer_setup set completed_at=coalesce(completed_at,now()),timezone_name=p_timezone where business_id=selected_id;
end; $$;
revoke all on function public.complete_customer_setup(text) from public,anon;
grant execute on function public.complete_customer_setup(text) to authenticated;

create or replace function public.complete_business_onboarding_v3(p_business_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  authenticated_user_id uuid := auth.uid();
  selected_business public.businesses%rowtype;
  completed_at timestamptz;
begin
  if authenticated_user_id is null then raise exception 'authentication required'; end if;
  select * into selected_business from public.businesses
  where id = p_business_id and owner_user_id = authenticated_user_id for update;
  if not found then raise exception 'Business is unavailable'; end if;
  if length(btrim(coalesce(selected_business.business_description, ''))) < 1
    or selected_business.business_profile_context not in ('general', 'realtor')
    or selected_business.schedule_c_eligibility <> 'yes'
    or selected_business.business_stage not in ('new', 'existing')
    or selected_business.business_start_month is null
    or selected_business.business_start_month > current_date
    or selected_business.uses_customer_job_materials not in ('yes', 'no', 'not_sure')
    or selected_business.keeps_future_sale_merchandise <> 'no'
    or selected_business.v1_support_status <> 'eligible'
    or selected_business.catch_up_start_date is null
    or selected_business.catch_up_start_date > current_date
    or selected_business.onboarding_start_method not in ('connected_financial_accounts', 'statement_uploads', 'receipts')
  then raise exception 'onboarding is incomplete'; end if;

  if selected_business.onboarding_state = 'completed' and selected_business.onboarding_version = 3 then
    completed_at := selected_business.onboarding_completed_at;
  else
    completed_at := now();
    update public.businesses set onboarding_state = 'completed', onboarding_version = 3,
      onboarding_completed_at = completed_at where id = p_business_id;
  end if;
  return jsonb_build_object(
    'completedAt', completed_at,
    'destination', case when selected_business.onboarding_start_method = 'receipts'
      then '/receipts' else '/import' end
  );
end;
$$;

-- Rebuild onboarding around factual v1 eligibility and business context.
-- Existing v2 answers and vehicle records remain untouched for compatibility.

alter table public.businesses
  add column business_profile_context text,
  add column schedule_c_eligibility text,
  add column business_stage text,
  add column uses_customer_job_materials text,
  add column keeps_future_sale_merchandise text,
  add column prior_materials_handling text,
  add column catch_up_start_date date,
  add column v1_support_status text generated always as (
    case
      when schedule_c_eligibility = 'no' then 'unsupported'
      when schedule_c_eligibility = 'not_sure' then 'needs_clarification'
      when schedule_c_eligibility = 'yes' and keeps_future_sale_merchandise = 'yes' then 'unsupported'
      when schedule_c_eligibility = 'yes' and keeps_future_sale_merchandise = 'no' then 'eligible'
      else 'needs_clarification'
    end
  ) stored,
  add column v1_support_reason text generated always as (
    case
      when schedule_c_eligibility = 'no' then 'schedule_c_unsupported'
      when schedule_c_eligibility = 'not_sure' then 'schedule_c_uncertain'
      when schedule_c_eligibility = 'yes' and keeps_future_sale_merchandise = 'yes'
        then 'substantial_future_sale_merchandise'
      when schedule_c_eligibility = 'yes' and keeps_future_sale_merchandise = 'not_sure'
        then 'future_sale_merchandise_uncertain'
      else null
    end
  ) stored,
  add constraint businesses_profile_context_check check (
    business_profile_context is null
    or business_profile_context in ('general', 'realtor')
  ),
  add constraint businesses_schedule_c_eligibility_check check (
    schedule_c_eligibility is null
    or schedule_c_eligibility in ('yes', 'no', 'not_sure')
  ),
  add constraint businesses_stage_check check (
    business_stage is null or business_stage in ('new', 'existing')
  ),
  add constraint businesses_job_materials_check check (
    uses_customer_job_materials is null
    or uses_customer_job_materials in ('yes', 'no', 'not_sure')
  ),
  add constraint businesses_future_sale_merchandise_check check (
    keeps_future_sale_merchandise is null
    or keeps_future_sale_merchandise in ('yes', 'no', 'not_sure')
  ),
  add constraint businesses_prior_materials_handling_check check (
    prior_materials_handling is null
    or prior_materials_handling in (
      'deduct_purchases',
      'count_year_end',
      'accountant_handles',
      'not_sure'
    )
  ),
  add constraint businesses_prior_materials_applicability_check check (
    prior_materials_handling is null
    or (business_stage = 'existing' and uses_customer_job_materials = 'yes')
  );

comment on column public.businesses.business_profile_context is
  'Optional context for the one canonical product path; general means no more-specific profile.';
comment on column public.businesses.schedule_c_eligibility is
  'Plain-language user answer about whether the business is reported on Schedule C.';
comment on column public.businesses.business_stage is
  'Whether the user is starting a new business or bringing an existing business into WriteOffs.';
comment on column public.businesses.uses_customer_job_materials is
  'Factual signal for parts or materials installed, used, or provided through customer jobs.';
comment on column public.businesses.keeps_future_sale_merchandise is
  'Factual v1 boundary for substantial products or merchandise kept to sell later; excludes normal leftover job materials.';
comment on column public.businesses.prior_materials_handling is
  'Existing-business factual history only; it never selects or changes a federal tax accounting method.';
comment on column public.businesses.catch_up_start_date is
  'First date the customer asked WriteOffs to include during historical catch-up.';
comment on column public.businesses.v1_support_status is
  'Database-derived v1 product eligibility status, separate from bookkeeping and tax treatment.';
comment on column public.businesses.v1_support_reason is
  'Database-derived plain product-scope reason for clarification or unsupported status.';

-- Onboarding uses the authenticated customer session so RLS remains the
-- authority. Grant only the factual/completion columns used by this flow;
-- ownership and database-derived eligibility are intentionally excluded.
grant update (
  name,
  business_description,
  business_profile_context,
  schedule_c_eligibility,
  business_stage,
  business_start_month,
  uses_customer_job_materials,
  keeps_future_sale_merchandise,
  prior_materials_handling,
  catch_up_start_date,
  onboarding_start_method,
  onboarding_state,
  onboarding_version,
  onboarding_completed_at
) on public.businesses to authenticated;

-- Profile context is the only customer-editable profile attribute used by
-- onboarding/settings. Its existing owner-only RLS policy remains in force.
grant select on public.profiles to authenticated;
grant update (vertical) on public.profiles to authenticated;

-- These are safe derivations from explicit existing answers, not fabricated facts.
update public.businesses as businesses
set business_profile_context = profiles.vertical
from public.profiles as profiles
where profiles.id = businesses.owner_user_id
  and profiles.vertical in ('general', 'realtor')
  and businesses.business_profile_context is null;

update public.businesses
set schedule_c_eligibility = case
  when federal_tax_reporting_type = 'schedule_c' then 'yes'
  when federal_tax_reporting_type = 'not_sure' then 'not_sure'
  when federal_tax_reporting_type in ('s_corporation', 'c_corporation', 'partnership') then 'no'
  else null
end
where schedule_c_eligibility is null
  and federal_tax_reporting_type is not null;

create or replace function public.sync_profile_vertical_to_business()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.businesses
  set industry = new.vertical,
      business_profile_context = new.vertical
  where owner_user_id = new.id
    and (industry is distinct from new.vertical
      or business_profile_context is distinct from new.vertical);

  return new;
end;
$$;

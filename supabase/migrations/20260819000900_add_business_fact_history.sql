-- Append-only history for Business facts that can affect future accounting or
-- tax-treatment decisions. The businesses columns remain an atomically updated
-- read cache; customer sessions can change these facts only through the RPC.

create table public.business_fact_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  fact_key text not null,
  fact_value text,
  supersedes_event_id uuid,
  actor_user_id uuid references auth.users(id) on delete restrict,
  provenance text not null,
  source text not null,
  reason text not null,
  request_key text not null,
  created_at timestamptz not null default now(),
  constraint business_fact_events_business_identity_unique unique (id, business_id),
  constraint business_fact_events_identity_unique unique (id, business_id, fact_key),
  constraint business_fact_events_predecessor_fkey foreign key
    (supersedes_event_id, business_id, fact_key)
    references public.business_fact_events (id, business_id, fact_key) on delete restrict,
  constraint business_fact_events_key_check check (fact_key in (
    'business_stage',
    'business_start_month',
    'uses_customer_job_materials',
    'keeps_future_sale_merchandise',
    'prior_materials_handling'
  )),
  constraint business_fact_events_provenance_check check
    (provenance in ('user', 'migrated_baseline', 'system')),
  constraint business_fact_events_source_check check
    (source in ('onboarding', 'settings', 'migration')),
  constraint business_fact_events_reason_check check (length(btrim(reason)) between 1 and 500),
  constraint business_fact_events_request_key_check check (length(btrim(request_key)) between 1 and 200),
  constraint business_fact_events_actor_check check (
    (provenance = 'user' and actor_user_id is not null and source in ('onboarding', 'settings'))
    or (provenance in ('migrated_baseline', 'system') and actor_user_id is null)
  )
);

create unique index business_fact_events_one_root_idx
  on public.business_fact_events (business_id, fact_key)
  where supersedes_event_id is null;
create unique index business_fact_events_one_successor_idx
  on public.business_fact_events (supersedes_event_id)
  where supersedes_event_id is not null;
create unique index business_fact_events_request_idx
  on public.business_fact_events (business_id, fact_key, request_key);
create index business_fact_events_current_lookup_idx
  on public.business_fact_events (business_id, fact_key, created_at desc);

create trigger business_fact_events_reject_mutation
before update or delete on public.business_fact_events
for each row execute function public.reject_canonical_bookkeeping_mutation();

-- Trusted future tax conclusions may name the exact Business fact event they
-- relied on. A later correction creates a separate immutable invalidation.
alter table public.bookkeeping_tax_treatments
  add constraint bookkeeping_tax_treatments_business_identity_unique unique (id, business_id);

create table public.bookkeeping_tax_treatment_business_fact_dependencies (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  tax_treatment_id uuid not null,
  fact_key text not null,
  based_on_business_fact_event_id uuid not null,
  created_at timestamptz not null default now(),
  constraint tax_treatment_business_fact_dependency_event_fkey foreign key
    (based_on_business_fact_event_id, business_id, fact_key)
    references public.business_fact_events (id, business_id, fact_key) on delete restrict,
  constraint tax_treatment_business_fact_dependency_treatment_fkey foreign key
    (tax_treatment_id, business_id)
    references public.bookkeeping_tax_treatments (id, business_id) on delete restrict,
  constraint tax_treatment_business_fact_dependency_unique unique (tax_treatment_id, fact_key)
);

create table public.bookkeeping_tax_treatment_invalidations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  tax_treatment_id uuid not null unique,
  triggering_business_fact_event_id uuid not null,
  reason text not null check (length(btrim(reason)) between 1 and 500),
  created_at timestamptz not null default now(),
  constraint tax_treatment_invalidation_treatment_fkey foreign key
    (tax_treatment_id, business_id)
    references public.bookkeeping_tax_treatments (id, business_id) on delete restrict,
  constraint tax_treatment_invalidation_event_fkey foreign key
    (triggering_business_fact_event_id, business_id)
    references public.business_fact_events (id, business_id) on delete restrict
);

create trigger tax_treatment_business_fact_dependencies_reject_mutation
before update or delete on public.bookkeeping_tax_treatment_business_fact_dependencies
for each row execute function public.reject_canonical_bookkeeping_mutation();
create trigger tax_treatment_invalidations_reject_mutation
before update or delete on public.bookkeeping_tax_treatment_invalidations
for each row execute function public.reject_canonical_bookkeeping_mutation();

-- Existing persisted facts become honest migration baselines, not fabricated
-- customer events. Unknown/null facts are not backfilled.
insert into public.business_fact_events (
  business_id, fact_key, fact_value, actor_user_id, provenance, source, reason, request_key
)
select businesses.id, facts.fact_key, facts.fact_value, null,
  'migrated_baseline', 'migration',
  'Initial baseline from the persisted onboarding v3 Business state.',
  'onboarding-v3-baseline:' || facts.fact_key
from public.businesses as businesses
cross join lateral (values
  ('business_stage', businesses.business_stage),
  ('business_start_month', businesses.business_start_month::text),
  ('uses_customer_job_materials', businesses.uses_customer_job_materials),
  ('keeps_future_sale_merchandise', businesses.keeps_future_sale_merchandise),
  ('prior_materials_handling', businesses.prior_materials_handling)
) as facts(fact_key, fact_value)
where facts.fact_value is not null;

-- Sensitive cache columns can no longer be updated directly by customers.
revoke update (
  business_stage,
  business_start_month,
  uses_customer_job_materials,
  keeps_future_sale_merchandise,
  prior_materials_handling
) on public.businesses from authenticated;

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
  if next_prior_handling is not null and
    (next_business_stage <> 'existing' or next_uses_job_materials <> 'yes') then
    raise exception 'prior materials handling does not apply';
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
    or (selected_business.business_stage = 'existing'
      and selected_business.uses_customer_job_materials = 'yes'
      and selected_business.prior_materials_handling is null)
    or (not (selected_business.business_stage = 'existing'
      and selected_business.uses_customer_job_materials = 'yes')
      and selected_business.prior_materials_handling is not null)
    or selected_business.catch_up_start_date is null
    or selected_business.catch_up_start_date > current_date
    or selected_business.onboarding_start_method not in ('statement_uploads', 'receipts')
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

alter table public.business_fact_events enable row level security;
alter table public.bookkeeping_tax_treatment_business_fact_dependencies enable row level security;
alter table public.bookkeeping_tax_treatment_invalidations enable row level security;

revoke all on public.business_fact_events from public, anon, authenticated;
revoke all on public.bookkeeping_tax_treatment_business_fact_dependencies from public, anon, authenticated;
revoke all on public.bookkeeping_tax_treatment_invalidations from public, anon, authenticated;
grant select on public.business_fact_events to authenticated;
grant select on public.bookkeeping_tax_treatment_business_fact_dependencies to authenticated;
grant select on public.bookkeeping_tax_treatment_invalidations to authenticated;
grant select, insert on public.bookkeeping_tax_treatment_business_fact_dependencies to service_role;
grant select, insert on public.bookkeeping_tax_treatment_invalidations to service_role;

create policy "business_fact_events_select_own_business"
on public.business_fact_events for select to authenticated using (exists (
  select 1 from public.businesses where businesses.id = business_fact_events.business_id
    and businesses.owner_user_id = (select auth.uid())
));
create policy "tax_treatment_business_fact_dependencies_select_own_business"
on public.bookkeeping_tax_treatment_business_fact_dependencies for select to authenticated using (exists (
  select 1 from public.businesses
  where businesses.id = bookkeeping_tax_treatment_business_fact_dependencies.business_id
    and businesses.owner_user_id = (select auth.uid())
));
create policy "tax_treatment_invalidations_select_own_business"
on public.bookkeeping_tax_treatment_invalidations for select to authenticated using (exists (
  select 1 from public.businesses
  where businesses.id = bookkeeping_tax_treatment_invalidations.business_id
    and businesses.owner_user_id = (select auth.uid())
));

revoke execute on function public.record_business_fact_changes(uuid, jsonb, jsonb, text, text, text)
  from public, anon;
grant execute on function public.record_business_fact_changes(uuid, jsonb, jsonb, text, text, text)
  to authenticated;
revoke execute on function public.complete_business_onboarding_v3(uuid) from public, anon;
grant execute on function public.complete_business_onboarding_v3(uuid) to authenticated;

comment on table public.business_fact_events is
  'Append-only history for accounting-sensitive Business facts; businesses columns are an atomic current-state cache.';
comment on table public.bookkeeping_tax_treatment_business_fact_dependencies is
  'Trusted links from a tax treatment to exact Business fact revisions used as its factual basis.';
comment on table public.bookkeeping_tax_treatment_invalidations is
  'Append-only fail-closed invalidations created when a depended-on Business fact is corrected.';

-- Operational/audit records for write-disabled AI bookkeeping shadow evaluation.
-- These rows are not canonical bookkeeping evidence and can never affect reports.

create table public.bookkeeping_ai_shadow_evaluations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  bookkeeping_record_id uuid not null,
  evidence_fingerprint text not null,
  evidence_version text not null,
  evaluator_version text not null,
  prompt_version text not null,
  output_schema_version text not null,
  provider text not null,
  model text not null,
  model_outcome text,
  structured_proposal jsonb,
  referenced_evidence_ids text[] not null default '{}',
  validation_status text not null,
  validation_codes text[] not null default '{}',
  question_eligible boolean,
  write_enabled boolean not null default false,
  correlation_id uuid not null,
  provider_request_id text,
  duration_ms integer,
  input_tokens integer,
  output_tokens integer,
  total_tokens integer,
  provider_error_code text,
  created_at timestamptz not null default now(),
  constraint bookkeeping_ai_shadow_record_fkey
    foreign key (bookkeeping_record_id, business_id)
    references public.bookkeeping_records(id, business_id) on delete restrict,
  constraint bookkeeping_ai_shadow_fingerprint_check check (
    evidence_fingerprint ~ '^[a-f0-9]{64}$'
  ),
  constraint bookkeeping_ai_shadow_identity_check check (
    length(evidence_version) between 1 and 50
    and length(evaluator_version) between 1 and 50
    and length(prompt_version) between 1 and 50
    and length(output_schema_version) between 1 and 50
    and length(provider) between 1 and 50
    and length(model) between 1 and 200
  ),
  constraint bookkeeping_ai_shadow_outcome_check check (
    model_outcome is null or model_outcome in ('propose_decision', 'request_fact', 'abstain')
  ),
  constraint bookkeeping_ai_shadow_validation_check check (
    validation_status in ('accepted', 'rejected', 'provider_error')
  ),
  constraint bookkeeping_ai_shadow_write_disabled_check check (write_enabled = false),
  constraint bookkeeping_ai_shadow_metrics_check check (
    (duration_ms is null or duration_ms >= 0)
    and (input_tokens is null or input_tokens >= 0)
    and (output_tokens is null or output_tokens >= 0)
    and (total_tokens is null or total_tokens >= 0)
  ),
  constraint bookkeeping_ai_shadow_provider_request_check check (
    provider_request_id is null or length(provider_request_id) between 1 and 200
  ),
  constraint bookkeeping_ai_shadow_error_check check (
    provider_error_code is null
    or (
      length(provider_error_code) between 1 and 100
      and provider_error_code ~ '^[A-Z0-9_]+$'
    )
  ),
  constraint bookkeeping_ai_shadow_result_check check (
    (validation_status = 'provider_error'
      and provider_error_code is not null
      and model_outcome is null
      and structured_proposal is null)
    or
    (validation_status <> 'provider_error'
      and provider_error_code is null
      and model_outcome is not null
      and structured_proposal is not null)
  )
);

comment on table public.bookkeeping_ai_shadow_evaluations is
  'Write-disabled AI bookkeeping proposals and deterministic validation results; never accounting truth.';

create index bookkeeping_ai_shadow_record_idx
  on public.bookkeeping_ai_shadow_evaluations
    (business_id, bookkeeping_record_id, created_at desc);

create unique index bookkeeping_ai_shadow_completed_identity_idx
  on public.bookkeeping_ai_shadow_evaluations (
    business_id, bookkeeping_record_id, evidence_fingerprint,
    evaluator_version, prompt_version, output_schema_version, provider, model
  )
  where validation_status <> 'provider_error';

alter table public.bookkeeping_ai_shadow_evaluations enable row level security;
revoke all on public.bookkeeping_ai_shadow_evaluations from public, anon, authenticated;
grant select, insert on public.bookkeeping_ai_shadow_evaluations to service_role;

create or replace function public.prevent_bookkeeping_ai_shadow_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'AI shadow audit history is append-only';
end;
$$;

create trigger bookkeeping_ai_shadow_no_update
before update or delete on public.bookkeeping_ai_shadow_evaluations
for each row execute function public.prevent_bookkeeping_ai_shadow_mutation();

revoke execute on function public.prevent_bookkeeping_ai_shadow_mutation()
  from public, anon, authenticated;

create or replace function public.enqueue_unresolved_bookkeeping_ai_shadow_jobs(
  p_limit integer,
  p_configuration_fingerprint text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected record;
  queued integer := 0;
  target text;
begin
  if (select auth.role()) <> 'service_role' then
    raise exception 'trusted bookkeeping worker required';
  end if;
  if p_limit not between 1 and 500
    or p_configuration_fingerprint !~ '^[a-f0-9]{64}$'
  then
    raise exception 'valid AI shadow reconciliation identity is required';
  end if;

  for selected in
    select records.id, records.business_id
    from public.bookkeeping_records as records
    join public.bookkeeping_decisions as decisions
      on decisions.bookkeeping_record_id = records.id
     and decisions.business_id = records.business_id
    where decisions.treatment = 'unresolved'
      and decisions.provenance <> 'user'
      and not exists (
        select 1 from public.bookkeeping_decisions as successors
        where successors.supersedes_decision_id = decisions.id
      )
      and not exists (
        select 1 from public.bookkeeping_processing_jobs as jobs
        where jobs.business_id = records.business_id
          and jobs.bookkeeping_record_id = records.id
          and jobs.processing_reason = 'ai_shadow_evaluation'
          and jobs.target_fingerprint = 'bookkeeping-ai-shadow:v1:'
            || p_configuration_fingerprint || ':record:' || records.id::text
      )
    order by records.created_at, records.id
    limit p_limit
  loop
    target := 'bookkeeping-ai-shadow:v1:' || p_configuration_fingerprint
      || ':record:' || selected.id::text;
    perform public.request_bookkeeping_processing(
      selected.business_id,
      selected.id,
      'ai_shadow_evaluation',
      target
    );
    queued := queued + 1;
  end loop;
  return queued;
end;
$$;

comment on function public.enqueue_unresolved_bookkeeping_ai_shadow_jobs(integer, text) is
  'Explicitly queues current unresolved non-customer records for one versioned AI shadow configuration.';

revoke execute on function public.enqueue_unresolved_bookkeeping_ai_shadow_jobs(integer, text)
  from public, anon, authenticated;
grant execute on function public.enqueue_unresolved_bookkeeping_ai_shadow_jobs(integer, text)
  to service_role;

-- Provider-neutral durable bookkeeping processing queue. This is operational
-- infrastructure only; canonical source facts and append-only decisions remain
-- the accounting source of truth.

create table public.bookkeeping_processing_jobs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  bookkeeping_record_id uuid not null,
  processing_reason text not null,
  target_fingerprint text not null,
  state text not null default 'pending',
  attempt_count integer not null default 0,
  available_at timestamptz not null default now(),
  lease_id uuid,
  lease_expires_at timestamptz,
  claimed_at timestamptz,
  last_attempted_at timestamptz,
  completed_at timestamptz,
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bookkeeping_processing_jobs_record_fkey
    foreign key (bookkeeping_record_id, business_id)
    references public.bookkeeping_records(id, business_id) on delete restrict,
  constraint bookkeeping_processing_jobs_material_unique
    unique (business_id, bookkeeping_record_id, processing_reason, target_fingerprint),
  constraint bookkeeping_processing_jobs_state_check check (
    state in ('pending', 'processing', 'retryable', 'completed', 'dead_letter')
  ),
  constraint bookkeeping_processing_jobs_attempt_check check (attempt_count >= 0),
  constraint bookkeeping_processing_jobs_identity_check check (
    length(btrim(processing_reason)) between 1 and 100
    and length(btrim(target_fingerprint)) between 1 and 200
  ),
  constraint bookkeeping_processing_jobs_error_check check (
    last_error_code is null
    or (
      length(last_error_code) between 1 and 100
      and last_error_code ~ '^[A-Z0-9_]+$'
    )
  ),
  constraint bookkeeping_processing_jobs_lease_check check (
    (state = 'processing' and lease_id is not null and lease_expires_at is not null
      and claimed_at is not null)
    or (state <> 'processing' and lease_id is null and lease_expires_at is null)
  ),
  constraint bookkeeping_processing_jobs_completion_check check (
    (state = 'completed' and completed_at is not null)
    or (state <> 'completed' and completed_at is null)
  )
);

comment on table public.bookkeeping_processing_jobs is
  'Durable provider-neutral operational work requests. Rows are not bookkeeping or reporting truth.';

create index bookkeeping_processing_jobs_claim_idx
  on public.bookkeeping_processing_jobs (available_at, created_at, id)
  where state in ('pending', 'retryable', 'processing');
create index bookkeeping_processing_jobs_record_idx
  on public.bookkeeping_processing_jobs (business_id, bookkeeping_record_id, created_at desc);

alter table public.bookkeeping_processing_jobs enable row level security;
revoke all on public.bookkeeping_processing_jobs from public, anon, authenticated;
grant select, insert, update on public.bookkeeping_processing_jobs to service_role;

create or replace function public.request_bookkeeping_processing(
  p_business_id uuid,
  p_bookkeeping_record_id uuid,
  p_processing_reason text,
  p_target_fingerprint text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_job_id uuid;
begin
  if p_business_id is null or p_bookkeeping_record_id is null
    or length(btrim(coalesce(p_processing_reason, ''))) not between 1 and 100
    or length(btrim(coalesce(p_target_fingerprint, ''))) not between 1 and 200
  then
    raise exception 'valid bookkeeping processing identity is required';
  end if;

  if not exists (
    select 1 from public.bookkeeping_records
    where id = p_bookkeeping_record_id and business_id = p_business_id
  ) then
    raise exception 'bookkeeping record does not belong to Business';
  end if;

  insert into public.bookkeeping_processing_jobs (
    business_id, bookkeeping_record_id, processing_reason, target_fingerprint
  ) values (
    p_business_id, p_bookkeeping_record_id,
    btrim(p_processing_reason), btrim(p_target_fingerprint)
  )
  on conflict (business_id, bookkeeping_record_id, processing_reason, target_fingerprint)
  do nothing
  returning id into selected_job_id;

  if selected_job_id is null then
    select id into selected_job_id
    from public.bookkeeping_processing_jobs
    where business_id = p_business_id
      and bookkeeping_record_id = p_bookkeeping_record_id
      and processing_reason = btrim(p_processing_reason)
      and target_fingerprint = btrim(p_target_fingerprint);
  end if;

  return selected_job_id;
end;
$$;

comment on function public.request_bookkeeping_processing(uuid, uuid, text, text) is
  'Idempotently requests trusted provider-neutral processing for one material canonical record state.';

revoke execute on function public.request_bookkeeping_processing(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.request_bookkeeping_processing(uuid, uuid, text, text)
  to service_role;

create or replace function public.enqueue_new_bookkeeping_record_processing()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.request_bookkeeping_processing(
    new.business_id,
    new.id,
    'canonical_record_ready',
    md5('canonical-record:v1:' || new.id::text)
  );
  return new;
end;
$$;

create trigger bookkeeping_records_request_processing
after insert on public.bookkeeping_records
for each row execute function public.enqueue_new_bookkeeping_record_processing();

create or replace function public.claim_bookkeeping_processing_jobs(
  p_lease_id uuid,
  p_limit integer default 10,
  p_lease_seconds integer default 60
)
returns setof public.bookkeeping_processing_jobs
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.role()) <> 'service_role' then
    raise exception 'trusted bookkeeping worker required';
  end if;
  if p_lease_id is null or p_limit not between 1 and 25
    or p_lease_seconds not between 15 and 900
  then
    raise exception 'invalid bookkeeping worker claim';
  end if;

  update public.bookkeeping_processing_jobs
  set state = 'dead_letter', lease_id = null, lease_expires_at = null,
      last_error_code = coalesce(last_error_code, 'RETRY_LIMIT_EXCEEDED'),
      updated_at = now()
  where state = 'processing'
    and lease_expires_at <= now()
    and attempt_count >= 8;

  return query
  with candidates as (
    select jobs.id
    from public.bookkeeping_processing_jobs as jobs
    where (
      (jobs.state in ('pending', 'retryable') and jobs.available_at <= now())
      or (jobs.state = 'processing' and jobs.lease_expires_at <= now())
    )
      and jobs.attempt_count < 8
    order by jobs.available_at, jobs.created_at, jobs.id
    for update skip locked
    limit p_limit
  )
  update public.bookkeeping_processing_jobs as jobs
  set state = 'processing',
      attempt_count = jobs.attempt_count + 1,
      lease_id = p_lease_id,
      lease_expires_at = now() + make_interval(secs => p_lease_seconds),
      claimed_at = now(),
      last_attempted_at = now(),
      last_error_code = null,
      updated_at = now()
  from candidates
  where jobs.id = candidates.id
  returning jobs.*;
end;
$$;

create or replace function public.complete_bookkeeping_processing_job(
  p_job_id uuid,
  p_lease_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed integer;
begin
  if (select auth.role()) <> 'service_role' then
    raise exception 'trusted bookkeeping worker required';
  end if;
  update public.bookkeeping_processing_jobs
  set state = 'completed', completed_at = now(),
      lease_id = null, lease_expires_at = null, last_error_code = null,
      updated_at = now()
  where id = p_job_id and state = 'processing' and lease_id = p_lease_id
    and lease_expires_at > now();
  get diagnostics changed = row_count;
  return changed = 1;
end;
$$;

create or replace function public.retry_bookkeeping_processing_job(
  p_job_id uuid,
  p_lease_id uuid,
  p_error_code text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  next_state text;
begin
  if (select auth.role()) <> 'service_role' then
    raise exception 'trusted bookkeeping worker required';
  end if;
  if p_error_code is null or length(p_error_code) not between 1 and 100
    or p_error_code !~ '^[A-Z0-9_]+$'
  then
    raise exception 'safe bookkeeping worker error code is required';
  end if;

  update public.bookkeeping_processing_jobs
  set state = case when attempt_count >= 8 then 'dead_letter' else 'retryable' end,
      available_at = case
        when attempt_count >= 8 then available_at
        else now() + make_interval(secs => least(3600, 5 * (2 ^ greatest(attempt_count - 1, 0))::integer))
      end,
      lease_id = null,
      lease_expires_at = null,
      last_error_code = p_error_code,
      updated_at = now()
  where id = p_job_id and state = 'processing' and lease_id = p_lease_id
    and lease_expires_at > now()
  returning state into next_state;

  if next_state is null then
    raise exception 'bookkeeping processing lease is no longer owned';
  end if;
  return next_state;
end;
$$;

create or replace function public.enqueue_unresolved_bookkeeping_processing_jobs(
  p_limit integer default 100
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected record;
  queued integer := 0;
begin
  if (select auth.role()) <> 'service_role' then
    raise exception 'trusted bookkeeping worker required';
  end if;
  if p_limit not between 1 and 500 then
    raise exception 'invalid reconciliation limit';
  end if;

  for selected in
    select records.id, records.business_id
    from public.bookkeeping_records as records
    join public.bookkeeping_decisions as decisions
      on decisions.bookkeeping_record_id = records.id
     and decisions.business_id = records.business_id
    where decisions.treatment = 'unresolved'
      and not exists (
        select 1 from public.bookkeeping_decisions as successors
        where successors.supersedes_decision_id = decisions.id
      )
      and not exists (
        select 1 from public.bookkeeping_processing_jobs as jobs
        where jobs.bookkeeping_record_id = records.id
          and jobs.business_id = records.business_id
      )
    order by records.created_at, records.id
    limit p_limit
  loop
    perform public.request_bookkeeping_processing(
      selected.business_id,
      selected.id,
      'canonical_record_ready',
      md5('canonical-record:v1:' || selected.id::text)
    );
    queued := queued + 1;
  end loop;
  return queued;
end;
$$;

revoke execute on function public.claim_bookkeeping_processing_jobs(uuid, integer, integer)
  from public, anon, authenticated;
revoke execute on function public.complete_bookkeeping_processing_job(uuid, uuid)
  from public, anon, authenticated;
revoke execute on function public.retry_bookkeeping_processing_job(uuid, uuid, text)
  from public, anon, authenticated;
revoke execute on function public.enqueue_unresolved_bookkeeping_processing_jobs(integer)
  from public, anon, authenticated;
grant execute on function public.claim_bookkeeping_processing_jobs(uuid, integer, integer)
  to service_role;
grant execute on function public.complete_bookkeeping_processing_job(uuid, uuid)
  to service_role;
grant execute on function public.retry_bookkeeping_processing_job(uuid, uuid, text)
  to service_role;
grant execute on function public.enqueue_unresolved_bookkeeping_processing_jobs(integer)
  to service_role;

-- Durable, write-disabled receipt-understanding shadow processing. Operational
-- jobs and audits are not canonical receipt extraction or bookkeeping truth.

create table public.receipt_processing_jobs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  receipt_id uuid not null,
  job_type text not null default 'receipt_understanding_shadow',
  processing_reason text not null,
  document_sha256 text not null,
  processor_version text not null,
  provider text not null,
  model text not null,
  prompt_version text not null,
  output_schema_version text not null,
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
  constraint receipt_processing_jobs_receipt_fkey foreign key (receipt_id,business_id)
    references public.receipts(id,business_id) on delete restrict,
  constraint receipt_processing_jobs_identity_unique unique (
    business_id,receipt_id,job_type,document_sha256,processor_version,
    provider,model,prompt_version,output_schema_version
  ),
  constraint receipt_processing_jobs_scope_unique unique (id,business_id,receipt_id),
  constraint receipt_processing_jobs_state_check check (
    state in ('pending','processing','retryable','completed','dead_letter')
  ),
  constraint receipt_processing_jobs_hash_check check (document_sha256 ~ '^[a-f0-9]{64}$'),
  constraint receipt_processing_jobs_attempt_check check (attempt_count >= 0),
  constraint receipt_processing_jobs_text_check check (
    length(btrim(job_type)) between 1 and 100
    and length(btrim(processing_reason)) between 1 and 100
    and length(btrim(processor_version)) between 1 and 100
    and length(btrim(provider)) between 1 and 100
    and length(btrim(model)) between 1 and 200
    and length(btrim(prompt_version)) between 1 and 100
    and length(btrim(output_schema_version)) between 1 and 100
  ),
  constraint receipt_processing_jobs_error_check check (last_error_code is null or (
    length(last_error_code) between 1 and 100 and last_error_code ~ '^[A-Z0-9_]+$')),
  constraint receipt_processing_jobs_lease_check check (
    (state='processing' and lease_id is not null and lease_expires_at is not null and claimed_at is not null)
    or (state<>'processing' and lease_id is null and lease_expires_at is null)
  ),
  constraint receipt_processing_jobs_completion_check check (
    (state='completed' and completed_at is not null) or (state<>'completed' and completed_at is null)
  )
);

create index receipt_processing_jobs_claim_idx on public.receipt_processing_jobs
  (available_at,created_at,id) where state in ('pending','retryable','processing');
create index receipt_processing_jobs_receipt_idx on public.receipt_processing_jobs
  (business_id,receipt_id,created_at desc);

alter table public.receipt_processing_jobs enable row level security;
revoke all on public.receipt_processing_jobs from public,anon,authenticated;
grant select,insert,update on public.receipt_processing_jobs to service_role;

create table public.receipt_understanding_evaluations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  receipt_id uuid not null,
  job_id uuid not null,
  document_sha256 text not null,
  provider text not null,
  model text not null,
  processor_version text not null,
  prompt_version text not null,
  output_schema_version text not null,
  structured_proposal jsonb,
  validation_status text not null,
  validation_codes text[] not null default '{}',
  semantic_outcome text,
  provider_request_id text,
  input_tokens integer,
  output_tokens integer,
  total_tokens integer,
  page_count integer not null,
  processed_page_count integer not null,
  duration_ms integer not null,
  provider_error_code text,
  write_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  constraint receipt_understanding_receipt_fkey foreign key (receipt_id,business_id)
    references public.receipts(id,business_id) on delete restrict,
  constraint receipt_understanding_job_fkey foreign key (job_id,business_id,receipt_id)
    references public.receipt_processing_jobs(id,business_id,receipt_id) on delete restrict,
  constraint receipt_understanding_hash_check check (document_sha256 ~ '^[a-f0-9]{64}$'),
  constraint receipt_understanding_validation_check check (
    validation_status in ('accepted','rejected','provider_error')),
  constraint receipt_understanding_outcome_check check (
    semantic_outcome is null or semantic_outcome in ('understood','partial','needs_customer_help','not_recognized')),
  constraint receipt_understanding_write_disabled_check check (write_enabled=false),
  constraint receipt_understanding_metrics_check check (
    page_count between 1 and 100000 and processed_page_count between 1 and 10
    and processed_page_count <= page_count and duration_ms >= 0
    and (input_tokens is null or input_tokens >= 0)
    and (output_tokens is null or output_tokens >= 0)
    and (total_tokens is null or total_tokens >= 0)),
  constraint receipt_understanding_error_check check (
    (validation_status='provider_error' and provider_error_code ~ '^[A-Z0-9_]{1,100}$'
      and structured_proposal is null and semantic_outcome is null)
    or (validation_status<>'provider_error' and provider_error_code is null
      and structured_proposal is not null and semantic_outcome is not null)),
  constraint receipt_understanding_request_check check (
    provider_request_id is null or length(provider_request_id) between 1 and 200),
  constraint receipt_understanding_job_scope_unique unique (id,business_id,receipt_id)
);

create unique index receipt_understanding_completed_identity_idx
  on public.receipt_understanding_evaluations (
    business_id,receipt_id,document_sha256,provider,model,processor_version,prompt_version,output_schema_version
  ) where validation_status in ('accepted','rejected');
create index receipt_understanding_receipt_idx on public.receipt_understanding_evaluations
  (business_id,receipt_id,created_at desc);

alter table public.receipt_understanding_evaluations enable row level security;
revoke all on public.receipt_understanding_evaluations from public,anon,authenticated;
grant select,insert on public.receipt_understanding_evaluations to service_role;

create or replace function public.prevent_receipt_understanding_audit_mutation()
returns trigger language plpgsql set search_path='' as $$
begin raise exception 'receipt understanding audit is append-only'; end;
$$;
create trigger receipt_understanding_evaluations_append_only
before update or delete on public.receipt_understanding_evaluations
for each row execute function public.prevent_receipt_understanding_audit_mutation();

create or replace function public.request_receipt_understanding_processing(
  p_business_id uuid,p_receipt_id uuid,p_reason text,p_document_sha256 text,
  p_processor_version text,p_provider text,p_model text,p_prompt_version text,p_output_schema_version text
) returns uuid language plpgsql security definer set search_path='' as $$
declare selected_job_id uuid;
begin
  if not exists (select 1 from public.receipts where id=p_receipt_id and business_id=p_business_id
      and upload_fingerprint=p_document_sha256)
  then raise exception 'receipt processing identity is stale or cross-Business'; end if;
  insert into public.receipt_processing_jobs(business_id,receipt_id,processing_reason,document_sha256,
    processor_version,provider,model,prompt_version,output_schema_version)
  values(p_business_id,p_receipt_id,btrim(p_reason),p_document_sha256,btrim(p_processor_version),
    btrim(p_provider),btrim(p_model),btrim(p_prompt_version),btrim(p_output_schema_version))
  on conflict (business_id,receipt_id,job_type,document_sha256,processor_version,
    provider,model,prompt_version,output_schema_version) do nothing returning id into selected_job_id;
  if selected_job_id is null then select id into selected_job_id from public.receipt_processing_jobs
    where business_id=p_business_id and receipt_id=p_receipt_id
      and document_sha256=p_document_sha256 and processor_version=btrim(p_processor_version)
      and provider=btrim(p_provider) and model=btrim(p_model)
      and prompt_version=btrim(p_prompt_version) and output_schema_version=btrim(p_output_schema_version);
  end if;
  return selected_job_id;
end; $$;

revoke execute on function public.request_receipt_understanding_processing(uuid,uuid,text,text,text,text,text,text,text)
  from public,anon,authenticated;
grant execute on function public.request_receipt_understanding_processing(uuid,uuid,text,text,text,text,text,text,text)
  to service_role;

create or replace function public.enqueue_uploaded_receipt_understanding()
returns trigger language plpgsql security definer set search_path='' as $$
declare fingerprint text;
begin
  if new.event_type='uploaded' then
    select upload_fingerprint into fingerprint from public.receipts
      where id=new.receipt_id and business_id=new.business_id;
    if fingerprint is not null then perform public.request_receipt_understanding_processing(
      new.business_id,new.receipt_id,'receipt_registered',fingerprint,
      'receipt-understanding:r1.1','openai','environment-configured',
      'receipt-understanding-prompt:v1','receipt-understanding-schema:v1'); end if;
  end if;
  return new;
end; $$;
create trigger bookkeeping_receipt_events_enqueue_understanding
after insert on public.bookkeeping_receipt_events
for each row execute function public.enqueue_uploaded_receipt_understanding();

create or replace function public.claim_receipt_processing_jobs(
  p_lease_id uuid,p_limit integer default 5,p_lease_seconds integer default 120
) returns setof public.receipt_processing_jobs language plpgsql security definer set search_path='' as $$
begin
  if (select auth.role())<>'service_role' then raise exception 'trusted receipt worker required'; end if;
  if p_lease_id is null or p_limit not between 1 and 10 or p_lease_seconds not between 30 and 900
  then raise exception 'invalid receipt worker claim'; end if;
  update public.receipt_processing_jobs set state='dead_letter',lease_id=null,lease_expires_at=null,
    last_error_code=coalesce(last_error_code,'RETRY_LIMIT_EXCEEDED'),updated_at=now()
    where state='processing' and lease_expires_at<=now() and attempt_count>=6;
  return query with candidates as (
    select jobs.id from public.receipt_processing_jobs jobs where
      ((jobs.state in ('pending','retryable') and jobs.available_at<=now())
        or (jobs.state='processing' and jobs.lease_expires_at<=now()))
      and jobs.attempt_count<6 order by jobs.available_at,jobs.created_at,jobs.id
      for update skip locked limit p_limit
  ) update public.receipt_processing_jobs jobs set state='processing',attempt_count=jobs.attempt_count+1,
    lease_id=p_lease_id,lease_expires_at=now()+make_interval(secs=>p_lease_seconds),
    claimed_at=now(),last_attempted_at=now(),last_error_code=null,updated_at=now()
    from candidates where jobs.id=candidates.id returning jobs.*;
end; $$;

create or replace function public.complete_receipt_processing_job(p_job_id uuid,p_lease_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare changed integer; begin
  if (select auth.role())<>'service_role' then raise exception 'trusted receipt worker required'; end if;
  update public.receipt_processing_jobs set state='completed',completed_at=now(),lease_id=null,
    lease_expires_at=null,last_error_code=null,updated_at=now()
    where id=p_job_id and state='processing' and lease_id=p_lease_id and lease_expires_at>now();
  get diagnostics changed=row_count; return changed=1;
end; $$;

create or replace function public.retry_receipt_processing_job(p_job_id uuid,p_lease_id uuid,p_error_code text)
returns text language plpgsql security definer set search_path='' as $$
declare next_state text; begin
  if (select auth.role())<>'service_role' then raise exception 'trusted receipt worker required'; end if;
  if p_error_code !~ '^[A-Z0-9_]{1,100}$' then raise exception 'safe receipt error code required'; end if;
  update public.receipt_processing_jobs set
    state=case when attempt_count>=6 then 'dead_letter' else 'retryable' end,
    available_at=case when attempt_count>=6 then available_at else
      now()+make_interval(secs=>least(3600,10*(2^greatest(attempt_count-1,0))::integer)) end,
    lease_id=null,lease_expires_at=null,last_error_code=p_error_code,updated_at=now()
    where id=p_job_id and state='processing' and lease_id=p_lease_id and lease_expires_at>now()
    returning state into next_state;
  if next_state is null then raise exception 'receipt processing lease is no longer owned'; end if;
  return next_state;
end; $$;

revoke execute on function public.claim_receipt_processing_jobs(uuid,integer,integer) from public,anon,authenticated;
revoke execute on function public.complete_receipt_processing_job(uuid,uuid) from public,anon,authenticated;
revoke execute on function public.retry_receipt_processing_job(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.claim_receipt_processing_jobs(uuid,integer,integer) to service_role;
grant execute on function public.complete_receipt_processing_job(uuid,uuid) to service_role;
grant execute on function public.retry_receipt_processing_job(uuid,uuid,text) to service_role;

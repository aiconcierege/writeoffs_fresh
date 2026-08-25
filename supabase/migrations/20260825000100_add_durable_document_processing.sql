-- Durable canonical document processing and bounded statement intake. This
-- extends the existing receipt queue; it does not create accounting truth.

create table public.business_documents (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  owner_user_id uuid not null references auth.users(id) on delete restrict,
  document_class text not null,
  upload_fingerprint text not null,
  storage_path text not null,
  original_name text,
  mime_type text not null,
  bytes integer not null,
  created_at timestamptz not null default now(),
  constraint business_documents_class_check check (document_class in ('bank_statement','card_statement')),
  constraint business_documents_hash_check check (upload_fingerprint ~ '^[a-f0-9]{64}$'),
  constraint business_documents_mime_check check (mime_type = 'application/pdf'),
  constraint business_documents_size_check check (bytes between 1 and 104857600),
  constraint business_documents_business_owner_unique unique (id,business_id),
  constraint business_documents_fingerprint_unique unique (business_id,upload_fingerprint)
);

alter table public.business_documents enable row level security;
create policy business_documents_select_own on public.business_documents for select to authenticated
  using (owner_user_id=(select auth.uid()) and exists (
    select 1 from public.businesses where id=business_id and owner_user_id=(select auth.uid())));
revoke all on public.business_documents from public,anon,authenticated;
grant select on public.business_documents to authenticated;
grant all on public.business_documents to service_role;

alter table public.receipt_processing_jobs alter column receipt_id drop not null;
alter table public.receipt_processing_jobs add column document_id uuid;
alter table public.receipt_processing_jobs add column terminal_reason text;
alter table public.receipt_processing_jobs add column recovery_count integer not null default 0;
alter table public.receipt_processing_jobs add constraint receipt_processing_jobs_document_fkey
  foreign key (document_id,business_id) references public.business_documents(id,business_id) on delete restrict;
alter table public.receipt_processing_jobs add constraint receipt_processing_jobs_document_scope_unique
  unique (id,business_id,document_id);
alter table public.receipt_processing_jobs drop constraint receipt_processing_jobs_state_check;
alter table public.receipt_processing_jobs add constraint receipt_processing_jobs_state_check check (
  state in ('pending','processing','retryable','completed','needs_attention','unreadable','dead_letter'));
alter table public.receipt_processing_jobs drop constraint receipt_processing_jobs_completion_check;
alter table public.receipt_processing_jobs add constraint receipt_processing_jobs_completion_check check (
  (state in ('completed','needs_attention','unreadable') and completed_at is not null)
  or (state not in ('completed','needs_attention','unreadable') and completed_at is null));
alter table public.receipt_processing_jobs add constraint receipt_processing_jobs_target_check check (
  (receipt_id is not null and document_id is null) or (receipt_id is null and document_id is not null));
alter table public.receipt_processing_jobs add constraint receipt_processing_jobs_terminal_reason_check check (
  terminal_reason is null or terminal_reason ~ '^[A-Z0-9_]{1,100}$');
alter table public.receipt_processing_jobs add constraint receipt_processing_jobs_recovery_count_check check (recovery_count>=0);
create unique index receipt_processing_jobs_document_identity_idx on public.receipt_processing_jobs(
  business_id,document_id,job_type,document_sha256,processor_version,provider,model,prompt_version,output_schema_version
) where document_id is not null;
create index receipt_processing_jobs_document_idx on public.receipt_processing_jobs
  (business_id,document_id,created_at desc) where document_id is not null;

create table public.document_processing_results (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  document_id uuid not null,
  job_id uuid not null,
  document_sha256 text not null,
  processor_version text not null,
  document_class text not null,
  page_count integer,
  chunk_count integer,
  outcome text not null,
  result_metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  constraint document_processing_result_document_fkey foreign key (document_id,business_id)
    references public.business_documents(id,business_id) on delete restrict,
  constraint document_processing_result_job_fkey foreign key (job_id,business_id,document_id)
    references public.receipt_processing_jobs(id,business_id,document_id) on delete restrict,
  constraint document_processing_result_hash_check check (document_sha256 ~ '^[a-f0-9]{64}$'),
  constraint document_processing_result_outcome_check check (outcome in ('inspected','needs_attention','unreadable')),
  constraint document_processing_result_bounds_check check (
    (page_count is null or page_count between 1 and 500)
    and (chunk_count is null or chunk_count between 1 and 100)),
  constraint document_processing_result_identity_unique unique
    (business_id,document_id,document_sha256,processor_version)
);
alter table public.document_processing_results enable row level security;
revoke all on public.document_processing_results from public,anon,authenticated;
grant select,insert on public.document_processing_results to service_role;
create or replace function public.prevent_document_processing_result_mutation()
returns trigger language plpgsql set search_path='' as $$ begin
  raise exception 'document processing results are append-only';
end; $$;
create trigger document_processing_results_append_only before update or delete
  on public.document_processing_results for each row execute function public.prevent_document_processing_result_mutation();

create or replace function public.register_business_statement(
  p_document_id uuid,p_document_class text,p_upload_fingerprint text,p_storage_path text,
  p_original_name text,p_mime_type text,p_bytes integer
) returns public.business_documents language plpgsql security definer set search_path='' as $$
declare selected_business_id uuid; selected_document public.business_documents%rowtype;
begin
  if (select auth.uid()) is null then raise exception 'authentication required'; end if;
  if p_document_class not in ('bank_statement','card_statement') then raise exception 'unsupported document class'; end if;
  if p_upload_fingerprint !~ '^[a-f0-9]{64}$' then raise exception 'invalid upload fingerprint'; end if;
  if p_storage_path<>concat('statements/',(select auth.uid())::text,'/',p_upload_fingerprint)
    then raise exception 'invalid statement storage path'; end if;
  if p_mime_type<>'application/pdf' or p_bytes not between 1 and 104857600
    then raise exception 'unsupported statement file'; end if;
  select id into selected_business_id from public.businesses where owner_user_id=(select auth.uid());
  if selected_business_id is null then raise exception 'Business unavailable'; end if;
  perform pg_advisory_xact_lock(hashtextextended(concat(selected_business_id,':',p_upload_fingerprint),53));
  insert into public.business_documents(id,business_id,owner_user_id,document_class,upload_fingerprint,
    storage_path,original_name,mime_type,bytes)
  values(p_document_id,selected_business_id,(select auth.uid()),p_document_class,p_upload_fingerprint,
    p_storage_path,left(nullif(btrim(p_original_name),''),255),p_mime_type,p_bytes)
  on conflict (business_id,upload_fingerprint) do nothing returning * into selected_document;
  if selected_document.id is null then select * into selected_document from public.business_documents
    where business_id=selected_business_id and upload_fingerprint=p_upload_fingerprint; end if;
  if selected_document.storage_path<>p_storage_path or selected_document.bytes<>p_bytes
    then raise exception 'upload identity has different metadata'; end if;
  insert into public.receipt_processing_jobs(business_id,receipt_id,document_id,job_type,processing_reason,
    document_sha256,processor_version,provider,model,prompt_version,output_schema_version)
  values(selected_business_id,null,selected_document.id,'statement_inspection','statement_registered',
    p_upload_fingerprint,'statement-inspection:v1','deterministic','native-pdf','none','statement-metadata:v1')
  on conflict do nothing;
  return selected_document;
end; $$;
revoke all on function public.register_business_statement(uuid,text,text,text,text,text,integer) from public,anon;
grant execute on function public.register_business_statement(uuid,text,text,text,text,text,integer) to authenticated;

-- Keep canonical receipt work distinct from write-disabled multimodal shadow.
create or replace function public.enqueue_uploaded_receipt_understanding()
returns trigger language plpgsql security definer set search_path='' as $$
declare fingerprint text;
begin
  if new.event_type='uploaded' then
    select upload_fingerprint into fingerprint from public.receipts
      where id=new.receipt_id and business_id=new.business_id;
    if fingerprint is not null then
      insert into public.receipt_processing_jobs(business_id,receipt_id,job_type,processing_reason,
        document_sha256,processor_version,provider,model,prompt_version,output_schema_version)
      values(new.business_id,new.receipt_id,'canonical_receipt_extraction','receipt_registered',fingerprint,
        'canonical-receipt-extraction:v1','google_vision','document-text-detection','receipt-parser:v1','receipt-extraction:v1')
      on conflict do nothing;
      perform public.request_receipt_understanding_processing(new.business_id,new.receipt_id,'receipt_registered',fingerprint,
        'receipt-understanding:r1.1','openai','environment-configured',
        'receipt-understanding-prompt:v1','receipt-understanding-schema:v1');
    end if;
  end if;
  return new;
end; $$;

create or replace function public.claim_receipt_processing_jobs_by_type(
  p_lease_id uuid,p_job_types text[],p_limit integer default 5,p_lease_seconds integer default 120
) returns setof public.receipt_processing_jobs language plpgsql security definer set search_path='' as $$
begin
  if (select auth.role())<>'service_role' then raise exception 'trusted document worker required'; end if;
  if p_lease_id is null or coalesce(array_length(p_job_types,1),0)=0 or p_limit not between 1 and 25
    or p_lease_seconds not between 30 and 900 then raise exception 'invalid document worker claim'; end if;
  update public.receipt_processing_jobs set state='dead_letter',lease_id=null,lease_expires_at=null,
    last_error_code=coalesce(last_error_code,'RETRY_LIMIT_EXCEEDED'),updated_at=now()
    where job_type=any(p_job_types) and state='processing' and lease_expires_at<=now() and attempt_count>=6;
  return query with candidates as (
    select jobs.id from public.receipt_processing_jobs jobs where jobs.job_type=any(p_job_types) and
      ((jobs.state in ('pending','retryable') and jobs.available_at<=now())
        or (jobs.state='processing' and jobs.lease_expires_at<=now()))
      and jobs.attempt_count<6 order by jobs.available_at,jobs.created_at,jobs.id
      for update skip locked limit p_limit
  ) update public.receipt_processing_jobs jobs set state='processing',attempt_count=jobs.attempt_count+1,
    lease_id=p_lease_id,lease_expires_at=now()+make_interval(secs=>p_lease_seconds),claimed_at=now(),
    last_attempted_at=now(),last_error_code=null,updated_at=now()
    from candidates where jobs.id=candidates.id returning jobs.*;
end; $$;
revoke execute on function public.claim_receipt_processing_jobs_by_type(uuid,text[],integer,integer) from public,anon,authenticated;
grant execute on function public.claim_receipt_processing_jobs_by_type(uuid,text[],integer,integer) to service_role;

create or replace function public.finish_receipt_processing_job(
  p_job_id uuid,p_lease_id uuid,p_state text,p_terminal_reason text default null
) returns boolean language plpgsql security definer set search_path='' as $$
declare changed integer;
begin
  if (select auth.role())<>'service_role' then raise exception 'trusted document worker required'; end if;
  if p_state not in ('completed','needs_attention','unreadable') then raise exception 'invalid terminal state'; end if;
  if p_terminal_reason is not null and p_terminal_reason !~ '^[A-Z0-9_]{1,100}$'
    then raise exception 'safe terminal reason required'; end if;
  update public.receipt_processing_jobs set state=p_state,completed_at=now(),lease_id=null,
    lease_expires_at=null,last_error_code=null,terminal_reason=p_terminal_reason,updated_at=now()
    where id=p_job_id and state='processing' and lease_id=p_lease_id and lease_expires_at>now();
  get diagnostics changed=row_count; return changed=1;
end; $$;
revoke execute on function public.finish_receipt_processing_job(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.finish_receipt_processing_job(uuid,uuid,text,text) to service_role;

create or replace function public.requeue_terminal_document_processing_job(
  p_job_id uuid,p_expected_state text,p_reason text
) returns boolean language plpgsql security definer set search_path='' as $$
declare changed integer;
begin
  if (select auth.role())<>'service_role' then raise exception 'trusted document operator required'; end if;
  if p_expected_state not in ('needs_attention','unreadable','dead_letter')
    or p_reason !~ '^[A-Z0-9_]{1,100}$' then raise exception 'guarded recovery identity required'; end if;
  update public.receipt_processing_jobs set state='retryable',attempt_count=0,recovery_count=recovery_count+1,
    available_at=now(),completed_at=null,last_error_code=p_reason,terminal_reason=null,updated_at=now()
    where id=p_job_id and state=p_expected_state and lease_id is null;
  get diagnostics changed=row_count; return changed=1;
end; $$;
revoke execute on function public.requeue_terminal_document_processing_job(uuid,text,text) from public,anon,authenticated;
grant execute on function public.requeue_terminal_document_processing_job(uuid,text,text) to service_role;

-- Existing shadow drains must never claim canonical or statement jobs.
create or replace function public.claim_receipt_processing_jobs(
  p_lease_id uuid,p_limit integer default 5,p_lease_seconds integer default 120
) returns setof public.receipt_processing_jobs language sql security definer set search_path='' as $$
  select * from public.claim_receipt_processing_jobs_by_type(
    p_lease_id,array['receipt_understanding_shadow']::text[],p_limit,p_lease_seconds);
$$;

create or replace view public.current_customer_receipt_processing_status
with (security_barrier=true) as
select receipt.id as receipt_id,receipt.business_id,
  case
    when event.event_type='discarded' then 'discarded'
    when event.event_type in ('matched','retained','kept') then 'organized'
    when event.event_type='extraction_completed' then 'needs_attention'
    when job.state='processing' then 'processing'
    when job.state in ('dead_letter','unreadable') then 'unreadable'
    when job.state='needs_attention' then 'needs_attention'
    else 'queued'
  end as processing_status,
  job.attempt_count,job.last_error_code,job.terminal_reason,job.updated_at
from public.receipts receipt
left join lateral (
  select e.* from public.bookkeeping_receipt_events e where e.receipt_id=receipt.id
    and not exists(select 1 from public.bookkeeping_receipt_events successor where successor.supersedes_event_id=e.id)
  limit 1
) event on true
left join lateral (
  select j.* from public.receipt_processing_jobs j where j.receipt_id=receipt.id
    and j.job_type='canonical_receipt_extraction' order by j.created_at desc limit 1
) job on true
where receipt.user_id=(select auth.uid());
revoke all on public.current_customer_receipt_processing_status from public,anon;
grant select on public.current_customer_receipt_processing_status to authenticated;

create or replace view public.current_customer_statement_status with (security_barrier=true) as
select document.id,document.business_id,document.original_name,document.bytes,document.created_at,
  case when job.state='completed' then 'organized'
    when job.state='processing' then 'processing'
    when job.state in ('needs_attention','dead_letter') then 'needs_attention'
    when job.state='unreadable' then 'unreadable' else 'queued' end as processing_status,
  job.attempt_count
from public.business_documents document
left join lateral (select j.* from public.receipt_processing_jobs j where j.document_id=document.id
  order by j.created_at desc limit 1) job on true
where document.owner_user_id=(select auth.uid());
revoke all on public.current_customer_statement_status from public,anon;
grant select on public.current_customer_statement_status to authenticated;

create or replace view public.document_processing_observability with (security_invoker=true) as
select job_type,state,count(*)::bigint as job_count,min(created_at) as oldest_created_at,
  max(attempt_count) as max_attempt_count,max(recovery_count) as max_recovery_count,
  max(last_error_code) as last_error_category
from public.receipt_processing_jobs group by job_type,state;
revoke all on public.document_processing_observability from public,anon,authenticated;
grant select on public.document_processing_observability to service_role;

insert into public.receipt_processing_jobs(business_id,receipt_id,job_type,processing_reason,
  document_sha256,processor_version,provider,model,prompt_version,output_schema_version)
select receipt.business_id,receipt.id,'canonical_receipt_extraction','durability_backfill',
  receipt.upload_fingerprint,'canonical-receipt-extraction:v1','google_vision','document-text-detection',
  'receipt-parser:v1','receipt-extraction:v1'
from public.receipts receipt
join public.bookkeeping_receipt_events event on event.receipt_id=receipt.id and event.event_type='uploaded'
where receipt.business_id is not null and receipt.upload_fingerprint is not null
  and not exists(select 1 from public.bookkeeping_receipt_events successor where successor.supersedes_event_id=event.id)
on conflict do nothing;

-- Statements share the existing private bucket but use a distinct owner prefix.
create policy statement_objects_select_own on storage.objects for select to authenticated using (
  bucket_id='receipts' and (storage.foldername(name))[1]='statements'
  and (storage.foldername(name))[2]=(select auth.uid())::text);
create policy statement_objects_insert_own on storage.objects for insert to authenticated with check (
  bucket_id='receipts' and (storage.foldername(name))[1]='statements'
  and (storage.foldername(name))[2]=(select auth.uid())::text);

-- Allow trusted workers to append automation extraction without impersonating a customer.
create or replace function public.worker_record_bookkeeping_receipt_extraction(
  p_receipt_id uuid,p_extraction_key text,p_provider text,p_merchant text,p_occurred_on date,
  p_total_amount_cents bigint,p_raw_payload jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare owner_id uuid; result jsonb;
begin
  if (select auth.role())<>'service_role' then raise exception 'trusted document worker required'; end if;
  select user_id into owner_id from public.receipts where id=p_receipt_id;
  if owner_id is null then raise exception 'receipt unavailable'; end if;
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  result:=public.record_bookkeeping_receipt_extraction(p_receipt_id,p_extraction_key,p_provider,p_merchant,
    p_occurred_on,p_total_amount_cents,p_raw_payload);
  return result;
end; $$;
revoke all on function public.worker_record_bookkeeping_receipt_extraction(uuid,text,text,text,date,bigint,jsonb)
  from public,anon,authenticated;
grant execute on function public.worker_record_bookkeeping_receipt_extraction(uuid,text,text,text,date,bigint,jsonb)
  to service_role;

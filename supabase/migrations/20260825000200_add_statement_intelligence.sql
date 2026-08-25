-- Durable, Business-scoped statement periods and immutable source observations.

alter table public.financial_transactions drop constraint financial_transactions_import_method_check;
alter table public.financial_transactions add constraint financial_transactions_import_method_check
  check (import_method in ('provider','csv','statement'));

alter table public.receipt_processing_jobs add column next_page integer not null default 1;
alter table public.receipt_processing_jobs add constraint receipt_processing_jobs_next_page_check check (next_page >= 1);

create or replace function public.register_business_statement(
  p_document_id uuid,p_document_class text,p_upload_fingerprint text,p_storage_path text,
  p_original_name text,p_mime_type text,p_bytes integer
) returns public.business_documents language plpgsql security definer set search_path='' as $$
declare selected_business_id uuid; selected_document public.business_documents%rowtype;
begin
  if (select auth.uid()) is null then raise exception 'authentication required'; end if;
  if p_document_class not in ('bank_statement','card_statement') or p_upload_fingerprint !~ '^[a-f0-9]{64}$'
    or p_storage_path<>concat('statements/',(select auth.uid())::text,'/',p_upload_fingerprint)
    or p_mime_type<>'application/pdf' or p_bytes not between 1 and 104857600 then raise exception 'unsupported statement file'; end if;
  select id into selected_business_id from public.businesses where owner_user_id=(select auth.uid());
  if selected_business_id is null then raise exception 'Business unavailable'; end if;
  perform pg_advisory_xact_lock(hashtextextended(concat(selected_business_id,':',p_upload_fingerprint),53));
  insert into public.business_documents(id,business_id,owner_user_id,document_class,upload_fingerprint,storage_path,original_name,mime_type,bytes)
  values(p_document_id,selected_business_id,(select auth.uid()),p_document_class,p_upload_fingerprint,p_storage_path,
    left(nullif(btrim(p_original_name),''),255),p_mime_type,p_bytes)
  on conflict(business_id,upload_fingerprint) do nothing returning * into selected_document;
  if selected_document.id is null then select * into selected_document from public.business_documents
    where business_id=selected_business_id and upload_fingerprint=p_upload_fingerprint; end if;
  if selected_document.storage_path<>p_storage_path or selected_document.bytes<>p_bytes then raise exception 'upload identity has different metadata'; end if;
  insert into public.receipt_processing_jobs(business_id,document_id,job_type,processing_reason,document_sha256,
    processor_version,provider,model,prompt_version,output_schema_version)
  values(selected_business_id,selected_document.id,'statement_inspection','statement_registered',p_upload_fingerprint,
    'statement-intelligence:r1','deterministic','pdfjs-native-text','statement-parser:r1','statement-period:r1') on conflict do nothing;
  return selected_document;
end $$;

create table public.statement_periods (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  document_id uuid not null,
  financial_account_id uuid not null,
  period_identity text not null,
  institution_name text not null,
  masked_account text,
  account_type text not null,
  currency text not null,
  period_start date,
  period_end date,
  issue_date date,
  beginning_balance_cents bigint,
  ending_balance_cents bigint,
  validation_status text not null,
  source_page_start integer not null,
  source_page_end integer not null,
  imported_transaction_count integer not null default 0,
  ambiguous_row_count integer not null default 0,
  created_at timestamptz not null default now(),
  constraint statement_periods_document_business_fkey foreign key(document_id,business_id)
    references public.business_documents(id,business_id) on delete restrict,
  constraint statement_periods_account_business_fkey foreign key(financial_account_id,business_id)
    references public.financial_accounts(id,business_id) on delete restrict,
  constraint statement_periods_identity_check check(period_identity ~ '^[a-f0-9]{64}$'),
  constraint statement_periods_mask_check check(masked_account is null or masked_account ~ '^[0-9]{4}$'),
  constraint statement_periods_type_check check(account_type in ('checking','savings','credit_card')),
  constraint statement_periods_currency_check check(currency ~ '^[A-Z]{3}$'),
  constraint statement_periods_validation_check check(validation_status in ('validated','partially_validated','unresolved')),
  constraint statement_periods_pages_check check(source_page_start >= 1 and source_page_end >= source_page_start),
  constraint statement_periods_counts_check check(imported_transaction_count >= 0 and ambiguous_row_count >= 0),
  constraint statement_periods_business_identity_unique unique(business_id,period_identity),
  constraint statement_periods_id_business_unique unique(id,business_id)
);

create table public.statement_transaction_observations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  statement_period_id uuid not null,
  financial_transaction_id uuid not null,
  evidence_fingerprint text not null,
  transaction_date date not null,
  posting_date date,
  raw_description text not null,
  normalized_description text not null,
  amount_cents bigint not null,
  currency text not null,
  running_balance_cents bigint,
  check_number text,
  source_page integer not null,
  source_row integer not null,
  created_at timestamptz not null default now(),
  constraint statement_observations_period_business_fkey foreign key(statement_period_id,business_id)
    references public.statement_periods(id,business_id) on delete restrict,
  constraint statement_observations_transaction_business_fkey foreign key(financial_transaction_id,business_id)
    references public.financial_transactions(id,business_id) on delete restrict,
  constraint statement_observations_hash_check check(evidence_fingerprint ~ '^[a-f0-9]{64}$'),
  constraint statement_observations_amount_check check(amount_cents <> 0),
  constraint statement_observations_currency_check check(currency ~ '^[A-Z]{3}$'),
  constraint statement_observations_description_check check(length(raw_description) between 1 and 512 and length(normalized_description) between 1 and 512),
  constraint statement_observations_page_check check(source_page >= 1 and source_row >= 1),
  constraint statement_observations_evidence_unique unique(business_id,evidence_fingerprint)
);

alter table public.statement_periods enable row level security;
alter table public.statement_transaction_observations enable row level security;
create policy statement_periods_select_own on public.statement_periods for select to authenticated using
  (exists(select 1 from public.businesses where id=statement_periods.business_id and owner_user_id=(select auth.uid())));
create policy statement_observations_select_own on public.statement_transaction_observations for select to authenticated using
  (exists(select 1 from public.businesses where id=statement_transaction_observations.business_id and owner_user_id=(select auth.uid())));
revoke all on public.statement_periods,public.statement_transaction_observations from public,anon,authenticated;
grant select on public.statement_periods,public.statement_transaction_observations to authenticated;
grant all on public.statement_periods,public.statement_transaction_observations to service_role;

create or replace function public.reject_statement_source_mutation() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'statement source observations are immutable'; end $$;
create trigger statement_periods_immutable before update or delete on public.statement_periods
  for each row execute function public.reject_statement_source_mutation();
create trigger statement_observations_immutable before update or delete on public.statement_transaction_observations
  for each row execute function public.reject_statement_source_mutation();

create or replace function public.continue_document_processing_job(p_job_id uuid,p_lease_id uuid,p_next_page integer)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  if (select auth.role()) <> 'service_role' then raise exception 'trusted document worker required'; end if;
  update public.receipt_processing_jobs set state='pending',next_page=p_next_page,available_at=now(),
    lease_owner=null,lease_expires_at=null,updated_at=now()
  where id=p_job_id and state='processing' and lease_owner=p_lease_id and p_next_page>next_page;
  return found;
end $$;
revoke execute on function public.continue_document_processing_job(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.continue_document_processing_job(uuid,uuid,integer) to service_role;

create or replace function public.ingest_statement_period(p_job_id uuid,p_period jsonb,p_rows jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  job public.receipt_processing_jobs%rowtype; doc public.business_documents%rowtype;
  account public.financial_accounts%rowtype; period public.statement_periods%rowtype;
  transaction public.financial_transactions%rowtype; record public.bookkeeping_records%rowtype;
  item jsonb; account_identity text; imported integer:=0; duplicates integer:=0;
  evidence_hash text; source_hash text; amount bigint; occurred date; raw_text text; normalized text;
begin
  if (select auth.role()) <> 'service_role' then raise exception 'trusted statement worker required'; end if;
  select * into job from public.receipt_processing_jobs where id=p_job_id for update;
  if job.id is null or job.job_type<>'statement_inspection' or job.document_id is null then raise exception 'statement job unavailable'; end if;
  select * into doc from public.business_documents where id=job.document_id and business_id=job.business_id;
  if doc.id is null or doc.upload_fingerprint<>job.document_sha256 then raise exception 'statement document stale'; end if;
  perform pg_catalog.set_config('request.jwt.claim.sub',doc.owner_user_id::text,true);
  perform pg_catalog.set_config('request.jwt.claim.role','authenticated',true);
  if jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)>5000 then raise exception 'invalid statement rows'; end if;
  if coalesce(p_period->>'period_identity','') !~ '^[a-f0-9]{64}$'
    or coalesce(p_period->>'institution_name','')='' or coalesce(p_period->>'account_type','') not in ('checking','savings','credit_card')
    or coalesce(p_period->>'currency','') !~ '^[A-Z]{3}$' then raise exception 'invalid statement period'; end if;
  account_identity:=job.business_id::text||':statement:'||encode(extensions.digest(convert_to(
    upper(p_period->>'institution_name')||'|'||coalesce(p_period->>'masked_account','')||'|'||(p_period->>'account_type')||'|'||(p_period->>'currency'),'UTF8'),'sha256'),'hex');
  insert into public.financial_accounts(business_id,provider,provider_account_id,institution_name,display_name,account_type,mask_last_four,currency)
  values(job.business_id,'statement',account_identity,left(p_period->>'institution_name',200),left(p_period->>'institution_name',200),
    p_period->>'account_type',nullif(p_period->>'masked_account',''),p_period->>'currency')
  on conflict(provider,provider_account_id) where provider is not null and provider_account_id is not null do nothing;
  select * into account from public.financial_accounts where provider='statement' and provider_account_id=account_identity;
  insert into public.statement_periods(business_id,document_id,financial_account_id,period_identity,institution_name,masked_account,
    account_type,currency,period_start,period_end,issue_date,beginning_balance_cents,ending_balance_cents,validation_status,
    source_page_start,source_page_end,ambiguous_row_count)
  values(job.business_id,doc.id,account.id,p_period->>'period_identity',left(p_period->>'institution_name',200),nullif(p_period->>'masked_account',''),
    p_period->>'account_type',p_period->>'currency',nullif(p_period->>'period_start','')::date,nullif(p_period->>'period_end','')::date,
    nullif(p_period->>'issue_date','')::date,nullif(p_period->>'beginning_balance_cents','')::bigint,
    nullif(p_period->>'ending_balance_cents','')::bigint,p_period->>'validation_status',
    (p_period->>'source_page_start')::integer,(p_period->>'source_page_end')::integer,coalesce((p_period->>'ambiguous_row_count')::integer,0))
  on conflict(business_id,period_identity) do nothing;
  select * into period from public.statement_periods where business_id=job.business_id and period_identity=p_period->>'period_identity';
  for item in select value from jsonb_array_elements(p_rows) loop
    evidence_hash:=item->>'evidence_fingerprint'; amount:=(item->>'amount_cents')::bigint; occurred:=(item->>'transaction_date')::date;
    raw_text:=left(item->>'raw_description',512); normalized:=left(item->>'normalized_description',512);
    if evidence_hash !~ '^[a-f0-9]{64}$' or amount=0 or raw_text='' or normalized='' then raise exception 'invalid statement observation'; end if;
    select ft.* into transaction from public.statement_transaction_observations obs join public.financial_transactions ft
      on ft.id=obs.financial_transaction_id where obs.business_id=job.business_id and obs.evidence_fingerprint=evidence_hash;
    if transaction.id is null then
      source_hash:=encode(extensions.digest(convert_to('statement:v1'||chr(10)||account.id::text||chr(10)||evidence_hash,'UTF8'),'sha256'),'hex');
      insert into public.financial_transactions(business_id,financial_account_id,source_fingerprint,import_method,merchant_name,
        original_description,amount_cents,currency,transaction_date,pending,raw_payload)
      values(job.business_id,account.id,source_hash,'statement',raw_text,raw_text,amount,p_period->>'currency',occurred,false,
        jsonb_build_object('source','statement','statement_period_id',period.id,'posting_date',item->>'posting_date',
          'source_page',(item->>'source_page')::integer,'check_number',item->>'check_number'))
      on conflict(financial_account_id,source_fingerprint) do nothing returning * into transaction;
      if transaction.id is null then select * into transaction from public.financial_transactions where financial_account_id=account.id and source_fingerprint=source_hash;
      else imported:=imported+1; end if;
      insert into public.statement_transaction_observations(business_id,statement_period_id,financial_transaction_id,evidence_fingerprint,
        transaction_date,posting_date,raw_description,normalized_description,amount_cents,currency,running_balance_cents,check_number,source_page,source_row)
      values(job.business_id,period.id,transaction.id,evidence_hash,occurred,nullif(item->>'posting_date','')::date,raw_text,normalized,
        amount,p_period->>'currency',nullif(item->>'running_balance_cents','')::bigint,nullif(item->>'check_number',''),
        (item->>'source_page')::integer,(item->>'source_row')::integer)
      on conflict(business_id,evidence_fingerprint) do nothing;
      record:=public.ensure_bookkeeping_record(job.business_id,'financial_transaction',transaction.id,'import',
        'financial_transaction:'||transaction.id::text,transaction.amount_cents,transaction.currency,transaction.transaction_date);
      perform public.ensure_initial_bookkeeping_decision(job.business_id,record.id);
    else duplicates:=duplicates+1; end if;
  end loop;
  return jsonb_build_object('period_id',period.id,'imported',imported,'duplicates',duplicates,
    'processed',jsonb_array_length(p_rows));
end $$;
revoke execute on function public.ingest_statement_period(uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.ingest_statement_period(uuid,jsonb,jsonb) to service_role;

create view public.current_customer_statement_periods with (security_invoker=true) as
select period.*,count(observation.id)::integer as transaction_count
from public.statement_periods period left join public.statement_transaction_observations observation
  on observation.statement_period_id=period.id
group by period.id;
grant select on public.current_customer_statement_periods to authenticated;

create or replace view public.current_customer_statement_status with (security_barrier=true) as
select document.id,document.business_id,document.original_name,document.bytes,document.created_at,
  case when job.state='completed' then 'organized' when job.state='processing' then 'processing'
    when job.state in ('needs_attention','dead_letter') then 'needs_attention'
    when job.state='unreadable' then 'unreadable' else 'queued' end as processing_status,
  job.attempt_count,coalesce(summary.transaction_count,0)::integer as transaction_count,
  summary.institution_name,summary.masked_account,summary.account_type,summary.period_start,summary.period_end
from public.business_documents document
left join lateral(select j.* from public.receipt_processing_jobs j where j.document_id=document.id order by j.created_at desc limit 1) job on true
left join lateral(select count(observation.id) as transaction_count,max(period.institution_name) as institution_name,
  max(period.masked_account) as masked_account,max(period.account_type) as account_type,min(period.period_start) as period_start,
  max(period.period_end) as period_end from public.statement_periods period left join public.statement_transaction_observations observation
    on observation.statement_period_id=period.id where period.document_id=document.id) summary on true
where document.owner_user_id=(select auth.uid());
revoke all on public.current_customer_statement_status from public,anon;
grant select on public.current_customer_statement_status to authenticated;

insert into public.receipt_processing_jobs(business_id,document_id,job_type,processing_reason,document_sha256,
  processor_version,provider,model,prompt_version,output_schema_version)
select business_id,id,'statement_inspection','statement_intelligence_upgrade',upload_fingerprint,
  'statement-intelligence:r1','deterministic','pdfjs-native-text','statement-parser:r1','statement-period:r1'
from public.business_documents on conflict do nothing;

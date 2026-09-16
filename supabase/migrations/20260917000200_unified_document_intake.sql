-- One private intake over existing receipt/document lifecycles. No ledger fork.
alter table public.business_documents drop constraint business_documents_class_check;
alter table public.business_documents add constraint business_documents_class_check check(document_class in('unclassified','receipt','bank_statement','card_statement','transaction_file','unknown'));
alter table public.business_documents drop constraint business_documents_mime_check;
alter table public.business_documents add constraint business_documents_mime_check check(mime_type in('application/pdf','image/png','image/jpeg','image/webp','text/csv','application/octet-stream'));
alter table public.business_documents add column receipt_id uuid;
alter table public.business_documents add constraint business_documents_receipt_business_fkey foreign key(receipt_id,business_id) references public.receipts(id,business_id) on delete restrict;

create function public.register_customer_document(p_id uuid,p_fingerprint text,p_name text,p_mime text,p_bytes integer)
returns public.business_documents language plpgsql security definer set search_path='' as $$
declare business uuid; doc public.business_documents%rowtype;
begin
 if auth.uid() is null or coalesce(auth.jwt()->>'aal','')<>'aal2' or not public.customer_has_active_membership() then raise exception 'active authenticated membership required';end if;
 select id into business from public.businesses where owner_user_id=auth.uid();
 if business is null or p_fingerprint !~ '^[a-f0-9]{64}$' or p_bytes not between 1 and 20971520 or length(p_name)>255 then raise exception 'invalid document';end if;
 if exists(select 1 from public.account_deletion_requests where business_id=business and status in('scheduled','executing','retryable','completed')) then raise exception 'account unavailable';end if;
 perform pg_advisory_xact_lock(hashtextextended(business::text||':document-intake',53));
 select * into doc from public.business_documents where business_id=business and upload_fingerprint=p_fingerprint;
 if doc.id is not null then return doc;end if;
 if (select count(*) from public.receipt_processing_jobs where business_id=business and document_id is not null and state in('pending','processing','retryable'))>=30 then raise exception 'document queue full';end if;
 insert into public.business_documents(id,business_id,owner_user_id,document_class,upload_fingerprint,storage_path,original_name,mime_type,bytes)
 values(p_id,business,auth.uid(),'unclassified',p_fingerprint,'receipts/'||auth.uid()::text||'/'||p_fingerprint,p_name,p_mime,p_bytes) returning * into doc;
 insert into public.receipt_processing_jobs(business_id,document_id,job_type,processing_reason,document_sha256,processor_version,provider,model,prompt_version,output_schema_version)
 values(business,doc.id,'document_intake','customer_upload',p_fingerprint,'document-intake:v1','deterministic','content-first','none','document-route:v1');return doc;
end;$$;
revoke all on function public.register_customer_document(uuid,text,text,text,integer) from public,anon;
grant execute on function public.register_customer_document(uuid,text,text,text,integer) to authenticated;

create function public.claim_customer_document_job(p_document_id uuid,p_lease_id uuid)
returns setof public.receipt_processing_jobs language plpgsql security definer set search_path='' as $$
begin
 if auth.role()<>'service_role' then raise exception 'trusted worker required';end if;
 return query with candidate as(select id from public.receipt_processing_jobs where document_id=p_document_id
 and job_type in('document_intake','statement_inspection') and attempt_count<6
 and ((state in('pending','retryable') and available_at<=now()) or(state='processing' and lease_expires_at<=now()))
 order by created_at desc for update skip locked limit 1)
 update public.receipt_processing_jobs j set state='processing',attempt_count=j.attempt_count+1,lease_id=p_lease_id,
 lease_expires_at=now()+interval '180 seconds',claimed_at=now(),last_attempted_at=now(),last_error_code=null,updated_at=now()
 from candidate where j.id=candidate.id returning j.*;
end;$$;
revoke all on function public.claim_customer_document_job(uuid,uuid) from public,anon,authenticated;
grant execute on function public.claim_customer_document_job(uuid,uuid) to service_role;

create function public.worker_route_document_receipt(p_job_id uuid,p_lease_id uuid,p_mime text)
returns uuid language plpgsql security definer set search_path='' as $$
declare j public.receipt_processing_jobs%rowtype;d public.business_documents%rowtype;r public.receipts%rowtype;
begin
 if auth.role()<>'service_role' then raise exception 'trusted worker required';end if;
 select * into j from public.receipt_processing_jobs where id=p_job_id and state='processing' and lease_id=p_lease_id and lease_expires_at>now() for update;
 select * into d from public.business_documents where id=j.document_id and business_id=j.business_id;
 if d.id is null then raise exception 'document unavailable';end if;
 perform set_config('request.jwt.claim.sub',d.owner_user_id::text,true);
 perform set_config('request.jwt.claim.role','authenticated',true);
 r:=public.register_bookkeeping_receipt(gen_random_uuid(),d.upload_fingerprint,d.storage_path,d.original_name,p_mime,d.bytes);
 update public.business_documents set document_class='receipt',receipt_id=r.id where id=d.id;
 return r.id;
end;$$;
revoke all on function public.worker_route_document_receipt(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.worker_route_document_receipt(uuid,uuid,text) to service_role;

create function public.worker_import_document_rows(p_job_id uuid,p_lease_id uuid,p_rows jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.receipt_processing_jobs%rowtype;d public.business_documents%rowtype;result jsonb;
begin
 if auth.role()<>'service_role' then raise exception 'trusted worker required';end if;
 select * into j from public.receipt_processing_jobs where id=p_job_id and state='processing' and lease_id=p_lease_id and lease_expires_at>now() for update;
 select * into d from public.business_documents where id=j.document_id and business_id=j.business_id;
 if d.id is null or j.job_type<>'document_intake' then raise exception 'document unavailable';end if;
 perform set_config('request.jwt.claim.sub',d.owner_user_id::text,true);
 perform set_config('request.jwt.claim.role','authenticated',true);
 perform pg_advisory_xact_lock(hashtextextended(j.business_id::text||':statement-ingestion',53));
 if exists(select 1 from jsonb_array_elements(p_rows) r join public.financial_transactions f
 on f.business_id=j.business_id and f.import_method<>'csv' and f.amount_cents=(r->>'amount_cents')::bigint
 and abs(f.transaction_date-(r->>'transaction_date')::date)<=3
 and regexp_replace(lower(f.original_description),'[^a-z0-9]','','g')=regexp_replace(lower(r->>'raw_description'),'[^a-z0-9]','','g'))
 then return jsonb_build_object('review_required',true,'processed',0);end if;
 result:=public.ingest_csv_financial_activity(p_rows);
 update public.business_documents set document_class='transaction_file' where id=d.id;
 return result;
end;$$;
revoke all on function public.worker_import_document_rows(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.worker_import_document_rows(uuid,uuid,jsonb) to service_role;

create or replace function public.continue_document_processing_job(p_job_id uuid,p_lease_id uuid,p_next_page integer)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 if auth.role()<>'service_role' then raise exception 'trusted worker required';end if;
 update public.receipt_processing_jobs set state='pending',next_page=p_next_page,available_at=now(),lease_id=null,lease_expires_at=null,updated_at=now(),attempt_count=0
 where id=p_job_id and state='processing' and lease_id=p_lease_id and lease_expires_at>now() and p_next_page>next_page;
 return found;
end;$$;

create view public.current_customer_document_status with(security_barrier=true) as
select d.id,d.original_name,d.created_at,d.document_class,d.receipt_id,
 coalesce(rj.state,j.state,'pending') as state,coalesce(rj.terminal_reason,j.terminal_reason) as reason,
 coalesce((result.result_metadata->>'transactionCount')::integer,0) as transaction_count,
 case when exists(select 1 from public.current_bookkeeping_record_convergences c where c.business_id=d.business_id and c.receipt_id=d.receipt_id) then 'matched' else receipt_event.event_type end as receipt_outcome
from public.business_documents d
left join lateral(select * from public.receipt_processing_jobs j where j.document_id=d.id order by created_at desc limit 1) j on true
left join lateral(select * from public.receipt_processing_jobs j where j.receipt_id=d.receipt_id and j.job_type='canonical_receipt_extraction' order by created_at desc limit 1) rj on true
left join lateral(select * from public.document_processing_results r where r.document_id=d.id order by created_at desc limit 1) result on true
left join lateral(select event_type from public.bookkeeping_receipt_events e where e.receipt_id=d.receipt_id order by sequence_number desc limit 1) receipt_event on true
where d.owner_user_id=auth.uid() and coalesce(auth.jwt()->>'aal','')='aal2';
revoke all on public.current_customer_document_status from public,anon;
grant select on public.current_customer_document_status to authenticated;

-- Preserve canonical source creation; add explicit lease and serialized ingestion.
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
  if job.id is null or job.job_type not in('statement_inspection','document_intake') or job.document_id is null then raise exception 'statement job unavailable'; end if;
  if job.state<>'processing' or job.lease_id::text is distinct from p_period->>'lease_id' or job.lease_expires_at<=now() then raise exception 'statement lease unavailable';end if;
  select * into doc from public.business_documents where id=job.document_id and business_id=job.business_id;
  if doc.id is null or doc.upload_fingerprint<>job.document_sha256 then raise exception 'statement document stale'; end if;
  perform pg_advisory_xact_lock(hashtextextended(job.business_id::text||':statement-ingestion',53));
  perform pg_catalog.set_config('request.jwt.claim.sub',doc.owner_user_id::text,true);
  perform pg_catalog.set_config('request.jwt.claim.role','authenticated',true);
  if jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)>5000 then raise exception 'invalid statement rows'; end if;
  if coalesce(p_period->>'period_identity','') !~ '^[a-f0-9]{64}$'
    or coalesce(p_period->>'institution_name','')='' or coalesce(p_period->>'account_type','') not in ('checking','savings','credit_card')
    or coalesce(p_period->>'currency','') !~ '^[A-Z]{3}$' then raise exception 'invalid statement period'; end if;
  account_identity:=job.business_id::text||':statement:'||encode(extensions.digest(convert_to(
    upper(p_period->>'institution_name')||'|'||coalesce(p_period->>'masked_account','')||'|'||(p_period->>'account_type')||'|'||(p_period->>'currency'),'UTF8'),'sha256'),'hex');
  if exists(select 1 from jsonb_array_elements(p_rows) r join public.financial_transactions f
    on f.business_id=job.business_id and f.amount_cents=(r->>'amount_cents')::bigint
    and abs(f.transaction_date-(r->>'transaction_date')::date)<=3
    and regexp_replace(lower(f.original_description),'[^a-z0-9]','','g')=regexp_replace(lower(r->>'raw_description'),'[^a-z0-9]','','g')
    join public.financial_accounts a on a.id=f.financial_account_id
    where a.provider_account_id is distinct from account_identity)
    then return jsonb_build_object('review_required',true,'processed',0);end if;
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

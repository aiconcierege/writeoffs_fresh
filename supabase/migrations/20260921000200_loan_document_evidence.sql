alter table public.business_documents drop constraint business_documents_class_check;
alter table public.business_documents add constraint business_documents_class_check check(document_class in('unclassified','receipt','bank_statement','card_statement','transaction_file','unknown','loan_statement'));
create table public.bookkeeping_loan_document_facts (
 document_id uuid primary key references public.business_documents(id),business_id uuid not null references public.businesses(id),
 bookkeeping_record_id uuid not null, payment_date date not null,principal_cents bigint not null check(principal_cents>0),interest_cents bigint not null check(interest_cents>0),
 extraction_version text not null,created_at timestamptz not null default now(),
 foreign key(bookkeeping_record_id,business_id) references public.bookkeeping_records(id,business_id)
);
alter table public.bookkeeping_loan_document_facts enable row level security;
create policy loan_facts_owner on public.bookkeeping_loan_document_facts for select to authenticated using(exists(select 1 from public.businesses b where b.id=business_id and b.owner_user_id=auth.uid()) and coalesce(auth.jwt()->>'aal','')='aal2');
grant select on public.bookkeeping_loan_document_facts to authenticated;grant all on public.bookkeeping_loan_document_facts to service_role;
create trigger loan_facts_immutable before update or delete on public.bookkeeping_loan_document_facts for each row execute function public.reject_compound_reconciliation_mutation();

-- Expand existing trusted-document validation to the same tenant's extracted,
-- transaction-bound loan document. All existing receipt validation remains.
do $$ declare definition text; revised text;
begin
 definition:=pg_get_functiondef('public.create_bookkeeping_compound_reconciliation(uuid,uuid,uuid,text,text,uuid[],jsonb,text)'::regprocedure);
 revised:=replace(definition,'where receipt.id = reference_id and receipt.business_id = p_business_id)',
 'where receipt.id = reference_id and receipt.business_id = p_business_id) and not exists (select 1 from public.bookkeeping_loan_document_facts loan where loan.document_id=reference_id and loan.business_id=p_business_id and loan.bookkeeping_record_id=p_anchor_bookkeeping_record_id)');
 if revised=definition then raise exception 'trusted document guard changed; review migration';end if;
 definition:=revised;
 revised:=replace(definition,'select (value->>''recordId'')::uuid from jsonb_array_elements(p_components) value))))',
 'select (value->>''recordId'')::uuid from jsonb_array_elements(p_components) value))) and not exists (select 1 from public.bookkeeping_loan_document_facts loan where loan.document_id=reference_id and loan.business_id=p_business_id and loan.bookkeeping_record_id=p_anchor_bookkeeping_record_id))');
 if revised=definition then raise exception 'document link guard changed; review migration';end if;
 execute revised;
end;$$;

create function public.worker_apply_loan_document(p_job uuid,p_lease uuid,p_date date,p_principal bigint,p_interest bigint)
returns boolean language plpgsql security definer set search_path='' as $$
declare j public.receipt_processing_jobs%rowtype;w public.customer_transaction_work%rowtype;r uuid;principal_id uuid;interest_id uuid;did uuid;fid uuid;
begin
 if auth.role()<>'service_role' then raise exception 'trusted worker required';end if;
 select * into j from public.receipt_processing_jobs where id=p_job and lease_id=p_lease and state='processing' and lease_expires_at>now() for update;
 if not found then raise exception 'document lease unavailable';end if;
 if exists(select 1 from public.bookkeeping_loan_document_facts where document_id=j.document_id and business_id=j.business_id) then return true;end if;
 if (select count(*) from public.bookkeeping_supporting_documents where document_id=j.document_id and business_id=j.business_id)<>1 then return false;end if;
 select bookkeeping_record_id into r from public.bookkeeping_supporting_documents where document_id=j.document_id and business_id=j.business_id;
 select * into w from public.customer_transaction_work where record_id=r and business_id=j.business_id;
 if not found or w.bookkeeping_nature<>'loan_principal_payment' or w.treatment<>'unresolved' or p_principal<=0 or p_interest<=0 or p_principal+p_interest<>-w.amount_cents or p_date<>w.activity_date
  or not exists(select 1 from public.bookkeeping_special_events where bookkeeping_record_id=r and decision_id=w.decision_id and action='loan_payment') then return false;end if;
 select financial_transaction_id into fid from public.bookkeeping_financial_sources where bookkeeping_record_id=r and business_id=j.business_id and revoked_at is null;
 if fid is null then return false;end if;
 insert into public.bookkeeping_loan_document_facts(document_id,business_id,bookkeeping_record_id,payment_date,principal_cents,interest_cents,extraction_version) values(j.document_id,j.business_id,r,p_date,p_principal,p_interest,'loan-labels:v1');
 insert into public.bookkeeping_records(business_id,source_kind,ingestion_key,amount_cents,currency,occurred_on)
 select j.business_id,'manual','loan-document:'||j.document_id||':principal',-p_principal,currency,p_date from public.bookkeeping_records where id=r returning id into principal_id;
 did:=public.append_bookkeeping_decision(j.business_id,principal_id,null,'loan_principal_payment','excluded','resolved','system',null,'Principal from the customer-provided loan statement.',null,jsonb_build_array(jsonb_build_object('kind','excluded','amount_cents',-p_principal)));
 insert into public.bookkeeping_records(business_id,source_kind,ingestion_key,amount_cents,currency,occurred_on)
 select j.business_id,'manual','loan-document:'||j.document_id||':interest',-p_interest,currency,p_date from public.bookkeeping_records where id=r returning id into interest_id;
 did:=public.append_bookkeeping_decision(j.business_id,interest_id,null,'expense','business','resolved','system',null,'Interest from the loan statement for a customer-confirmed business loan. Tax support is assessed separately.',null,jsonb_build_array(jsonb_build_object('kind','business','amount_cents',-p_interest,'tax_category_key','interest')));
 perform public.create_bookkeeping_compound_reconciliation(j.business_id,fid,r,'loan_payment_split','trusted_document',array[j.document_id],
 jsonb_build_array(jsonb_build_object('recordId',principal_id,'amountCents',-p_principal,'role','loan_principal'),jsonb_build_object('recordId',interest_id,'amountCents',-p_interest,'role','loan_interest')),'loan-document:'||j.document_id);
 update public.business_documents set document_class='loan_statement' where id=j.document_id and business_id=j.business_id;
 return true;
end;$$;
revoke all on function public.worker_apply_loan_document(uuid,uuid,date,bigint,bigint) from public,anon,authenticated;
grant execute on function public.worker_apply_loan_document(uuid,uuid,date,bigint,bigint) to service_role;

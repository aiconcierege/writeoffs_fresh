-- Set aside an unrecognized upload without deleting its original or changing
-- financial records. Recognized receipts retain their existing Discard workflow.
create table public.customer_document_dispositions(
 id uuid primary key,
 business_id uuid not null references public.businesses(id),
 document_id uuid not null unique,
 actor_user_id uuid not null references auth.users(id),
 disposition text not null check(disposition='not_for_books'),
 created_at timestamptz not null default now(),
 foreign key(document_id,business_id) references public.business_documents(id,business_id)
);
alter table public.customer_document_dispositions enable row level security;
revoke all on public.customer_document_dispositions from public,anon,authenticated;
grant select on public.customer_document_dispositions to authenticated;
grant all on public.customer_document_dispositions to service_role;
create policy document_disposition_owner on public.customer_document_dispositions for select to authenticated
 using(auth.uid()=actor_user_id and auth.jwt()->>'aal'='aal2' and exists(
 select 1 from public.businesses b where b.id=business_id and b.owner_user_id=auth.uid()));
create trigger document_disposition_immutable before update or delete on public.customer_document_dispositions
 for each row execute function public.reject_canonical_bookkeeping_mutation();
create trigger betti_action_index_invalidate after insert on public.customer_document_dispositions
 for each row execute function public.invalidate_betti_action_index_from_fact();

create function public.set_aside_unrecognized_document(p_document uuid,p_request uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare bid uuid:=public.require_customer_setup_owner(); d public.business_documents%rowtype;
 j public.receipt_processing_jobs%rowtype; prior public.customer_document_dispositions%rowtype;
begin
 if p_request is null or p_document is null then raise exception 'Document required';end if;
 perform pg_advisory_xact_lock(hashtextextended('document-disposition:'||p_document::text,0));
 select * into prior from public.customer_document_dispositions where id=p_request;
 if found then
  if prior.business_id<>bid or prior.document_id<>p_document then raise exception 'Retry changed';end if;
  return true;
 end if;
 select * into d from public.business_documents where id=p_document and business_id=bid and owner_user_id=auth.uid();
 if not found then raise exception 'Document unavailable';end if;
 if exists(select 1 from public.customer_document_dispositions where document_id=d.id and business_id=bid) then return true;end if;
 -- Serialize against all worker leases before accepting the customer's choice.
 for j in select * from public.receipt_processing_jobs where document_id=d.id and business_id=bid order by id for update loop
  if j.state in('pending','retryable','processing') then raise exception 'Document still processing';end if;
 end loop;
 select * into j from public.receipt_processing_jobs where document_id=d.id and business_id=bid order by created_at desc,id desc limit 1;
 if j.id is null or j.state<>'needs_attention' or j.terminal_reason is distinct from 'DOCUMENT_TYPE_UNCLEAR'
  or d.receipt_id is not null or d.document_class not in('unclassified','unknown')
  or exists(select 1 from public.receipt_source_regions where document_id=d.id)
  or exists(select 1 from public.statement_periods where document_id=d.id)
  or exists(select 1 from public.document_processing_results where document_id=d.id)
 then raise exception 'Document has bookkeeping evidence; use its existing review workflow';end if;
 insert into public.customer_document_dispositions(id,business_id,document_id,actor_user_id,disposition)
 values(p_request,bid,d.id,auth.uid(),'not_for_books');
 -- This intake task is intentionally resolved, not successfully extracted.
 -- The immutable customer disposition preserves the reason and actor.
 update public.receipt_processing_jobs set state='completed',completed_at=now(),lease_id=null,lease_expires_at=null,
  terminal_reason='CUSTOMER_SET_ASIDE',updated_at=now() where document_id=d.id and business_id=bid;
 return true;
end; $$;
revoke all on function public.set_aside_unrecognized_document(uuid,uuid) from public,anon;
grant execute on function public.set_aside_unrecognized_document(uuid,uuid) to authenticated;

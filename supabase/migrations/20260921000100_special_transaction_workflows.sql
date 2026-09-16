-- Customer facts and relationships supplement, never replace, canonical decisions.
create table public.bookkeeping_special_events (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id),
 bookkeeping_record_id uuid not null, decision_id uuid not null references public.bookkeeping_decisions(id),
 action text not null check(action in('merchant_return','reimbursement','refund_link','refund_unlink','loan_payment','owner_use','card_payment','defer')),
 original_record_id uuid, original_decision_id uuid references public.bookkeeping_decisions(id),
 business_amount_cents bigint, request_id uuid not null, actor_user_id uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 unique(business_id,request_id),
 foreign key(bookkeeping_record_id,business_id) references public.bookkeeping_records(id,business_id),
 foreign key(original_record_id,business_id) references public.bookkeeping_records(id,business_id)
);
alter table public.bookkeeping_special_events enable row level security;
create policy special_owner_read on public.bookkeeping_special_events for select to authenticated using(
 exists(select 1 from public.businesses b where b.id=business_id and b.owner_user_id=auth.uid()) and coalesce(auth.jwt()->>'aal','')='aal2');
grant select on public.bookkeeping_special_events to authenticated;
grant all on public.bookkeeping_special_events to service_role;
create trigger special_events_immutable before update or delete on public.bookkeeping_special_events for each row execute function public.reject_compound_reconciliation_mutation();

create function public.record_special_transaction(p_record uuid,p_expected uuid,p_request uuid,p_action text,p_original uuid default null,p_business_cents bigint default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare bid uuid; r public.customer_transaction_work%rowtype; o public.customer_transaction_work%rowtype;
 d public.bookkeeping_decisions%rowtype; prior public.bookkeeping_special_events%rowtype;
 did uuid; cat text; total_business bigint; used bigint; used_business bigint; used_personal bigint; bc bigint; allocations jsonb:='[]'; nature text; treatment text; review text;
begin
 if auth.uid() is null or coalesce(auth.jwt()->>'aal','')<>'aal2' or not public.customer_has_active_membership() then raise exception 'active verified membership required';end if;
 select id into bid from public.businesses where owner_user_id=auth.uid();
 if bid is null or exists(select 1 from public.current_customer_membership where business_id=bid and deletion_status is not null) then raise exception 'business unavailable';end if;
 -- Serialize refund capacities, decisions and idempotent commands within this tenant.
 perform pg_advisory_xact_lock(hashtextextended('special-work:'||bid::text,0));
 select * into prior from public.bookkeeping_special_events where business_id=bid and request_id=p_request;
 if found then
  if prior.bookkeeping_record_id<>p_record or prior.action<>p_action or prior.original_record_id is distinct from p_original or prior.business_amount_cents is distinct from p_business_cents then raise exception 'request already used for a different fact';end if;
  return prior.decision_id;
 end if;
 select * into r from public.customer_transaction_work where record_id=p_record and business_id=bid;
 if not found or r.source_kind<>'financial_transaction' then raise exception 'owned financial activity unavailable';end if;
 select * into d from public.bookkeeping_decisions where id=r.decision_id;
 if d.id is distinct from p_expected then raise exception 'stale transaction; refresh before answering';end if;
 nature:=d.bookkeeping_nature; treatment:=d.treatment;review:=d.review_status;
 if p_action in('merchant_return','reimbursement','refund_unlink') then
  if r.amount_cents<=0 then raise exception 'incoming money required';end if;
  nature:='refund';treatment:='unresolved';review:='needs_review';
 elsif p_action='refund_link' then
  if r.amount_cents<=0 or d.bookkeeping_nature<>'refund' then raise exception 'establish refund first';end if;
  select * into o from public.customer_transaction_work where record_id=p_original and business_id=bid;
  if not found or o.amount_cents>=0 or o.bookkeeping_nature<>'expense' or o.treatment not in('business','mixed_use','personal') or o.activity_date>r.activity_date then raise exception 'eligible original purchase unavailable';end if;
  if extract(year from o.activity_date)<>extract(year from r.activity_date) then raise exception 'This return crosses tax years. Keep it for tax-treatment review; prior-year books will not be rewritten.';end if;
  if (select currency from public.bookkeeping_records where id=p_record)<>(select currency from public.bookkeeping_records where id=p_original) then raise exception 'refund currency mismatch';end if;
  if (select count(distinct tax_category_key) from public.bookkeeping_allocations where bookkeeping_decision_id=o.decision_id and allocation_kind='business')>1 then raise exception 'This purchase has multiple categories. Supporting allocation review is required.';end if;
  select coalesce(-sum(amount_cents),0),min(tax_category_key) into total_business,cat from public.bookkeeping_allocations where bookkeeping_decision_id=o.decision_id and allocation_kind='business';
  select coalesce(sum(w.amount_cents),0),coalesce(sum((select sum(a.amount_cents) from public.bookkeeping_allocations a where a.bookkeeping_decision_id=e.decision_id and a.allocation_kind='business')),0)
  into used,used_business from public.bookkeeping_special_events e join public.customer_transaction_work w on w.record_id=e.bookkeeping_record_id and w.decision_id=e.decision_id
  where e.business_id=bid and e.action='refund_link' and e.original_record_id=p_original and e.bookkeeping_record_id<>p_record;
  used_personal:=used-used_business;
  if used+r.amount_cents>abs(o.amount_cents) then raise exception 'Returns would exceed the original purchase. Review the supporting records.';end if;
  if o.treatment='business' then bc:=r.amount_cents;
  elsif o.treatment='personal' then bc:=0;
  else
   if p_business_cents is null or p_business_cents<0 or p_business_cents>r.amount_cents then raise exception 'Tell Betti how much of this return was for the business portion.';end if;
   bc:=p_business_cents;
  end if;
  if used_business+bc>total_business or used_personal+r.amount_cents-bc>abs(o.amount_cents)-total_business then raise exception 'Return allocation exceeds the original business or personal portion.';end if;
  if bc>0 then allocations:=allocations||jsonb_build_array(jsonb_build_object('kind','business','amount_cents',bc,'tax_category_key',cat));end if;
  if bc<r.amount_cents then allocations:=allocations||jsonb_build_array(jsonb_build_object('kind','personal','amount_cents',r.amount_cents-bc));end if;
  nature:='refund';treatment:=case when bc=0 then 'personal' when bc=r.amount_cents then 'business' else 'mixed_use' end;review:='resolved';
 elsif p_action='owner_use' then
  if r.amount_cents>=0 then raise exception 'outgoing personal use required';end if;
  nature:='transfer';treatment:='personal';review:='resolved';allocations:=jsonb_build_array(jsonb_build_object('kind','personal','amount_cents',r.amount_cents));
 elsif p_action='card_payment' then
  nature:='credit_card_payment';treatment:='excluded';review:='resolved';allocations:=jsonb_build_array(jsonb_build_object('kind','excluded','amount_cents',r.amount_cents));
 elsif p_action='loan_payment' then
  if r.amount_cents>=0 then raise exception 'outgoing loan payment required';end if;
  nature:='loan_principal_payment';treatment:='unresolved';review:='needs_review';
 elsif p_action='defer' then
  insert into public.bookkeeping_special_events(business_id,bookkeeping_record_id,decision_id,action,request_id,actor_user_id) values(bid,p_record,d.id,p_action,p_request,auth.uid());return d.id;
 else raise exception 'unsupported factual action';end if;
 did:=public.append_bookkeeping_decision(bid,p_record,d.id,nature,treatment,review,'user',null,
 'Customer supplied special-transaction facts: '||p_action,d.business_purpose,allocations);
 insert into public.bookkeeping_special_events(business_id,bookkeeping_record_id,decision_id,action,original_record_id,original_decision_id,business_amount_cents,request_id,actor_user_id)
 values(bid,p_record,did,p_action,p_original,case when p_action='refund_link' then o.decision_id end,p_business_cents,p_request,auth.uid());
 return did;
end; $$;
revoke all on function public.record_special_transaction(uuid,uuid,uuid,text,uuid,bigint) from public,anon;
grant execute on function public.record_special_transaction(uuid,uuid,uuid,text,uuid,bigint) to authenticated;

-- A corrected original invalidates dependent refund allocations, not its financial evidence.
create function public.invalidate_refund_on_purchase_correction() returns trigger language plpgsql security definer set search_path='' as $$
declare e record;
begin
 if new.supersedes_decision_id is null then return new;end if;
 for e in select s.*,w.decision_id as current_id from public.bookkeeping_special_events s
 join public.customer_transaction_work w on w.record_id=s.bookkeeping_record_id and w.decision_id=s.decision_id
 where s.original_record_id=new.bookkeeping_record_id and s.original_decision_id=new.supersedes_decision_id and s.action='refund_link'
 loop
  perform public.append_bookkeeping_decision(e.business_id,e.bookkeeping_record_id,e.current_id,'refund','unresolved','needs_review','system',null,
   'The original purchase changed. Confirm the return allocation again.',null,'[]');
 end loop;return new;
end;$$;
create trigger refund_purchase_dependency after insert on public.bookkeeping_decisions for each row execute function public.invalidate_refund_on_purchase_correction();

create table public.bookkeeping_supporting_documents (
 business_id uuid not null references public.businesses(id),document_id uuid not null references public.business_documents(id),
 bookkeeping_record_id uuid not null, actor_user_id uuid not null references auth.users(id), created_at timestamptz not null default now(),
 primary key(document_id,bookkeeping_record_id),foreign key(bookkeeping_record_id,business_id) references public.bookkeeping_records(id,business_id)
);
alter table public.bookkeeping_supporting_documents enable row level security;
create policy supporting_document_owner on public.bookkeeping_supporting_documents for select to authenticated using(exists(select 1 from public.businesses b where b.id=business_id and b.owner_user_id=auth.uid()) and coalesce(auth.jwt()->>'aal','')='aal2');
grant select on public.bookkeeping_supporting_documents to authenticated;grant all on public.bookkeeping_supporting_documents to service_role;
create trigger supporting_documents_immutable before update or delete on public.bookkeeping_supporting_documents for each row execute function public.reject_compound_reconciliation_mutation();
create function public.register_transaction_document(p_id uuid,p_fingerprint text,p_name text,p_mime text,p_bytes integer,p_record uuid)
returns public.business_documents language plpgsql security definer set search_path='' as $$
declare bid uuid;doc public.business_documents%rowtype;
begin
 if auth.uid() is null or coalesce(auth.jwt()->>'aal','')<>'aal2' or not public.customer_has_active_membership() then raise exception 'verified active membership required';end if;
 select id into bid from public.businesses where owner_user_id=auth.uid();
 if not exists(select 1 from public.bookkeeping_records where id=p_record and business_id=bid) then raise exception 'owned transaction unavailable';end if;
 doc:=public.register_customer_document(p_id,p_fingerprint,p_name,p_mime,p_bytes);
 insert into public.bookkeeping_supporting_documents(business_id,document_id,bookkeeping_record_id,actor_user_id) values(bid,doc.id,p_record,auth.uid()) on conflict do nothing;
 return doc;
end;$$;
revoke all on function public.register_transaction_document(uuid,text,text,text,integer,uuid) from public,anon;
grant execute on function public.register_transaction_document(uuid,text,text,text,integer,uuid) to authenticated;

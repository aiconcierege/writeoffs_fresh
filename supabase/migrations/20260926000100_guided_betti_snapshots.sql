-- Scoped, append-only customer reviews. These orchestrate existing commands;
-- they do not establish bookkeeping or tax policy and never run during GET.
create table public.betti_guided_assertions (
 id uuid primary key, business_id uuid not null references public.businesses(id),
 actor_user_id uuid not null, action text not null check(action in
 ('personal_exception_sweep','mixed_use_sweep','receipt_upload_sweep','receipt_availability')),
 disposition text not null check(disposition in ('completed','deferred')),
 items jsonb not null check(jsonb_typeof(items)='array' and jsonb_array_length(items) between 1 and 8),
 answers jsonb not null, result jsonb not null, created_at timestamptz not null default now(),
 deferred_until timestamptz
);
alter table public.betti_guided_assertions enable row level security;
revoke all on public.betti_guided_assertions from anon,authenticated;
grant select on public.betti_guided_assertions to authenticated;
grant all on public.betti_guided_assertions to service_role;
create policy betti_guided_owner on public.betti_guided_assertions for select to authenticated
 using(exists(select 1 from public.businesses b where b.id=business_id and b.owner_user_id=auth.uid()) and auth.jwt()->>'aal'='aal2');
create trigger betti_guided_immutable before update or delete on public.betti_guided_assertions
 for each row execute function public.reject_canonical_bookkeeping_mutation();

-- The snapshot changes on decision, evidence, account-use or authorized-scope changes.
create function public.guided_purchase_version(p_record uuid) returns text
language sql stable security definer set search_path='' as $$
 select md5(jsonb_build_array(w.decision_id,w.has_receipt,w.receipt_unavailable,
   public.current_bookkeeping_evidence_fingerprint(w.business_id,w.record_id),u.id,b.catch_up_start_date,
   public.customer_coverage_start(b.id))::text)
 from public.customer_transaction_work w join public.businesses b on b.id=w.business_id
 left join public.current_financial_account_use u on u.financial_account_id=w.account_id and u.business_id=w.business_id
 where w.record_id=p_record and b.owner_user_id=auth.uid() and auth.jwt()->>'aal'='aal2';
$$;
revoke all on function public.guided_purchase_version(uuid) from public,anon;
grant execute on function public.guided_purchase_version(uuid) to authenticated;

alter function public.read_betti_work_context(uuid) rename to read_betti_work_context_before_guided;
revoke all on function public.read_betti_work_context_before_guided(uuid) from authenticated;
create function public.read_betti_work_context(p_business_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb; begin
 result:=public.read_betti_work_context_before_guided(p_business_id); -- owner + MFA boundary
 result:=jsonb_set(result,'{records}',coalesce((select jsonb_agg(r || jsonb_build_object(
  'merchant',w.merchant,'transaction_id',w.transaction_id,'review_version',public.guided_purchase_version(w.record_id),
  'customer_authored',exists(select 1 from public.bookkeeping_decisions d where d.bookkeeping_record_id=w.record_id and d.actor_user_id is not null)))
  from jsonb_array_elements(result->'records') r left join public.customer_transaction_work w
  on w.record_id=(r->>'record_id')::uuid and w.business_id=p_business_id),'[]'));
 result:=jsonb_set(result,'{accounts}',coalesce((select jsonb_agg(a || jsonb_build_object('display_name',f.display_name,'mask',f.mask_last_four))
  from jsonb_array_elements(result->'accounts') a join public.financial_accounts f on f.id=(a->>'id')::uuid and f.business_id=p_business_id),'[]'));
 return result || jsonb_build_object('guidedReviews',coalesce((select jsonb_agg(to_jsonb(g) order by g.created_at,g.id)
  from public.betti_guided_assertions g where g.business_id=p_business_id),'[]'));
end;$$;
revoke all on function public.read_betti_work_context(uuid) from public,anon;
grant execute on function public.read_betti_work_context(uuid) to authenticated;

create function public.answer_betti_guided_work(p_request uuid,p_action text,p_disposition text,p_items jsonb,p_answers jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare bid uuid:=public.require_customer_setup_owner(); prior public.betti_guided_assertions%rowtype;
 item jsonb; answer jsonb; w public.customer_transaction_work%rowtype; account_use public.current_financial_account_use%rowtype;
 result jsonb:='[]'; selected_use text; business_cents bigint; receipt_items jsonb:='[]';
begin
 if p_request is null or p_action not in ('personal_exception_sweep','mixed_use_sweep','receipt_upload_sweep','receipt_availability')
 or p_disposition not in ('completed','deferred') or jsonb_typeof(p_items) is distinct from 'array'
 or jsonb_array_length(p_items) not between 1 and 8 or jsonb_typeof(p_answers) is distinct from 'object'
 or (select count(distinct i->>'recordId') from jsonb_array_elements(p_items) i)<>jsonb_array_length(p_items)
 then raise exception 'Invalid guided snapshot';end if;
 perform pg_advisory_xact_lock(hashtextextended('betti-guided:'||bid::text,0));
 select * into prior from public.betti_guided_assertions where id=p_request and business_id=bid;
 if found then
  if prior.action<>p_action or prior.disposition<>p_disposition or prior.items<>p_items or prior.answers<>p_answers then raise exception 'Retry changed';end if;
  return prior.result;
 end if;
 if exists(select 1 from jsonb_object_keys(p_answers) k where not exists(select 1 from jsonb_array_elements(p_items) i where i->>'recordId'=k)) then raise exception 'Unseen purchase';end if;
 for item in select value from jsonb_array_elements(p_items) order by value->>'recordId' loop
  perform pg_advisory_xact_lock(hashtextextended('bookkeeping-record:'||(item->>'recordId'),0));
  perform pg_advisory_xact_lock(hashtextextended(item->>'recordId',41));
  select * into w from public.customer_transaction_work where business_id=bid and record_id=(item->>'recordId')::uuid;
  if not found or w.decision_id is distinct from (item->>'decisionId')::uuid
   or public.guided_purchase_version(w.record_id) is distinct from item->>'reviewVersion'
   or w.source_kind<>'financial_transaction' or w.amount_cents>=0 or w.bookkeeping_nature<>'expense'
   or w.treatment in ('personal','excluded') then raise exception 'Stale or unavailable purchase';end if;
  select * into account_use from public.current_financial_account_use where business_id=bid and financial_account_id=w.account_id;
  if account_use.id is distinct from (item->>'accountUseVersion')::uuid or account_use.id is null then raise exception 'Account use changed';end if;
  if exists(select 1 from public.bookkeeping_processing_jobs j where j.business_id=bid and j.bookkeeping_record_id=w.record_id and j.state in ('pending','processing','retryable'))
   then raise exception 'Betti is still assessing this purchase';end if;
  if p_action in ('receipt_upload_sweep','receipt_availability') and (w.has_receipt or w.receipt_unavailable or w.treatment not in ('business','mixed_use')) then raise exception 'Receipt group changed';end if;
  if p_action='receipt_availability' and exists(select 1 from public.receipt_processing_jobs j where j.business_id=bid and j.state in ('pending','processing','retryable')) then raise exception 'Documents are still processing';end if;
  if p_action='personal_exception_sweep' and account_use.designation<>'business_only' then raise exception 'Account prerequisite changed';end if;
  if p_action in ('personal_exception_sweep','mixed_use_sweep') and
    (select count(distinct tax_category_key) from public.bookkeeping_allocations where bookkeeping_decision_id=w.decision_id and allocation_kind='business')>1 then raise exception 'Use the existing split correction workflow';end if;
 end loop;
 if p_disposition='completed' then
 for item in select value from jsonb_array_elements(p_items) order by value->>'recordId' loop
  select * into w from public.customer_transaction_work where business_id=bid and record_id=(item->>'recordId')::uuid;
  select * into account_use from public.current_financial_account_use where business_id=bid and financial_account_id=w.account_id;
  answer:=p_answers->(w.record_id::text);selected_use:=answer->>'use';
  if p_action='personal_exception_sweep' and answer is not null and selected_use is distinct from 'personal' then raise exception 'Choose personal exceptions only';end if;
  if p_action='mixed_use_sweep' and account_use.designation='business_and_personal' and selected_use is null then raise exception 'Choose the use of each displayed purchase';end if;
  if p_action='mixed_use_sweep' and selected_use is not null and selected_use not in ('business','personal','mixed') then raise exception 'Invalid use';end if;
  if p_action in ('personal_exception_sweep','mixed_use_sweep') and selected_use is not null then
   if selected_use='personal' then
    perform public.correct_imported_transaction_personal_scope(w.transaction_id,w.decision_id,gen_random_uuid(),'personal');
   else
    if selected_use='mixed' then
     if jsonb_typeof(answer->'businessCents')<>'number' or (answer->>'businessCents')!~'^[0-9]+$' then raise exception 'Business dollars must be exact cents';end if;
     business_cents:=(answer->>'businessCents')::bigint;
     if business_cents<=0 or business_cents>=abs(w.amount_cents) then raise exception 'Business amount must be part of the total';end if;
    end if;
    perform public.correct_bookkeeping_transaction_use(w.transaction_id,w.decision_id,gen_random_uuid(),
     case when selected_use='mixed' then jsonb_build_object('schemaVersion',1,'use','mixed','personalAmountCents',abs(w.amount_cents)-business_cents)
     else '{"schemaVersion":1,"use":"business"}'::jsonb end);
   end if;
   perform public.request_bookkeeping_processing(bid,w.record_id,'guided_customer_fact',p_request::text);
  end if;
  if p_action='receipt_availability' then receipt_items:=receipt_items||jsonb_build_array(jsonb_build_object('recordId',w.record_id,'decisionId',w.decision_id));end if;
  result:=result||jsonb_build_array(jsonb_build_object('recordId',w.record_id,'recorded',true));
 end loop;
 if p_action='receipt_availability' then perform public.apply_guided_review(p_request,'receipt_unavailable','receipts',receipt_items);end if;
 end if;
 insert into public.betti_guided_assertions(id,business_id,actor_user_id,action,disposition,items,answers,result,deferred_until)
 values(p_request,bid,auth.uid(),p_action,p_disposition,p_items,p_answers,result,case when p_disposition='deferred' then now()+interval '1 day' end);
 return result;
end;$$;
revoke all on function public.answer_betti_guided_work(uuid,text,text,jsonb,jsonb) from public,anon;
grant execute on function public.answer_betti_guided_work(uuid,text,text,jsonb,jsonb) to authenticated;

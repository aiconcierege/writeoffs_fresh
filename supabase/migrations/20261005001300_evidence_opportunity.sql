-- Reuse the existing tenant-scoped immutable orchestration history. This is an
-- upload opportunity, never an answer to a bookkeeping fact or a receipt match.
alter table public.betti_guided_assertions drop constraint betti_guided_assertions_action_check;
alter table public.betti_guided_assertions add constraint betti_guided_assertions_action_check
 check(action in ('personal_exception_sweep','mixed_use_sweep','receipt_upload_sweep','receipt_availability','evidence_opportunity'));
alter table public.betti_guided_assertions drop constraint betti_guided_assertions_items_check;
alter table public.betti_guided_assertions add constraint betti_guided_assertions_items_check
 check(jsonb_typeof(items)='array' and jsonb_array_length(items) between 1 and
  case when action in ('personal_exception_sweep','evidence_opportunity') then 100 else 8 end);

create function public.answer_betti_evidence_opportunity(p_request uuid,p_items jsonb,p_response text,p_document_ids uuid[] default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare bid uuid:=public.require_customer_setup_owner(); prior public.betti_guided_assertions%rowtype;
 item jsonb; w public.customer_transaction_work%rowtype; account_id uuid; month text;
 payload jsonb; receipt_items jsonb:='[]'; result jsonb;
begin
 if p_request is null or p_response is null or p_response not in ('provided','none','later')
  or jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 100
  or (select count(distinct i->>'recordId') from jsonb_array_elements(p_items) i)<>jsonb_array_length(p_items)
  or p_document_ids is null or cardinality(p_document_ids)>10
  or (p_response='provided') is distinct from (cardinality(p_document_ids)>0)
 then raise exception 'Invalid evidence opportunity'; end if;
 perform pg_advisory_xact_lock(hashtextextended('betti-guided:'||bid::text,0));
 select * into prior from public.betti_guided_assertions where id=p_request and business_id=bid;
 if found then
  if prior.action<>'evidence_opportunity' or prior.items<>p_items or prior.answers->>'response'<>p_response
   or prior.answers->'documentIds'<>to_jsonb(p_document_ids) then raise exception 'Retry changed'; end if;
  return prior.result;
 end if;
 if exists(select 1 from unnest(p_document_ids) d where not exists(
  select 1 from public.business_documents b where b.id=d and b.business_id=bid))
 then raise exception 'Document unavailable'; end if;
 for item in select value from jsonb_array_elements(p_items) order by value->>'recordId' loop
  perform pg_advisory_xact_lock(hashtextextended('bookkeeping-record:'||(item->>'recordId'),0));
  perform pg_advisory_xact_lock(hashtextextended(item->>'recordId',41));
  select * into w from public.customer_transaction_work where business_id=bid and record_id=(item->>'recordId')::uuid;
  if not found or w.source_kind<>'financial_transaction' or w.account_id is null
   or w.activity_date::text is distinct from item->>'date'
   or w.amount_cents is distinct from (item->>'amountCents')::bigint
   or w.transaction_id is distinct from (item->>'transactionId')::uuid
  then raise exception 'Evidence opportunity unavailable'; end if;
  if account_id is null then account_id:=w.account_id; month:=to_char(w.activity_date,'YYYY-MM'); end if;
  if w.account_id<>account_id or to_char(w.activity_date,'YYYY-MM')<>month then raise exception 'Mixed evidence periods'; end if;
  -- Upload may already have changed the current assessment. It records only an
  -- opportunity acknowledgment; none/later still require the displayed snapshot.
  if p_response<>'provided' and (
   w.decision_id is distinct from (item->>'decisionId')::uuid
   or public.guided_purchase_version(w.record_id) is distinct from item->>'reviewVersion'
   or not public.purchase_receipt_eligible(w.amount_cents,w.bookkeeping_nature,w.treatment)
   or w.has_receipt or w.receipt_unavailable
   or not exists(select 1 from public.current_financial_account_use u where u.business_id=bid
     and u.financial_account_id=w.account_id and u.id=(item->>'accountUseVersion')::uuid)
  ) then raise exception 'Evidence opportunity changed'; end if;
  receipt_items:=receipt_items||jsonb_build_array(jsonb_build_object('recordId',w.record_id,'decisionId',w.decision_id));
 end loop;
 if exists(select 1 from public.betti_guided_assertions g where g.business_id=bid and g.action='evidence_opportunity'
  and g.answers->>'accountId'=account_id::text and g.answers->>'month'=month)
 then raise exception 'Evidence opportunity already recorded'; end if;
 if p_response='none' then
  perform public.apply_guided_review(p_request,'receipt_unavailable','receipts',receipt_items);
 end if;
 payload:=jsonb_build_object('response',p_response,'accountId',account_id,'month',month,'documentIds',to_jsonb(p_document_ids));
 result:=jsonb_build_object('recorded',true,'response',p_response);
 insert into public.betti_guided_assertions(id,business_id,actor_user_id,action,disposition,items,answers,result)
 values(p_request,bid,auth.uid(),'evidence_opportunity',case when p_response='later' then 'deferred' else 'completed' end,p_items,payload,result);
 return result;
end; $$;
revoke all on function public.answer_betti_evidence_opportunity(uuid,jsonb,text,uuid[]) from public,anon;
grant execute on function public.answer_betti_evidence_opportunity(uuid,jsonb,text,uuid[]) to authenticated;

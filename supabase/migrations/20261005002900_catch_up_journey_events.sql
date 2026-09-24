-- Customer journey history is independent of immutable financial source facts.
create table public.betti_catch_up_events (
 id uuid primary key,
 business_id uuid not null references public.businesses(id) on delete cascade,
 actor_user_id uuid not null,
 scope_key text not null check(scope_key ~ '^[a-f0-9]{64}$'),
 scope_from date not null,
 scope_through date not null check(scope_through>=scope_from),
 stage text not null check(stage in ('statements','receipts','personal','nonexpense')),
 response text not null check(response in ('continue','later','none','uploaded','reviewed')),
 items jsonb not null check(jsonb_typeof(items)='array' and jsonb_array_length(items)<=20),
 selected_ids uuid[] not null default '{}',
 document_ids uuid[] not null default '{}',
 result jsonb not null,
 created_at timestamptz not null default now()
);
create index betti_catch_up_business_scope on public.betti_catch_up_events(business_id,scope_key,created_at,id);
alter table public.betti_catch_up_events enable row level security;
revoke all on public.betti_catch_up_events from public,anon,authenticated;
grant select on public.betti_catch_up_events to authenticated;
grant all on public.betti_catch_up_events to service_role;
create policy catch_up_owner on public.betti_catch_up_events for select to authenticated
 using(exists(select 1 from public.businesses b where b.id=business_id and b.owner_user_id=auth.uid()) and auth.jwt()->>'aal'='aal2');
create trigger catch_up_immutable before update or delete on public.betti_catch_up_events
 for each row execute function public.reject_canonical_bookkeeping_mutation();

create function public.answer_catch_up_stage(p_request uuid,p_scope_key text,p_from date,p_through date,
 p_stage text,p_response text,p_items jsonb,p_selected uuid[],p_documents uuid[])
returns jsonb language plpgsql security definer set search_path='' as $$
declare bid uuid:=public.require_customer_setup_owner(); old public.betti_catch_up_events%rowtype;
 scope jsonb; item jsonb; w public.customer_transaction_work%rowtype; decision uuid; result jsonb;
begin
 if p_request is null or p_scope_key is null or p_scope_key!~'^[a-f0-9]{64}$'
  or p_stage is null or p_stage not in ('statements','receipts','personal','nonexpense')
  or p_response is null or p_response not in ('continue','later','none','uploaded','reviewed')
  or jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items)>20
  or p_selected is null or p_documents is null or cardinality(p_documents)>10
  or (p_stage in ('personal','nonexpense') and (p_response not in ('reviewed','later') or jsonb_array_length(p_items)=0))
  or (p_stage in ('statements','receipts') and (p_response='reviewed' or jsonb_array_length(p_items)<>0))
  or (p_response='uploaded') is distinct from (cardinality(p_documents)>0)
  or (p_response<>'reviewed' and cardinality(p_selected)>0)
  or (select count(distinct i->>'recordId') from jsonb_array_elements(p_items)i)<>jsonb_array_length(p_items)
  or exists(select 1 from unnest(p_selected)s where not exists(select 1 from jsonb_array_elements(p_items)i where i->>'recordId'=s::text))
 then raise exception 'Invalid catch-up response'; end if;
 perform pg_advisory_xact_lock(hashtextextended('catch-up-journey:'||bid::text,0));
 select * into old from public.betti_catch_up_events where id=p_request and business_id=bid;
 if found then
  if old.scope_key<>p_scope_key or old.scope_from<>p_from or old.scope_through<>p_through
   or old.stage<>p_stage or old.response<>p_response or old.items<>p_items
   or old.selected_ids<>p_selected or old.document_ids<>p_documents then raise exception 'Retry changed';end if;
  return old.result;
 end if;
 scope:=public.read_authorized_bookkeeping_scope(bid);
 if not coalesce((scope->>'historicalAuthorized')::boolean,false)
  or p_from is distinct from (scope->>'authorizedStart')::date
  or p_through is distinct from ((scope->>'includedStart')::date-1)
 then raise exception 'Catch-up coverage changed';end if;
 if exists(select 1 from unnest(p_documents)d where not exists(select 1 from public.business_documents b where b.id=d and b.business_id=bid))
 then raise exception 'Document unavailable';end if;
 if p_response in ('reviewed','continue','none') and exists(
  select 1 from public.receipt_processing_jobs j where j.business_id=bid and j.state in ('pending','processing','retryable'))
 then raise exception 'Evidence is still processing';end if;
 for item in select value from jsonb_array_elements(p_items) order by value->>'recordId' loop
  perform pg_advisory_xact_lock(hashtextextended('bookkeeping-record:'||(item->>'recordId'),0));
  perform pg_advisory_xact_lock(hashtextextended(item->>'recordId',41));
  select * into w from public.customer_transaction_work where business_id=bid and record_id=(item->>'recordId')::uuid;
  if not found or w.source_kind<>'financial_transaction' or w.activity_date not between p_from and p_through
   or w.decision_id is distinct from (item->>'decisionId')::uuid
   or public.guided_purchase_version_from_row(w) is distinct from item->>'reviewVersion'
   or not coalesce((w.bookkeeping_nature='expense' and w.treatment in ('business','mixed_use'))
     or (p_stage='personal' and w.bookkeeping_nature is null and w.treatment='unresolved'),false)
   or w.amount_cents>=0 or exists(select 1 from public.bookkeeping_processing_jobs j where j.business_id=bid
    and j.bookkeeping_record_id=w.record_id and j.state in ('pending','processing','retryable'))
  then raise exception 'Catch-up purchase changed';end if;
  if not exists(select 1 from public.current_financial_account_use u where u.business_id=bid
   and u.financial_account_id=w.account_id and u.id=(item->>'accountUseVersion')::uuid
   and (p_stage<>'personal' or u.designation='business_only')) then raise exception 'Account use changed';end if;
 end loop;
 if p_response='reviewed' then
  for item in select value from jsonb_array_elements(p_items) where (value->>'recordId')::uuid=any(p_selected) order by value->>'recordId' loop
   select * into w from public.customer_transaction_work where business_id=bid and record_id=(item->>'recordId')::uuid;
   if p_stage='personal' then
    perform public.correct_imported_transaction_personal_scope(w.transaction_id,w.decision_id,gen_random_uuid(),'personal');
   else
    -- The customer disputes an expense. Do not invent its economic nature.
    -- The canonical worker asks the smallest activity question next.
    decision:=public.append_bookkeeping_decision(p_business_id=>bid,p_bookkeeping_record_id=>w.record_id,
     p_expected_current_decision_id=>w.decision_id,p_bookkeeping_nature=>null,p_treatment=>'unresolved',
     p_review_status=>'needs_review',p_provenance=>'user',p_confidence=>null,
     p_reason=>'Customer says this was not an expense for this business; actual activity remains unknown.',
     p_business_purpose=>null,p_allocations=>'[]'::jsonb);
    perform public.open_bookkeeping_review_issue_v2(bid,w.record_id,decision,'TRANSACTION_TYPE_UNCLEAR',
     'catch-up-exception:'||w.record_id::text||':'||decision::text,
     md5(decision::text||':customer-disputed-expense'),
     jsonb_build_object('schemaVersion',1,'reason','TRANSACTION_TYPE_UNCLEAR','factType','economic_nature'));
   end if;
   perform public.request_bookkeeping_processing(bid,w.record_id,'deterministic_evaluation',
    'bookkeeping-evaluator:v2:record:'||w.record_id::text||':catch-up:'||p_request::text);
  end loop;
 end if;
 result:=jsonb_build_object('recorded',true,'stage',p_stage,'response',p_response);
 insert into public.betti_catch_up_events(id,business_id,actor_user_id,scope_key,scope_from,scope_through,stage,response,items,selected_ids,document_ids,result)
 values(p_request,bid,auth.uid(),p_scope_key,p_from,p_through,p_stage,p_response,p_items,p_selected,p_documents,result);
 perform public.invalidate_betti_action_index(bid);
 return result;
end;$$;
revoke all on function public.answer_catch_up_stage(uuid,text,date,date,text,text,jsonb,uuid[],uuid[]) from public,anon;
grant execute on function public.answer_catch_up_stage(uuid,text,date,date,text,text,jsonb,uuid[],uuid[]) to authenticated;

alter function public.read_betti_work_context(uuid) rename to read_betti_work_context_before_catch_up_v2;
revoke all on function public.read_betti_work_context_before_catch_up_v2(uuid) from public,anon,authenticated;
create function public.read_betti_work_context(p_business_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 result:=public.read_betti_work_context_before_catch_up_v2(p_business_id);
 return result||jsonb_build_object('catchUpEvents',coalesce((select jsonb_agg(to_jsonb(e) order by e.created_at,e.id)
  from public.betti_catch_up_events e where e.business_id=p_business_id),'[]'));
end;$$;
revoke all on function public.read_betti_work_context(uuid) from public,anon;
grant execute on function public.read_betti_work_context(uuid) to authenticated;

-- An old action publication cannot serve V2, and a historical stage cannot remain
-- usable after any affected record changes. Existing fast-path safeguards remain.
do $$ declare original text; updated text; signature text; begin
 foreach signature in array array[
  'public.read_betti_action_index(uuid,uuid,text,boolean)',
  'public.execute_betti_indexed_question(uuid,uuid,uuid,text,jsonb,uuid,boolean)'
 ] loop
  original:=pg_get_functiondef(signature::regprocedure);
  updated:=replace(original,'betti-action-index:v6-initial-evidence-batches','betti-action-index:v7-catch-up-journey');
  if updated=original then raise exception 'Expected index version missing';end if;
  if signature='public.read_betti_action_index(uuid,uuid,text,boolean)' then
   updated:=replace(updated,'''evidence_opportunity''','''evidence_opportunity'',''catch_up_journey''');
   updated:=replace(updated,'''actionableCount'',jsonb_array_length(ready)',
    '''substantiveCount'',(select count(*) from jsonb_array_elements(ready)a where a->>''substantiveQuestion''=''true''),''actionableCount'',jsonb_array_length(ready)');
  end if;
  execute updated;
 end loop;
end;$$;

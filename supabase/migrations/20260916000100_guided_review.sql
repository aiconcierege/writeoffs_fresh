-- Guided review is a projection and explicit customer assertions, never invented evidence.
create function public.bookkeeping_activity_day(p_business_id uuid, p_as_of timestamptz default now())
returns date language sql stable security definer set search_path='' as $$
 select (p_as_of at time zone coalesce(
  (select s.timezone_name from public.business_customer_setup s join pg_timezone_names z on z.name=s.timezone_name where s.business_id=p_business_id),
  (select c.timezone_name from public.current_business_review_cadence c join pg_timezone_names z on z.name=c.timezone_name where c.business_id=p_business_id),'UTC'))::date;
$$;
revoke all on function public.bookkeeping_activity_day(uuid,timestamptz) from public,anon;
grant execute on function public.bookkeeping_activity_day(uuid,timestamptz) to authenticated,service_role;

-- Retain the original evidence/current-leaf gate for readiness. No event is answered or resolved.
alter function public.list_current_askable_bookkeeping_question_event_ids(timestamptz)
 rename to list_current_evidence_question_event_ids;
create function public.bookkeeping_question_is_historical_documentation(p_reason text,p_context jsonb,p_date date,p_today date)
returns boolean language sql immutable set search_path='' as $$
 select coalesce(p_today-p_date>30 and p_reason='BUSINESS_PURPOSE_NEEDED'
 and p_context->>'factType' in ('meal_attendee_relationship','receipt_meal_business_purpose','receipt_meal_candidate'),false);
$$;
create function public.list_current_askable_bookkeeping_question_event_ids(p_as_of timestamptz default now())
returns table(event_id uuid) language sql stable security definer set search_path='' as $$
 select e.id from public.list_current_evidence_question_event_ids(p_as_of) eligible
 join public.bookkeeping_review_events e on e.id=eligible.event_id
 join public.bookkeeping_records r on r.id=e.bookkeeping_record_id
 where not public.bookkeeping_question_is_historical_documentation(e.reason,e.question_context,r.occurred_on,public.bookkeeping_activity_day(e.business_id,p_as_of));
$$;
revoke all on function public.list_current_askable_bookkeeping_question_event_ids(timestamptz) from public,anon;
grant execute on function public.list_current_askable_bookkeeping_question_event_ids(timestamptz) to authenticated;

create table public.bookkeeping_guided_review_batches (
 id uuid primary key, business_id uuid not null references public.businesses(id) on delete cascade,
 actor_user_id uuid not null, action text not null check(action in ('remove_business','receipt_unavailable','reviewed')),
 scope text not null check(scope in ('all','receipts','historical','review')),
 items jsonb not null check(jsonb_typeof(items)='array' and jsonb_array_length(items) between 1 and 100),
 result jsonb not null, created_at timestamptz not null default now(), unique(business_id,id)
);
alter table public.bookkeeping_guided_review_batches enable row level security;
grant select on public.bookkeeping_guided_review_batches to authenticated;
grant all on public.bookkeeping_guided_review_batches to service_role;
create policy guided_review_owner on public.bookkeeping_guided_review_batches for select to authenticated
 using(exists(select 1 from public.businesses b where b.id=business_id and b.owner_user_id=auth.uid()) and coalesce(auth.jwt()->>'aal','')='aal2');
create trigger guided_review_immutable before update or delete on public.bookkeeping_guided_review_batches for each row execute function public.reject_canonical_bookkeeping_mutation();

-- Small server-side index. The application hydrates only the selected page through its
-- existing canonical detail read model; it never sends all history to the browser.
create view public.customer_transaction_work with(security_invoker=true) as
select r.business_id,r.id as record_id,coalesce(f.id,r.id) as transaction_id,r.occurred_on as activity_date,
 coalesce(f.merchant_name,f.original_description,x.merchant,m.counterparty_name,'Receipt purchase') as merchant,
 coalesce(f.original_description,m.description,'') as description,r.amount_cents,r.currency,
 d.id as decision_id,d.treatment,d.bookkeeping_nature,r.source_kind,
 f.financial_account_id as account_id,
 (select min(a.tax_category_key) from public.bookkeeping_allocations a where a.bookkeeping_decision_id=d.id and a.allocation_kind='business') as category_key,
 exists(select 1 from public.bookkeeping_document_links l where l.bookkeeping_record_id=r.id and l.revoked_at is null) as has_receipt,
 exists(select 1 from public.bookkeeping_documentation_events e join public.bookkeeping_documentation_events prev on prev.id=e.supersedes_event_id
   where e.bookkeeping_record_id=r.id and e.event_type='resolved' and prev.event_type='receipt_lost'
    and not exists(select 1 from public.bookkeeping_documentation_events n where n.supersedes_event_id=e.id)) as receipt_unavailable,
 exists(select 1 from public.bookkeeping_review_events e where e.bookkeeping_record_id=r.id and e.based_on_decision_id=d.id
  and e.event_type in ('opened','reopened','skipped')
  and not exists(select 1 from public.bookkeeping_review_events n where n.supersedes_event_id=e.id)
  and not public.bookkeeping_question_is_historical_documentation(e.reason,e.question_context,r.occurred_on,public.bookkeeping_activity_day(r.business_id))) as needs_fact,
 exists(select 1 from public.bookkeeping_review_events e where e.bookkeeping_record_id=r.id and e.based_on_decision_id=d.id
  and e.event_type in ('opened','reopened','skipped')
  and not exists(select 1 from public.bookkeeping_review_events n where n.supersedes_event_id=e.id)
  and public.bookkeeping_question_is_historical_documentation(e.reason,e.question_context,r.occurred_on,public.bookkeeping_activity_day(r.business_id))) as historical_documentation,
 r.occurred_on < public.bookkeeping_activity_day(r.business_id)-30 as historical,
 exists(select 1 from public.bookkeeping_guided_review_batches b, jsonb_array_elements(b.items) item
  where b.business_id=r.business_id and b.action='reviewed' and b.scope='historical'
   and item->>'recordId'=r.id::text and item->>'decisionId'=d.id::text) as sweep_reviewed
from public.bookkeeping_records r
left join public.bookkeeping_financial_sources s on s.bookkeeping_record_id=r.id and s.revoked_at is null
left join public.financial_transactions f on f.id=s.financial_transaction_id
left join public.current_manual_financial_activity m on m.bookkeeping_record_id=r.id
left join lateral(select e.* from public.bookkeeping_decisions e where e.bookkeeping_record_id=r.id
 and not exists(select 1 from public.bookkeeping_decisions n where n.supersedes_decision_id=e.id) limit 1) d on true
left join lateral(select e.merchant from public.bookkeeping_document_links l join public.bookkeeping_receipt_extractions e on e.receipt_id=l.receipt_id
 where l.bookkeeping_record_id=r.id and l.revoked_at is null order by e.created_at desc limit 1) x on true
where exists(select 1 from public.businesses b where b.id=r.business_id and b.owner_user_id=auth.uid())
 and coalesce(auth.jwt()->>'aal','')='aal2'
 and (f.id is null or not exists(select 1 from public.plaid_transaction_versions v where v.canonical_financial_transaction_id=f.id)
  or exists(select 1 from public.plaid_transaction_versions v where v.canonical_financial_transaction_id=f.id and v.event_type<>'removed'
   and not exists(select 1 from public.plaid_transaction_versions n where n.supersedes_version_id=v.id)))
 and not exists(select 1 from public.current_bookkeeping_record_convergences c where c.absorbed_record_id=r.id)
 and not exists(select 1 from public.current_bookkeeping_source_convergences c where c.absorbed_record_id=r.id)
 and not exists(select 1 from public.current_bookkeeping_compound_components c where c.anchor_bookkeeping_record_id=r.id)
 and not exists(select 1 from public.bookkeeping_receipt_events e where e.bookkeeping_record_id=r.id and e.event_type='discarded'
  and e.context->>'deactivateReceiptOnly'='true' and not exists(select 1 from public.bookkeeping_receipt_events n where n.supersedes_event_id=e.id));
grant select on public.customer_transaction_work to authenticated;

create function public.apply_guided_review(p_request_id uuid,p_action text,p_scope text,p_items jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 bid uuid:=public.require_customer_setup_owner(); prior public.bookkeeping_guided_review_batches%rowtype;
 item jsonb; w public.customer_transaction_work%rowtype; e public.bookkeeping_documentation_events%rowtype;
 result jsonb:='[]'; outcome jsonb; issue uuid; fp text;
begin
 if p_request_id is null or p_action not in ('remove_business','receipt_unavailable','reviewed')
  or p_scope not in ('all','receipts','historical','review') or jsonb_typeof(p_items) is distinct from 'array'
 then raise exception 'invalid guided review'; end if;
 if jsonb_array_length(p_items) not between 1 and 100 or
  (select count(distinct value->>'recordId') from jsonb_array_elements(p_items))<>jsonb_array_length(p_items)
 then raise exception 'select between 1 and 100 distinct purchases'; end if;
 perform pg_advisory_xact_lock(hashtextextended('guided-review:'||bid::text,0));
 select * into prior from public.bookkeeping_guided_review_batches where id=p_request_id and business_id=bid;
 if found then
  if prior.action<>p_action or prior.scope<>p_scope or prior.items<>p_items then raise exception 'retry request changed'; end if;
  return prior.result;
 end if;
 -- Validate every ID and expected version before any change. All mutations share one transaction.
 for item in select value from jsonb_array_elements(p_items) order by value->>'recordId' loop
  if (select count(*) from jsonb_object_keys(item))<>2 then raise exception 'invalid selected purchase'; end if;
  perform pg_advisory_xact_lock(hashtextextended('bookkeeping-record:'||(item->>'recordId'),0));
  perform pg_advisory_xact_lock(hashtextextended(item->>'recordId',41));
  select * into w from public.customer_transaction_work where business_id=bid and record_id=(item->>'recordId')::uuid;
  if not found or w.decision_id is distinct from (item->>'decisionId')::uuid then raise exception 'selected purchase unavailable or changed'; end if;
  if w.source_kind<>'financial_transaction' or w.transaction_id=w.record_id or w.treatment in ('personal','excluded')
   then raise exception 'select current bank-backed business activity'; end if;
  if p_scope='historical' and not w.historical then raise exception 'purchase outside historical scope'; end if;
  if p_action='receipt_unavailable' and (w.amount_cents>=0 or w.has_receipt or w.receipt_unavailable
    or w.bookkeeping_nature not in ('expense','unresolved')) then raise exception 'receipt review changed'; end if;
 end loop;
 for item in select value from jsonb_array_elements(p_items) order by value->>'recordId' loop
  select * into w from public.customer_transaction_work where business_id=bid and record_id=(item->>'recordId')::uuid;
  perform pg_advisory_xact_lock(hashtextextended('bookkeeping-record:'||w.record_id::text,0));
  if p_action='remove_business' then
   outcome:=public.correct_imported_transaction_personal_scope(w.transaction_id,w.decision_id,gen_random_uuid(),'personal');
  elsif p_action='receipt_unavailable' then
   perform pg_advisory_xact_lock(hashtextextended(w.record_id::text,41));
   fp:=public.current_bookkeeping_evidence_fingerprint(bid,w.record_id);
   -- Open a request only from verified current bank evidence, never client facts.
   select * into e from public.bookkeeping_documentation_events event where event.bookkeeping_record_id=w.record_id
    and event.event_type in ('request_opened','reopened','evidence_attached')
    and event.evidence_fingerprint=fp and not exists(select 1 from public.bookkeeping_documentation_events n where n.supersedes_event_id=event.id)
    order by event.created_at desc limit 1;
   if not found then
    issue:=gen_random_uuid();
    insert into public.bookkeeping_documentation_events(id,business_id,bookkeeping_record_id,documentation_issue_id,sequence_number,
     event_type,reason,issue_key,context_fingerprint,evidence_fingerprint,question_context,provenance)
    values(issue,bid,w.record_id,issue,1,'request_opened','MISSING_SUPPORTING_DOCUMENTATION','guided-receipt:'||p_request_id::text,
     md5(w.decision_id::text||':receipt'),fp,'{"schemaVersion":1,"reason":"MISSING_SUPPORTING_DOCUMENTATION","requirement":{"type":"receipt_for_record","version":1}}','system') returning * into e;
   end if;
   outcome:=public.mark_bookkeeping_receipt_lost(e.documentation_issue_id,e.id,e.context_fingerprint,e.evidence_fingerprint,
    '{"schemaVersion":1,"assertion":"receipt_lost"}');
  else outcome:=jsonb_build_object('reviewed',true); end if;
  result:=result||jsonb_build_array(jsonb_build_object('recordId',w.record_id,'previousDecisionId',w.decision_id,
   'result',outcome,'outcome',case when p_action='remove_business' then 'removed'
    when w.needs_fact then 'needs_fact' when w.historical_documentation or w.category_key in ('meals','travel') then 'documentation' else 'recorded' end));
 end loop;
 insert into public.bookkeeping_guided_review_batches(id,business_id,actor_user_id,action,scope,items,result)
 values(p_request_id,bid,auth.uid(),p_action,p_scope,p_items,result);
 return result;
end; $$;
revoke all on function public.apply_guided_review(uuid,text,text,jsonb) from public,anon;
grant execute on function public.apply_guided_review(uuid,text,text,jsonb) to authenticated;

-- Purchase evidence and incoming-money facts are separate domains. No facts are backfilled.
create function public.purchase_receipt_eligible(p_amount bigint,p_nature text,p_treatment text)
returns boolean language sql immutable parallel safe set search_path='' as $$
 select coalesce(p_amount<0 and p_nature='expense' and p_treatment in ('business','mixed_use','unresolved'),false)
$$;
revoke all on function public.purchase_receipt_eligible(bigint,text,text) from public,anon;
grant execute on function public.purchase_receipt_eligible(bigint,text,text) to authenticated,service_role;

-- Bound work queries before hydration. Explicit owner + MFA checks are repeated
-- inside this database boundary; no caller can supply a Business ID.
create or replace function public.list_customer_transaction_work(p_view text default 'all',p_historical boolean default false,
 p_offset integer default 0,p_query text default '',p_start date default null,p_end date default null,
 p_category text default null,p_account uuid default null)
returns setof public.customer_transaction_work language plpgsql stable security definer set search_path='' as $$
declare bid uuid;
begin
 if auth.uid() is null or coalesce(auth.jwt()->>'aal','')<>'aal2' then raise exception 'verified session required';end if;
 select id into bid from public.businesses where owner_user_id=auth.uid();
 if bid is null or p_view not in ('all','receipts','receipt-only','review') or p_offset not between 0 and 100000
  or length(coalesce(p_query,''))>100 then raise exception 'invalid work scope';end if;
 return query select w.* from public.customer_transaction_work w where w.business_id=bid
  and (p_view<>'receipts' or (public.purchase_receipt_eligible(w.amount_cents,w.bookkeeping_nature,w.treatment) and not w.has_receipt and not w.receipt_unavailable
    and w.source_kind='financial_transaction'))
  and (p_view<>'receipt-only' or (w.has_receipt and w.account_id is null and w.source_kind<>'legacy'))
  and (p_view<>'review' or (w.needs_fact and w.treatment not in ('personal','excluded')))
  and (not p_historical or (w.historical and not w.sweep_reviewed and w.source_kind='financial_transaction' and w.treatment not in ('personal','excluded')))
  and (coalesce(p_query,'')='' or strpos(lower(w.merchant||' '||w.description),lower(p_query))>0)
  and (p_start is null or w.activity_date>=p_start) and (p_end is null or w.activity_date<=p_end)
  and (p_category is null or w.category_key=p_category) and (p_account is null or w.account_id=p_account)
 order by w.activity_date desc,w.record_id offset p_offset limit 51;
end; $$;
revoke all on function public.list_customer_transaction_work(text,boolean,integer,text,date,date,text,uuid) from public,anon;
grant execute on function public.list_customer_transaction_work(text,boolean,integer,text,date,date,text,uuid) to authenticated;

create or replace function public.customer_guided_work_summary() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare bid uuid; receipts boolean; history boolean; limitations boolean;
begin
 if auth.uid() is null or coalesce(auth.jwt()->>'aal','')<>'aal2' then raise exception 'verified session required';end if;
 select id into bid from public.businesses where owner_user_id=auth.uid();
 if bid is null then raise exception 'business unavailable';end if;
 select exists(select 1 from public.customer_transaction_work w where w.business_id=bid and public.purchase_receipt_eligible(w.amount_cents,w.bookkeeping_nature,w.treatment)
  and not w.has_receipt and not w.receipt_unavailable and w.source_kind='financial_transaction'
 ) into receipts;
 select exists(select 1 from public.customer_transaction_work w where w.business_id=bid and w.historical and not w.sweep_reviewed
  and w.source_kind='financial_transaction' and w.treatment not in ('personal','excluded')) into history;
 select exists(select 1 from public.customer_transaction_work w where w.business_id=bid and w.historical_documentation
  and w.treatment not in ('personal','excluded')) into limitations;
 return jsonb_build_object('missingReceipts',receipts,'historicalReview',history,'documentationLimitations',limitations);
end; $$;
revoke all on function public.customer_guided_work_summary() from public,anon;
grant execute on function public.customer_guided_work_summary() to authenticated;

create or replace function public.apply_guided_review(p_request_id uuid,p_action text,p_scope text,p_items jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 bid uuid:=public.require_customer_setup_owner(); prior public.bookkeeping_guided_review_batches%rowtype;
 item jsonb; w public.customer_transaction_work%rowtype; e public.bookkeeping_documentation_events%rowtype;
 result jsonb:='[]'; outcome jsonb; issue uuid; fp text;
begin
 if p_scope='receipts' and p_action<>'receipt_unavailable' then raise exception 'receipt review only records receipt availability'; end if;
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
  if p_action='receipt_unavailable' and (not public.purchase_receipt_eligible(w.amount_cents,w.bookkeeping_nature,w.treatment) or w.has_receipt or w.receipt_unavailable) then raise exception 'receipt review changed'; end if;
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

-- Reconcile previously imported unresolved deposits through the normal question
-- projection. Opening a question is not an answer or financial classification.
create function public.ensure_current_money_in_questions() returns integer
language plpgsql security definer set search_path='' as $$
declare bid uuid; candidate record; n integer:=0; fp text;
begin
 if auth.uid() is null or coalesce(auth.jwt()->>'aal','')<>'aal2' then raise exception 'verified session required'; end if;
 select id into bid from public.businesses where owner_user_id=auth.uid();
 if bid is null then raise exception 'business unavailable'; end if;
 if not public.customer_has_active_membership() or exists(select 1 from public.current_customer_membership
   where business_id=bid and deletion_status is not null) then return 0; end if;
 perform pg_advisory_xact_lock(hashtextextended('money-in-questions:'||bid::text,0));
 for candidate in
  select w.record_id,w.decision_id from public.customer_transaction_work w
  join public.bookkeeping_decisions d on d.id=w.decision_id and d.business_id=w.business_id
  where w.business_id=bid and w.source_kind='financial_transaction' and w.amount_cents>0
   and w.bookkeeping_nature is null and w.treatment='unresolved' and d.provenance<>'user'
   and not exists(select 1 from public.bookkeeping_review_events e where e.business_id=bid
     and e.bookkeeping_record_id=w.record_id and e.based_on_decision_id=w.decision_id
     and e.reason='TRANSACTION_TYPE_UNCLEAR'
     and e.evidence_fingerprint=public.current_bookkeeping_evidence_fingerprint(bid,w.record_id))
  order by w.activity_date,w.record_id limit 100
 loop
  fp:=public.current_bookkeeping_evidence_fingerprint(bid,candidate.record_id);
  perform public.open_bookkeeping_review_issue_v2(bid,candidate.record_id,candidate.decision_id,
   'TRANSACTION_TYPE_UNCLEAR','money-in:'||candidate.record_id::text||':'||candidate.decision_id::text||':'||md5(fp),
   md5(candidate.decision_id::text||':money-in:'||fp),
   jsonb_build_object('schemaVersion',1,'reason','TRANSACTION_TYPE_UNCLEAR','factType','money_in_source'));
  n:=n+1;
 end loop;
 return n;
end $$;
revoke all on function public.ensure_current_money_in_questions() from public,anon,service_role;
grant execute on function public.ensure_current_money_in_questions() to authenticated;

-- Preserve documentation history; only current purchases create receipt work.
create or replace function public.list_current_bookkeeping_documentation_requests(p_business_id uuid)
returns setof public.bookkeeping_documentation_events language sql stable set search_path='' as $$
 select e.* from public.bookkeeping_documentation_events e
 where e.business_id=p_business_id
  and (e.event_type in ('request_opened','reopened','acknowledged_pending')
    or (e.event_type='evidence_attached' and not e.evidence_satisfies_request))
  and not exists(select 1 from public.bookkeeping_documentation_events n where n.supersedes_event_id=e.id)
  and exists(select 1 from public.bookkeeping_records r
    join public.bookkeeping_decisions d on d.bookkeeping_record_id=r.id and d.business_id=r.business_id
    where r.id=e.bookkeeping_record_id and r.business_id=e.business_id
      and not exists(select 1 from public.bookkeeping_decisions n where n.supersedes_decision_id=d.id)
      and public.purchase_receipt_eligible(r.amount_cents,d.bookkeeping_nature,d.treatment))
 order by e.created_at,e.id
$$;

-- Retain the canonical answer engine, with explicit owner/MFA/membership and
-- incoming-choice checks before delegation. No new financial calculation path.
alter function public.answer_bookkeeping_transaction_type_review_issue(uuid,uuid,uuid,text,text,jsonb)
 rename to answer_bookkeeping_transaction_type_before_money_in;
create function public.answer_bookkeeping_transaction_type_review_issue(
 p_review_issue_id uuid,p_expected_current_event_id uuid,p_expected_current_decision_id uuid,
 p_expected_context_fingerprint text,p_expected_evidence_fingerprint text,p_answer jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare bid uuid:=public.require_customer_setup_owner(); e public.bookkeeping_review_events%rowtype;
begin
 select * into e from public.bookkeeping_review_events where business_id=bid
  and id=p_expected_current_event_id and review_issue_id=p_review_issue_id;
 if not found then raise exception 'question unavailable'; end if;
 if e.question_context->>'factType'='money_in_source' and coalesce(p_answer->>'activity','') not in
  ('earned_money','moved_money','added_own_money','borrowed_money','received_refund','other')
 then raise exception 'choose the source of the incoming money'; end if;
 return public.answer_bookkeeping_transaction_type_before_money_in(p_review_issue_id,p_expected_current_event_id,
  p_expected_current_decision_id,p_expected_context_fingerprint,p_expected_evidence_fingerprint,p_answer);
end $$;
revoke all on function public.answer_bookkeeping_transaction_type_before_money_in(uuid,uuid,uuid,text,text,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.answer_bookkeeping_transaction_type_review_issue(uuid,uuid,uuid,text,text,jsonb) from public,anon,service_role;
grant execute on function public.answer_bookkeeping_transaction_type_review_issue(uuid,uuid,uuid,text,text,jsonb) to authenticated;

-- Coordinate strong economic-context evidence before asking the customer for
-- broad bookkeeping classifications. Customer business use remains factual,
-- and every resulting decision/question stays in the canonical append-only
-- histories with the existing evidence fingerprints.

alter function public.answer_bookkeeping_transaction_type_review_issue(uuid,uuid,uuid,text,text,jsonb)
  rename to answer_bookkeeping_transaction_type_review_issue_legacy;

create or replace function public.answer_bookkeeping_transaction_type_review_issue(
  p_review_issue_id uuid,p_expected_current_event_id uuid,p_expected_current_decision_id uuid,
  p_expected_context_fingerprint text,p_expected_evidence_fingerprint text,p_answer jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.bookkeeping_review_events%rowtype; d public.bookkeeping_decisions%rowtype;
  origin_answer public.bookkeeping_review_events%rowtype; origin_resolved public.bookkeeping_review_events%rowtype;
  amount bigint; currency text; business_magnitude bigint; business_amount bigint; personal_amount bigint;
  copied_category text; new_decision uuid; answered uuid; resolved uuid; evidence text;
begin
  -- Legacy chains already contain a separate immutable BUSINESS_USE_UNCLEAR
  -- answer and continue through the original fully validated implementation.
  select * into e from public.bookkeeping_review_events where id=p_expected_current_event_id
    and review_issue_id=p_review_issue_id;
  if e.question_context->>'flowVersion' is distinct from '3'
    and not exists(select 1 from public.bookkeeping_review_events a
      where a.review_issue_id=(e.question_context->>'originatingReviewIssueId')::uuid
        and a.reason='MIXED_USE_CLARIFICATION' and a.question_context->>'flowVersion'='3') then
    return public.answer_bookkeeping_transaction_type_review_issue_legacy(p_review_issue_id,
      p_expected_current_event_id,p_expected_current_decision_id,p_expected_context_fingerprint,
      p_expected_evidence_fingerprint,p_answer);
  end if;
  if (select auth.uid()) is null or p_answer<>jsonb_build_object('schemaVersion',1,'activity','purchase')
    then raise exception 'direct mixed-use transaction activity must be a purchase'; end if;
  if not exists(select 1 from public.businesses b where b.id=e.business_id and b.owner_user_id=(select auth.uid()))
    then raise exception 'review issue is unavailable to the authenticated user'; end if;
  perform pg_advisory_xact_lock(hashtextextended(e.bookkeeping_record_id::text,41));
  select * into e from public.bookkeeping_review_events where id=p_expected_current_event_id
    and review_issue_id=p_review_issue_id for update;
  if not found or e.reason<>'TRANSACTION_TYPE_UNCLEAR' or e.event_type not in('opened','skipped','reopened')
    or exists(select 1 from public.bookkeeping_review_events s where s.supersedes_event_id=e.id)
    or e.context_fingerprint<>p_expected_context_fingerprint
    or e.evidence_fingerprint is distinct from p_expected_evidence_fingerprint
    then raise exception 'current review event changed'; end if;
  evidence:=public.current_bookkeeping_evidence_fingerprint(e.business_id,e.bookkeeping_record_id);
  if evidence is distinct from e.evidence_fingerprint then raise exception 'canonical evidence changed; reevaluation required'; end if;
  select * into d from public.bookkeeping_decisions x where x.id=p_expected_current_decision_id
    and x.business_id=e.business_id and x.bookkeeping_record_id=e.bookkeeping_record_id
    and not exists(select 1 from public.bookkeeping_decisions s where s.supersedes_decision_id=x.id) for update;
  if not found or d.id<>e.based_on_decision_id then raise exception 'current bookkeeping decision changed'; end if;
  select * into origin_answer from public.bookkeeping_review_events a
    where a.business_id=e.business_id and a.bookkeeping_record_id=e.bookkeeping_record_id
      and a.review_issue_id=(e.question_context->>'originatingReviewIssueId')::uuid
      and a.reason='MIXED_USE_CLARIFICATION' and a.event_type='answered'
      and a.question_context->>'flowVersion'='3';
  select * into origin_resolved from public.bookkeeping_review_events r
    where r.supersedes_event_id=origin_answer.id and r.event_type='resolved';
  if origin_answer.id is null or origin_resolved.resulting_decision_id is distinct from d.id
    or jsonb_typeof(origin_answer.answer_payload->'businessAmountCents')<>'number'
    then raise exception 'trusted direct mixed-use answer is unavailable'; end if;
  business_magnitude:=(origin_answer.answer_payload->>'businessAmountCents')::bigint;
  select coalesce(t.amount_cents,r.amount_cents),coalesce(t.currency,r.currency) into amount,currency
    from public.bookkeeping_records r left join public.bookkeeping_financial_sources s
      on s.business_id=r.business_id and s.bookkeeping_record_id=r.id and s.revoked_at is null
    left join public.financial_transactions t on t.business_id=s.business_id and t.id=s.financial_transaction_id
    where r.id=e.bookkeeping_record_id and r.business_id=e.business_id;
  if amount is null or amount=0 or currency is null or business_magnitude<=0 or business_magnitude>=abs(amount)
    then raise exception 'trusted mixed-use amount no longer fits authoritative amount'; end if;
  business_amount:=case when amount<0 then -business_magnitude else business_magnitude end;
  personal_amount:=amount-business_amount;
  select case when count(distinct a.tax_category_key)=1 then min(a.tax_category_key) end into copied_category
    from public.bookkeeping_allocations a where a.bookkeeping_decision_id=d.id
      and a.allocation_kind='business' and a.tax_category_key is not null;
  new_decision:=public.append_bookkeeping_decision(e.business_id,e.bookkeeping_record_id,d.id,'expense','mixed_use',
    'resolved','user',null,'Customer identified the business portion of a purchase.',d.business_purpose,
    jsonb_build_array(jsonb_build_object('kind','business','amount_cents',business_amount,'tax_category_key',copied_category),
      jsonb_build_object('kind','personal','amount_cents',personal_amount)));
  insert into public.bookkeeping_review_events(business_id,bookkeeping_record_id,review_issue_id,supersedes_event_id,
    sequence_number,event_type,reason,based_on_decision_id,issue_key,context_fingerprint,evidence_fingerprint,
    question_context,answer_payload,resulting_decision_id,provenance,actor_user_id)
  values(e.business_id,e.bookkeeping_record_id,e.review_issue_id,e.id,e.sequence_number+1,'answered',e.reason,d.id,
    e.issue_key,e.context_fingerprint,e.evidence_fingerprint,e.question_context,p_answer,new_decision,'user',(select auth.uid())) returning id into answered;
  insert into public.bookkeeping_review_events(business_id,bookkeeping_record_id,review_issue_id,supersedes_event_id,
    sequence_number,event_type,reason,based_on_decision_id,issue_key,context_fingerprint,evidence_fingerprint,
    question_context,resulting_decision_id,provenance)
  values(e.business_id,e.bookkeeping_record_id,e.review_issue_id,answered,e.sequence_number+2,'resolved',e.reason,d.id,
    e.issue_key,e.context_fingerprint,e.evidence_fingerprint,e.question_context,new_decision,'system') returning id into resolved;
  return jsonb_build_object('business_id',e.business_id,'decision_id',new_decision,
    'answered_event_id',answered,'resolved_event_id',resolved,'follow_up_event_id',null);
end $$;

-- Receipt-backed meal context asks transaction-specific facts in useful order:
-- business status, attendees/relationship, then business purpose.
create or replace function public.project_receipt_meal_candidate_questions(p_receipt_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare selected_business uuid; record_id uuid; d public.bookkeeping_decisions%rowtype; candidate_id uuid; issue uuid;
 fact_exists boolean; active_reason text; context jsonb; understanding_state text; record_source text;
begin
 if (select auth.uid()) is null then raise exception 'authentication required'; end if;
 select r.business_id into selected_business from public.receipts r join public.businesses b on b.id=r.business_id
   where r.id=p_receipt_id and r.user_id=(select auth.uid()) and b.owner_user_id=(select auth.uid());
 if selected_business is null then raise exception 'receipt unavailable'; end if;
 select id into candidate_id from public.bookkeeping_receipt_meal_candidates where business_id=selected_business
   and receipt_id=p_receipt_id order by created_at desc limit 1;
 if candidate_id is null then
   select state into understanding_state from public.receipt_processing_jobs where business_id=selected_business
     and receipt_id=p_receipt_id and job_type='receipt_understanding_shadow' order by created_at desc limit 1;
   return jsonb_build_object('state',case when understanding_state in('pending','processing','retryable')
     then 'processing' else 'not_a_meal_candidate' end);
 end if;
 select e.bookkeeping_record_id into record_id from public.bookkeeping_receipt_events e where e.receipt_id=p_receipt_id
   and not exists(select 1 from public.bookkeeping_receipt_events s where s.supersedes_event_id=e.id);
 if record_id is null then return jsonb_build_object('state','processing'); end if;
 record_id:=coalesce((select c.survivor_record_id from public.current_bookkeeping_record_convergences c
   where c.business_id=selected_business and c.receipt_id=p_receipt_id limit 1),record_id);
 select source_kind into record_source from public.bookkeeping_records where id=record_id and business_id=selected_business;
 if record_source<>'financial_transaction' then return jsonb_build_object('state','waiting_for_transaction','record_id',record_id); end if;
 select * into d from public.bookkeeping_decisions x where x.business_id=selected_business and x.bookkeeping_record_id=record_id
   and not exists(select 1 from public.bookkeeping_decisions s where s.supersedes_decision_id=x.id) for update;
 if d.id is null then return jsonb_build_object('state','processing'); end if;
 if d.bookkeeping_nature is null and d.treatment='unresolved' then
   d.id:=public.append_bookkeeping_decision(selected_business,record_id,d.id,'expense','unresolved','needs_review',
     'automation',0.95,'bookkeeping-evidence-routing:v1: receipt evidence establishes a meal purchase; business use remains unknown.',null,'[]'::jsonb);
   select * into d from public.bookkeeping_decisions where id=d.id;
 end if;
 if d.bookkeeping_nature<>'expense' or d.treatment in('personal','excluded') then
   return jsonb_build_object('state','complete','record_id',record_id); end if;
 select exists(select 1 from public.current_bookkeeping_meal_substantiation_facts f where f.business_id=selected_business
   and (f.bookkeeping_record_id=record_id or exists(select 1 from public.current_bookkeeping_record_convergences c
     where c.business_id=selected_business and c.survivor_record_id=record_id and c.absorbed_record_id=f.bookkeeping_record_id))) into fact_exists;
 if d.treatment='unresolved' then active_reason:='BUSINESS_USE_UNCLEAR';
 elsif not fact_exists then active_reason:='BUSINESS_PURPOSE_NEEDED';
 elsif nullif(btrim(d.business_purpose),'') is null then active_reason:='BUSINESS_PURPOSE_NEEDED';
 else return jsonb_build_object('state','complete','record_id',record_id); end if;
 context:=jsonb_build_object('schemaVersion',1,'routingVersion','bookkeeping-evidence-routing:v1','reason',active_reason,
   'receiptMealCandidateId',candidate_id,'establishedFacts',jsonb_build_array('purchase','meal'),
   'factType',case when active_reason='BUSINESS_USE_UNCLEAR' then 'receipt_meal_candidate'
     when not fact_exists then 'meal_attendee_relationship' else 'receipt_meal_business_purpose' end);
 select public.open_bookkeeping_review_issue_v2(selected_business,record_id,d.id,active_reason,
   case when context->>'factType'='meal_attendee_relationship' then 'meal-attendee:'
     when context->>'factType'='receipt_meal_business_purpose' then 'meal-purpose:'
     else lower(active_reason)||':meal-candidate:' end||record_id::text,
   md5(d.id::text||':'||active_reason||':'||(context->>'factType')||':'||candidate_id::text),context) into issue;
 return jsonb_build_object('state','question_ready','record_id',record_id,'review_event_id',issue);
end $$;

alter function public.answer_bookkeeping_meal_substantiation_issue(uuid,uuid,uuid,text,text,text)
  rename to answer_bookkeeping_meal_substantiation_issue_legacy;

create or replace function public.answer_bookkeeping_meal_substantiation_issue(
  p_review_issue_id uuid,p_expected_current_event_id uuid,p_expected_current_decision_id uuid,
  p_expected_context_fingerprint text,p_expected_evidence_fingerprint text,p_attendee_relationship text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.bookkeeping_review_events%rowtype; d public.bookkeeping_decisions%rowtype; copied jsonb;
 new_decision uuid; fact_id uuid; answered uuid; resolved uuid; follow_up uuid; issue uuid;
 clean_text text:=btrim(p_attendee_relationship); candidate_id uuid;
begin
 select * into e from public.bookkeeping_review_events where id=p_expected_current_event_id and review_issue_id=p_review_issue_id;
 select * into d from public.bookkeeping_decisions where id=p_expected_current_decision_id;
 if nullif(btrim(d.business_purpose),'') is not null then
   return public.answer_bookkeeping_meal_substantiation_issue_legacy(p_review_issue_id,p_expected_current_event_id,
     p_expected_current_decision_id,p_expected_context_fingerprint,p_expected_evidence_fingerprint,p_attendee_relationship);
 end if;
 if (select auth.uid()) is null or length(clean_text) not between 1 and 1000 then raise exception 'invalid meal attendee information'; end if;
 if not exists(select 1 from public.businesses b where b.id=e.business_id and b.owner_user_id=(select auth.uid()))
   then raise exception 'review issue is unavailable to the authenticated user'; end if;
 perform pg_advisory_xact_lock(hashtextextended(e.bookkeeping_record_id::text,41));
 select * into e from public.bookkeeping_review_events where id=p_expected_current_event_id and review_issue_id=p_review_issue_id for update;
 if not found or e.event_type not in('opened','skipped','reopened')
   or exists(select 1 from public.bookkeeping_review_events s where s.supersedes_event_id=e.id)
   or e.context_fingerprint<>p_expected_context_fingerprint or e.evidence_fingerprint is distinct from p_expected_evidence_fingerprint
   or e.question_context->>'factType'<>'meal_attendee_relationship'
   or public.current_bookkeeping_evidence_fingerprint(e.business_id,e.bookkeeping_record_id) is distinct from e.evidence_fingerprint
   then raise exception 'trusted meal context changed'; end if;
 select * into d from public.bookkeeping_decisions x where x.id=p_expected_current_decision_id and x.business_id=e.business_id
   and x.bookkeeping_record_id=e.bookkeeping_record_id and not exists(select 1 from public.bookkeeping_decisions s where s.supersedes_decision_id=x.id) for update;
 candidate_id:=(e.question_context->>'receiptMealCandidateId')::uuid;
 if not found or d.id<>e.based_on_decision_id or d.bookkeeping_nature<>'expense' or d.treatment not in('business','mixed_use')
   or not exists(select 1 from public.bookkeeping_receipt_meal_candidates c where c.id=candidate_id and c.business_id=e.business_id)
   then raise exception 'current meal decision changed'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('kind',a.allocation_kind,'amount_cents',a.amount_cents,
   'tax_category_key',a.tax_category_key,'memo',a.memo) order by a.id),'[]'::jsonb) into copied
   from public.bookkeeping_allocations a where a.bookkeeping_decision_id=d.id;
 new_decision:=public.append_bookkeeping_decision(e.business_id,e.bookkeeping_record_id,d.id,d.bookkeeping_nature,d.treatment,
   'needs_review','user',null,d.reason,null,copied);
 insert into public.bookkeeping_meal_substantiation_facts(business_id,bookkeeping_record_id,attendee_relationship,actor_user_id)
   values(e.business_id,e.bookkeeping_record_id,clean_text,(select auth.uid())) returning id into fact_id;
 insert into public.bookkeeping_review_events(business_id,bookkeeping_record_id,review_issue_id,supersedes_event_id,sequence_number,event_type,
   reason,based_on_decision_id,issue_key,context_fingerprint,evidence_fingerprint,question_context,answer_payload,resulting_decision_id,provenance,actor_user_id)
 values(e.business_id,e.bookkeeping_record_id,e.review_issue_id,e.id,e.sequence_number+1,'answered',e.reason,d.id,e.issue_key,
   e.context_fingerprint,e.evidence_fingerprint,e.question_context,jsonb_build_object('schemaVersion',1,'attendeeRelationship',clean_text),
   new_decision,'user',(select auth.uid())) returning id into answered;
 insert into public.bookkeeping_review_events(business_id,bookkeeping_record_id,review_issue_id,supersedes_event_id,sequence_number,event_type,
   reason,based_on_decision_id,issue_key,context_fingerprint,evidence_fingerprint,question_context,resulting_decision_id,provenance)
 values(e.business_id,e.bookkeeping_record_id,e.review_issue_id,answered,e.sequence_number+2,'resolved',e.reason,d.id,e.issue_key,
   e.context_fingerprint,e.evidence_fingerprint,e.question_context,new_decision,'system') returning id into resolved;
 issue:=gen_random_uuid();
 insert into public.bookkeeping_review_events(id,business_id,bookkeeping_record_id,review_issue_id,sequence_number,event_type,reason,
   based_on_decision_id,issue_key,context_fingerprint,evidence_fingerprint,question_context,provenance)
 values(issue,e.business_id,e.bookkeeping_record_id,issue,1,'opened','BUSINESS_PURPOSE_NEEDED',new_decision,
   'meal-purpose:'||e.bookkeeping_record_id::text,md5(new_decision::text||':meal-purpose:'||candidate_id::text),e.evidence_fingerprint,
   jsonb_build_object('schemaVersion',1,'routingVersion','bookkeeping-evidence-routing:v1','reason','BUSINESS_PURPOSE_NEEDED',
     'factType','receipt_meal_business_purpose','receiptMealCandidateId',candidate_id,'establishedFacts',jsonb_build_array('purchase','meal','attendees')),
   'system') returning id into follow_up;
 return jsonb_build_object('business_id',e.business_id,'decision_id',new_decision,'fact_id',fact_id,
   'answered_event_id',answered,'resolved_event_id',resolved,'follow_up_event_id',follow_up);
end $$;

revoke all on function public.answer_bookkeeping_transaction_type_review_issue_legacy(uuid,uuid,uuid,text,text,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.answer_bookkeeping_meal_substantiation_issue_legacy(uuid,uuid,uuid,text,text,text) from public,anon,authenticated,service_role;
revoke all on function public.answer_bookkeeping_transaction_type_review_issue(uuid,uuid,uuid,text,text,jsonb) from public,anon,service_role;
revoke all on function public.answer_bookkeeping_meal_substantiation_issue(uuid,uuid,uuid,text,text,text) from public,anon,service_role;
grant execute on function public.answer_bookkeeping_transaction_type_review_issue(uuid,uuid,uuid,text,text,jsonb) to authenticated;
grant execute on function public.answer_bookkeeping_meal_substantiation_issue(uuid,uuid,uuid,text,text,text) to authenticated;

comment on function public.project_receipt_meal_candidate_questions(uuid) is
  'Evidence routing v1: receipt-supported meal context asks business status, attendees, then business purpose.';

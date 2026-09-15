-- A customer answer can cause the worker to project customer_authoritative
-- context. That must not invalidate the established assessment attached to the
-- still-current follow-up question. Read its immutable history entry instead.
-- Ownership, current decision, event version and current evidence fingerprint
-- checks below still reject stale or cross-tenant answers. No customer data is
-- rewritten and no questions are manually resolved.

create or replace function public.answer_bookkeeping_business_context_meal_issue(
  p_review_issue_id uuid,p_expected_current_event_id uuid,p_expected_current_decision_id uuid,
  p_expected_context_fingerprint text,p_expected_evidence_fingerprint text,p_answer text,
  p_understanding_version text,p_extracted_attendee_relationship text,p_extracted_business_purpose text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.bookkeeping_review_events%rowtype; d public.bookkeeping_decisions%rowtype;
  assessment public.bookkeeping_business_context_assessments%rowtype; copied jsonb; new_decision uuid;
  fact_id uuid; answered uuid; resolved uuid; follow_up uuid; clean text:=btrim(p_answer);
  attendee text:=nullif(btrim(p_extracted_attendee_relationship),'');
  purpose text:=nullif(btrim(p_extracted_business_purpose),''); next_fact text;
begin
  if (select auth.uid()) is null then raise exception 'authentication required'; end if;
  if length(clean) not between 1 and 1000 or p_understanding_version<>'meal-answer-understanding:v1'
    or (attendee is not null and position(attendee in clean)=0)
    or (purpose is not null and position(purpose in clean)=0) then raise exception 'invalid meal answer understanding'; end if;
  select * into e from public.bookkeeping_review_events where id=p_expected_current_event_id
    and review_issue_id=p_review_issue_id;
  if not exists(select 1 from public.businesses b where b.id=e.business_id and b.owner_user_id=(select auth.uid()))
    then raise exception 'review issue is unavailable to the authenticated user'; end if;
  perform pg_advisory_xact_lock(hashtextextended(e.bookkeeping_record_id::text,41));
  select * into e from public.bookkeeping_review_events where id=p_expected_current_event_id
    and review_issue_id=p_review_issue_id for update;
  if not found or e.event_type not in('opened','skipped','reopened')
    or exists(select 1 from public.bookkeeping_review_events s where s.supersedes_event_id=e.id)
    or e.reason<>'BUSINESS_PURPOSE_NEEDED' or e.context_fingerprint<>p_expected_context_fingerprint
    or e.evidence_fingerprint is distinct from p_expected_evidence_fingerprint
    or e.question_context->>'factType'<>'meal_attendee_relationship'
    or public.current_bookkeeping_evidence_fingerprint(e.business_id,e.bookkeeping_record_id)
      is distinct from e.evidence_fingerprint then raise exception 'trusted meal context changed'; end if;
  select * into assessment from public.bookkeeping_business_context_assessments a
    where a.id=(e.question_context->>'businessContextAssessmentId')::uuid and a.business_id=e.business_id
      and a.bookkeeping_record_id=e.bookkeeping_record_id and a.assessment_state='established'
      and a.economic_context='restaurant_meal';
  if not found then raise exception 'business context changed'; end if;
  select * into d from public.bookkeeping_decisions x where x.id=p_expected_current_decision_id
    and x.business_id=e.business_id and x.bookkeeping_record_id=e.bookkeeping_record_id
    and not exists(select 1 from public.bookkeeping_decisions s where s.supersedes_decision_id=x.id) for update;
  if not found or d.id<>e.based_on_decision_id or d.bookkeeping_nature<>'expense'
    or d.treatment not in('business','mixed_use') then raise exception 'current meal decision changed'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('kind',a.allocation_kind,'amount_cents',a.amount_cents,
    'tax_category_key',case when a.allocation_kind='business' then coalesce(a.tax_category_key,'meals') else a.tax_category_key end,
    'memo',a.memo) order by a.id),'[]'::jsonb) into copied from public.bookkeeping_allocations a
    where a.bookkeeping_decision_id=d.id;
  if attendee is null then next_fact:='meal_attendee_relationship';
  elsif purpose is null and nullif(btrim(d.business_purpose),'') is null then next_fact:='receipt_meal_business_purpose';
  else next_fact:=null; end if;
  new_decision:=public.append_bookkeeping_decision(e.business_id,e.bookkeeping_record_id,d.id,'expense',d.treatment,
    case when next_fact is null then 'resolved' else 'needs_review' end,'user',null,
    'Customer supplied meal substantiation facts.',coalesce(purpose,d.business_purpose),copied);
  if attendee is not null then insert into public.bookkeeping_meal_substantiation_facts(
    business_id,bookkeeping_record_id,attendee_relationship,actor_user_id)
    values(e.business_id,e.bookkeeping_record_id,attendee,(select auth.uid())) returning id into fact_id; end if;
  insert into public.bookkeeping_review_events(business_id,bookkeeping_record_id,review_issue_id,supersedes_event_id,
    sequence_number,event_type,reason,based_on_decision_id,issue_key,context_fingerprint,evidence_fingerprint,
    question_context,answer_payload,resulting_decision_id,provenance,actor_user_id)
  values(e.business_id,e.bookkeeping_record_id,e.review_issue_id,e.id,e.sequence_number+1,'answered',e.reason,d.id,e.issue_key,
    e.context_fingerprint,e.evidence_fingerprint,e.question_context,jsonb_build_object('schemaVersion',1,'answer',clean,
      'understandingVersion',p_understanding_version,'attendeeRelationship',attendee,'businessPurpose',purpose),
    new_decision,'user',(select auth.uid())) returning id into answered;
  insert into public.bookkeeping_review_events(business_id,bookkeeping_record_id,review_issue_id,supersedes_event_id,
    sequence_number,event_type,reason,based_on_decision_id,issue_key,context_fingerprint,evidence_fingerprint,
    question_context,resulting_decision_id,provenance)
  values(e.business_id,e.bookkeeping_record_id,e.review_issue_id,answered,e.sequence_number+2,'resolved',e.reason,d.id,e.issue_key,
    e.context_fingerprint,e.evidence_fingerprint,e.question_context,new_decision,'system') returning id into resolved;
  if next_fact is not null then follow_up:=public.open_bookkeeping_review_issue_v2(e.business_id,e.bookkeeping_record_id,
    new_decision,'BUSINESS_PURPOSE_NEEDED',case when next_fact='meal_attendee_relationship' then 'meal-attendee:' else 'meal-purpose:' end
      ||e.bookkeeping_record_id::text||':after:'||answered::text,
    md5(new_decision::text||':'||next_fact||':'||assessment.id::text),jsonb_build_object('schemaVersion',1,
      'routingVersion','bookkeeping-business-context:v1','understandingVersion',p_understanding_version,
      'reason','BUSINESS_PURPOSE_NEEDED','factType',next_fact,'businessContextAssessmentId',assessment.id,
      'establishedFacts',case when attendee is not null then jsonb_build_array('purchase','meal','attendees')
        when purpose is not null then jsonb_build_array('purchase','meal','businessPurpose')
        else jsonb_build_array('purchase','meal','businessContext') end)); end if;
  return jsonb_build_object('business_id',e.business_id,'decision_id',new_decision,'fact_id',fact_id,
    'answered_event_id',answered,'resolved_event_id',resolved,'follow_up_event_id',follow_up,'remaining_fact_type',next_fact);
end $$;
revoke execute on function public.answer_bookkeeping_business_context_meal_issue(
  uuid,uuid,uuid,text,text,text,text,text,text) from public,anon,service_role;
grant execute on function public.answer_bookkeeping_business_context_meal_issue(
  uuid,uuid,uuid,text,text,text,text,text,text) to authenticated;

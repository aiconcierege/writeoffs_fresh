-- New weekly reviews use the guided evidence-first sequence. Existing append-only
-- workflow histories retain their original sequence and remain valid.
create or replace function public.append_weekly_review_workflow_event(
  p_review_period_id uuid,p_expected_event_id uuid,p_stage text,p_event_type text,
  p_details jsonb,p_request_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare selected_business uuid; current_event public.bookkeeping_weekly_review_workflow_events%rowtype;
  inserted uuid; expected_stage text; effective_details jsonb; guided boolean;
begin
  select id into selected_business from public.businesses where owner_user_id=(select auth.uid());
  if selected_business is null then raise exception 'Business was not found'; end if;
  select id into inserted from public.bookkeeping_weekly_review_workflow_events
    where business_id=selected_business and request_id=p_request_id;
  if inserted is not null then return inserted; end if;
  if p_stage not in ('personal','mixed','questions','documentation','mileage','final')
    or p_event_type not in ('stage_completed','stage_reopened') or jsonb_typeof(p_details)<>'object'
  then raise exception 'Review workflow action is invalid'; end if;
  select * into current_event from public.bookkeeping_weekly_review_workflow_events
    where business_id=selected_business and review_period_id=p_review_period_id
      and not exists(select 1 from public.bookkeeping_weekly_review_workflow_events successor
        where successor.supersedes_event_id=bookkeeping_weekly_review_workflow_events.id) for update;
  if current_event.id is distinct from p_expected_event_id then raise exception 'Review workflow changed'; end if;

  guided:=current_event.id is null or current_event.details->>'flowVersion'='2';
  if guided then
    expected_stage:=case current_event.stage when 'personal' then 'documentation'
      when 'documentation' then 'questions' when 'questions' then 'final' else null end;
    effective_details:=p_details||jsonb_build_object('flowVersion',2);
  else
    expected_stage:=case current_event.stage when 'personal' then 'mixed' when 'mixed' then 'questions'
      when 'questions' then 'documentation' when 'documentation' then 'mileage'
      when 'mileage' then 'final' else null end;
    effective_details:=p_details;
  end if;
  if p_event_type='stage_completed' and ((current_event.id is null and p_stage<>'personal')
    or (current_event.id is not null and p_stage<>expected_stage)) then
    raise exception 'Review stages must be completed in order';
  end if;
  insert into public.bookkeeping_weekly_review_workflow_events(business_id,review_period_id,
    supersedes_event_id,stage,event_type,details,actor_user_id,request_id)
  values(selected_business,p_review_period_id,current_event.id,p_stage,p_event_type,effective_details,
    (select auth.uid()),p_request_id) returning id into inserted;
  return inserted;
end $$;

revoke execute on function public.append_weekly_review_workflow_event(uuid,uuid,text,text,jsonb,uuid) from public,anon;
grant execute on function public.append_weekly_review_workflow_event(uuid,uuid,text,text,jsonb,uuid) to authenticated;

comment on function public.append_weekly_review_workflow_event(uuid,uuid,text,text,jsonb,uuid) is
  'Appends tenant-scoped weekly workflow evidence. Flow version 2 is personal, documentation, questions, final; unversioned historical reviews retain the legacy sequence.';

-- These counts are part of what the customer reviews, so preserve them on the
-- immutable snapshot rather than recomputing them from later mutable state.
alter table public.bookkeeping_review_snapshots
  add column personal_excluded_count integer not null default 0 check(personal_excluded_count>=0),
  add column missing_documentation_count integer not null default 0 check(missing_documentation_count>=0);

drop function public.present_bookkeeping_weekly_review(uuid,uuid,uuid,text,text,bigint,bigint,integer,text,jsonb);

create or replace function public.present_bookkeeping_weekly_review(
  p_business_id uuid,p_review_period_id uuid,p_expected_event_id uuid,p_membership_scope text,
  p_currency text,p_income_cents bigint,p_expense_cents bigint,p_unresolved_question_count integer,
  p_personal_excluded_count integer,p_missing_documentation_count integer,
  p_activity_fingerprint text,p_items jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare current_event public.bookkeeping_review_period_events%rowtype; snapshot_id uuid;
  next_revision integer; item jsonb;
begin
  if p_membership_scope not in ('expenses','business') or jsonb_typeof(p_items)<>'array'
    or p_personal_excluded_count<0 or p_missing_documentation_count<0
  then raise exception 'Review presentation is invalid'; end if;
  select * into current_event from public.bookkeeping_review_period_events
    where id=p_expected_event_id and business_id=p_business_id and review_period_id=p_review_period_id for update;
  if not found or current_event.event_type not in ('opened','questions_pending','ready','reopened')
    or exists(select 1 from public.bookkeeping_review_period_events where supersedes_event_id=current_event.id)
  then raise exception 'Review state changed'; end if;
  select coalesce(max(revision),0)+1 into next_revision from public.bookkeeping_review_snapshots
    where review_period_id=p_review_period_id;
  insert into public.bookkeeping_review_snapshots(business_id,review_period_id,revision,membership_scope,
    currency,income_cents,expense_cents,unresolved_question_count,personal_excluded_count,
    missing_documentation_count,activity_fingerprint,presentation_version)
  values(p_business_id,p_review_period_id,next_revision,p_membership_scope,p_currency,
    case when p_membership_scope='business' then p_income_cents else null end,p_expense_cents,
    p_unresolved_question_count,p_personal_excluded_count,p_missing_documentation_count,p_activity_fingerprint,3)
  returning id into snapshot_id;
  for item in select value from jsonb_array_elements(p_items) loop
    if not exists(select 1 from public.bookkeeping_decisions decision
      where decision.id=(item->>'bookkeepingDecisionId')::uuid
        and decision.bookkeeping_record_id=(item->>'bookkeepingRecordId')::uuid
        and decision.business_id=p_business_id
        and not exists(select 1 from public.bookkeeping_decisions successor where successor.supersedes_decision_id=decision.id))
    then raise exception 'Review item is not a current canonical decision'; end if;
    insert into public.bookkeeping_review_snapshot_items(business_id,review_period_id,review_snapshot_id,
      bookkeeping_record_id,bookkeeping_decision_id,activity_role,display_label,category_label,treatment,
      signed_business_amount_cents,financial_transaction_id,occurred_on,evidence_fingerprint)
    values(p_business_id,p_review_period_id,snapshot_id,(item->>'bookkeepingRecordId')::uuid,
      (item->>'bookkeepingDecisionId')::uuid,item->>'activityRole',left(trim(item->>'displayLabel'),240),
      case when nullif(trim(item->>'categoryLabel'),'') is null then null else left(trim(item->>'categoryLabel'),120) end,
      item->>'treatment',(item->>'signedBusinessAmountCents')::bigint,(item->>'financialTransactionId')::uuid,
      (item->>'occurredOn')::date,item->>'evidenceFingerprint');
  end loop;
  insert into public.bookkeeping_review_period_events(business_id,review_period_id,sequence_number,
    supersedes_event_id,event_type,review_snapshot_id,provenance)
  values(p_business_id,p_review_period_id,current_event.sequence_number+1,current_event.id,'presented',snapshot_id,'system');
  return snapshot_id;
end $$;

revoke execute on function public.present_bookkeeping_weekly_review(uuid,uuid,uuid,text,text,bigint,bigint,integer,integer,integer,text,jsonb)
  from public,anon,authenticated;
grant execute on function public.present_bookkeeping_weekly_review(uuid,uuid,uuid,text,text,bigint,bigint,integer,integer,integer,text,jsonb)
  to service_role;

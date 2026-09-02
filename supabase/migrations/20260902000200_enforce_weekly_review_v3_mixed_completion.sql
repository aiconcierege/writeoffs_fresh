-- Stop v3 at the Mixed activity substep until every current, in-period mixed
-- clarification has a canonical answer. Also provide an explicit append-only,
-- service-operated repair for reviews completed before this guard existed.

create or replace function public.append_weekly_review_workflow_event(
  p_review_period_id uuid,p_expected_event_id uuid,p_stage text,p_event_type text,
  p_details jsonb,p_request_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare selected_business uuid; current_event public.bookkeeping_weekly_review_workflow_events%rowtype;
  period public.bookkeeping_review_periods%rowtype; inserted uuid; expected_stage text;
  effective_details jsonb; flow_version integer;
begin
  select id into selected_business from public.businesses where owner_user_id=(select auth.uid());
  if selected_business is null then raise exception 'Business was not found'; end if;
  select id into inserted from public.bookkeeping_weekly_review_workflow_events
    where business_id=selected_business and request_id=p_request_id;
  if inserted is not null then return inserted; end if;
  if p_stage not in ('personal','mixed','questions','documentation','mileage','final')
    or p_event_type not in ('stage_completed','stage_reopened') or jsonb_typeof(p_details)<>'object'
  then raise exception 'Review workflow action is invalid'; end if;
  select * into period from public.bookkeeping_review_periods
    where id=p_review_period_id and business_id=selected_business;
  if not found then raise exception 'Review period was not found'; end if;
  perform pg_advisory_xact_lock(hashtextextended('weekly-workflow:'||p_review_period_id::text,0));
  select * into current_event from public.bookkeeping_weekly_review_workflow_events
    where business_id=selected_business and review_period_id=p_review_period_id
      and not exists(select 1 from public.bookkeeping_weekly_review_workflow_events successor
        where successor.supersedes_event_id=bookkeeping_weekly_review_workflow_events.id) for update;
  if current_event.id is distinct from p_expected_event_id then raise exception 'Review workflow changed'; end if;

  flow_version:=case when current_event.id is null then 3
    when current_event.details->>'flowVersion' in ('2','3') then (current_event.details->>'flowVersion')::integer
    else null end;
  if flow_version=3 then
    expected_stage:=case current_event.stage when 'personal' then 'mixed' when 'mixed' then
      case when current_event.event_type='stage_reopened' then 'mixed' else 'documentation' end
      when 'documentation' then 'questions' when 'questions' then 'final' else null end;
    effective_details:=p_details||jsonb_build_object('flowVersion',3);
  elsif flow_version=2 then
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
  if flow_version=3 and p_stage='mixed' and p_event_type='stage_completed' and exists(
    select 1 from public.bookkeeping_review_events event
    join public.bookkeeping_records record on record.id=event.bookkeeping_record_id
      and record.business_id=event.business_id
    where event.business_id=selected_business
      and record.occurred_on between period.period_start and period.period_end
      and event.reason='MIXED_USE_CLARIFICATION'
      and event.event_type in('opened','reopened','skipped')
      and not exists(select 1 from public.bookkeeping_review_events successor
        where successor.supersedes_event_id=event.id)
  ) then raise exception 'A selected shared expense still needs its business portion'; end if;
  insert into public.bookkeeping_weekly_review_workflow_events(business_id,review_period_id,
    supersedes_event_id,stage,event_type,details,actor_user_id,request_id)
  values(selected_business,p_review_period_id,current_event.id,p_stage,p_event_type,effective_details,
    (select auth.uid()),p_request_id) returning id into inserted;
  return inserted;
end $$;

revoke execute on function public.append_weekly_review_workflow_event(uuid,uuid,text,text,jsonb,uuid)
  from public,anon,service_role;
grant execute on function public.append_weekly_review_workflow_event(uuid,uuid,text,text,jsonb,uuid)
  to authenticated;

create or replace function public.recover_weekly_review_v3_mixed_stage(
  p_business_id uuid,p_review_period_id uuid,p_expected_workflow_event_id uuid,p_request_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare period public.bookkeeping_review_periods%rowtype;
  current_event public.bookkeeping_weekly_review_workflow_events%rowtype; inserted uuid; selected_actor uuid;
begin
  if p_business_id is null or p_review_period_id is null or p_expected_workflow_event_id is null
    or p_request_id is null then raise exception 'Mixed-stage recovery input is invalid'; end if;
  select id into inserted from public.bookkeeping_weekly_review_workflow_events
    where business_id=p_business_id and request_id=p_request_id;
  if inserted is not null then return inserted; end if;
  select * into period from public.bookkeeping_review_periods
    where id=p_review_period_id and business_id=p_business_id;
  if not found then raise exception 'Review period was not found'; end if;
  select owner_user_id into selected_actor from public.businesses where id=p_business_id;
  if selected_actor is null then raise exception 'Business was not found'; end if;
  perform pg_advisory_xact_lock(hashtextextended('weekly-workflow:'||p_review_period_id::text,0));
  select * into current_event from public.bookkeeping_weekly_review_workflow_events event
    where event.id=p_expected_workflow_event_id and event.business_id=p_business_id
      and event.review_period_id=p_review_period_id
      and not exists(select 1 from public.bookkeeping_weekly_review_workflow_events successor
        where successor.supersedes_event_id=event.id) for update;
  if not found then raise exception 'Review workflow changed'; end if;
  if current_event.details->>'flowVersion'<>'3' then raise exception 'Only version 3 reviews can be recovered'; end if;
  if current_event.stage='mixed' and current_event.event_type='stage_reopened' then return current_event.id; end if;
  if current_event.stage not in('mixed','documentation','questions','final') then
    raise exception 'Review workflow is not eligible for mixed-stage recovery'; end if;
  if exists(select 1 from public.bookkeeping_review_period_events event
    where event.business_id=p_business_id and event.review_period_id=p_review_period_id
      and event.review_snapshot_id is not null) then
    raise exception 'A presented review cannot be recovered'; end if;
  if not exists(
    select 1 from public.bookkeeping_review_events issue
    join public.bookkeeping_records record on record.id=issue.bookkeeping_record_id
      and record.business_id=issue.business_id
    where issue.business_id=p_business_id
      and record.occurred_on between period.period_start and period.period_end
      and issue.reason='MIXED_USE_CLARIFICATION'
      and issue.event_type in('opened','reopened','skipped')
      and not exists(select 1 from public.bookkeeping_review_events successor
        where successor.supersedes_event_id=issue.id)
  ) then raise exception 'No unresolved mixed allocation requires recovery'; end if;
  insert into public.bookkeeping_weekly_review_workflow_events(business_id,review_period_id,
    supersedes_event_id,stage,event_type,details,actor_user_id,request_id)
  values(p_business_id,p_review_period_id,current_event.id,'mixed','stage_reopened',
    jsonb_build_object('flowVersion',3,'phase','mixed_followups','recoveryReason',
      'unresolved_mixed_allocation_after_stage_completion'),selected_actor,p_request_id)
  returning id into inserted;
  return inserted;
end $$;

revoke execute on function public.recover_weekly_review_v3_mixed_stage(uuid,uuid,uuid,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.recover_weekly_review_v3_mixed_stage(uuid,uuid,uuid,uuid)
  to service_role;

comment on function public.recover_weekly_review_v3_mixed_stage(uuid,uuid,uuid,uuid) is
  'Idempotently appends a corrective v3 mixed-stage reopen when an unresolved in-period mixed allocation survived a later workflow event.';

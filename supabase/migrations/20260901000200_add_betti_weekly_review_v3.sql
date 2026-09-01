-- Weekly Review v3 adds a durable mixed-identification substep while preserving
-- every legacy and v2 workflow event. New, previously untouched workflows use
-- personal -> mixed -> documentation -> questions -> final.

create table public.bookkeeping_mixed_use_answer_provenance (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  bookkeeping_record_id uuid not null,
  review_issue_id uuid not null,
  resulting_review_event_id uuid not null,
  input_mode text not null check (input_mode in ('business_percentage')),
  business_basis_points integer not null check (business_basis_points between 0 and 10000),
  business_amount_cents bigint not null,
  personal_amount_cents bigint not null,
  created_at timestamptz not null default now(),
  unique (resulting_review_event_id),
  foreign key (bookkeeping_record_id,business_id)
    references public.bookkeeping_records(id,business_id) on delete restrict,
  foreign key (resulting_review_event_id,business_id,bookkeeping_record_id,review_issue_id)
    references public.bookkeeping_review_events(id,business_id,bookkeeping_record_id,review_issue_id)
    on delete restrict
);

alter table public.bookkeeping_mixed_use_answer_provenance enable row level security;
create trigger bookkeeping_mixed_use_answer_provenance_immutable before update or delete
  on public.bookkeeping_mixed_use_answer_provenance for each row
  execute function public.reject_weekly_review_history_mutation();
create policy bookkeeping_mixed_use_answer_provenance_select_own
  on public.bookkeeping_mixed_use_answer_provenance for select to authenticated
  using (exists(select 1 from public.businesses b
    where b.id=business_id and b.owner_user_id=(select auth.uid())));
revoke all on public.bookkeeping_mixed_use_answer_provenance from public,anon,authenticated,service_role;
grant select on public.bookkeeping_mixed_use_answer_provenance to authenticated,service_role;

create or replace function public.append_weekly_review_workflow_event(
  p_review_period_id uuid,p_expected_event_id uuid,p_stage text,p_event_type text,
  p_details jsonb,p_request_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare selected_business uuid; current_event public.bookkeeping_weekly_review_workflow_events%rowtype;
  inserted uuid; expected_stage text; effective_details jsonb; flow_version integer;
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
  insert into public.bookkeeping_weekly_review_workflow_events(business_id,review_period_id,
    supersedes_event_id,stage,event_type,details,actor_user_id,request_id)
  values(selected_business,p_review_period_id,current_event.id,p_stage,p_event_type,effective_details,
    (select auth.uid()),p_request_id) returning id into inserted;
  return inserted;
end $$;

revoke execute on function public.append_weekly_review_workflow_event(uuid,uuid,text,text,jsonb,uuid) from public,anon,service_role;
grant execute on function public.append_weekly_review_workflow_event(uuid,uuid,text,text,jsonb,uuid) to authenticated;

create or replace function public.open_weekly_mixed_clarifications(
  p_review_period_id uuid,p_expected_workflow_event_id uuid,p_request_id uuid,p_items jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare selected_business uuid; period public.bookkeeping_review_periods%rowtype;
  workflow public.bookkeeping_weekly_review_workflow_events%rowtype; existing uuid;
  item jsonb; selected_record public.bookkeeping_records%rowtype; decision public.bookkeeping_decisions%rowtype;
  source public.bookkeeping_financial_sources%rowtype; issue public.bookkeeping_review_events%rowtype;
  issue_id uuid; evidence text; workflow_event uuid; opened_count integer:=0;
begin
  if (select auth.uid()) is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)>500
  then raise exception 'Mixed-use selection is invalid'; end if;
  select id into selected_business from public.businesses where owner_user_id=(select auth.uid());
  select id into existing from public.bookkeeping_weekly_review_workflow_events
    where business_id=selected_business and request_id=p_request_id;
  if existing is not null then return jsonb_build_object('workflow_event_id',existing,'idempotent',true); end if;
  select * into period from public.bookkeeping_review_periods
    where id=p_review_period_id and business_id=selected_business;
  if not found then raise exception 'Review period was not found'; end if;
  perform pg_advisory_xact_lock(hashtextextended('weekly-mixed:'||p_review_period_id::text,0));
  select * into workflow from public.bookkeeping_weekly_review_workflow_events w
    where w.id=p_expected_workflow_event_id and w.business_id=selected_business
      and w.review_period_id=p_review_period_id
      and not exists(select 1 from public.bookkeeping_weekly_review_workflow_events s where s.supersedes_event_id=w.id)
    for update;
  if not found or workflow.stage<>'personal' or workflow.event_type<>'stage_completed'
    or workflow.details->>'flowVersion'<>'3' then raise exception 'Mixed-use workflow changed'; end if;

  for item in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(item)<>'object' or (select count(*) from jsonb_object_keys(item))<>3
      or not(item?'recordId' and item?'transactionId' and item?'decisionId')
    then raise exception 'Mixed-use selection item is invalid'; end if;
    select * into selected_record from public.bookkeeping_records
      where id=(item->>'recordId')::uuid and business_id=selected_business
        and occurred_on between period.period_start and period.period_end for update;
    select * into decision from public.bookkeeping_decisions d
      where d.id=(item->>'decisionId')::uuid and d.business_id=selected_business
        and d.bookkeeping_record_id=selected_record.id and d.bookkeeping_nature='expense'
        and d.treatment='business'
        and not exists(select 1 from public.bookkeeping_decisions s where s.supersedes_decision_id=d.id) for update;
    select * into source from public.bookkeeping_financial_sources s
      where s.business_id=selected_business and s.bookkeeping_record_id=selected_record.id
        and s.financial_transaction_id=(item->>'transactionId')::uuid and s.revoked_at is null;
    if selected_record.id is null or decision.id is null or source.id is null then
      raise exception 'Selected mixed-use activity changed'; end if;
    if exists(select 1 from public.bookkeeping_review_events e
      where e.business_id=selected_business and e.bookkeeping_record_id=selected_record.id
        and e.event_type in('opened','skipped','reopened')
        and not exists(select 1 from public.bookkeeping_review_events s where s.supersedes_event_id=e.id)
        and e.reason<>'MIXED_USE_CLARIFICATION')
    then raise exception 'Another material fact must be resolved first'; end if;
    select * into issue from public.bookkeeping_review_events e
      where e.business_id=selected_business and e.bookkeeping_record_id=selected_record.id
        and e.reason='MIXED_USE_CLARIFICATION' and e.based_on_decision_id=decision.id
        and e.event_type in('opened','skipped','reopened')
        and not exists(select 1 from public.bookkeeping_review_events s where s.supersedes_event_id=e.id) for update;
    if issue.id is null then
      issue_id:=gen_random_uuid(); evidence:=public.current_bookkeeping_evidence_fingerprint(selected_business,selected_record.id);
      insert into public.bookkeeping_review_events(id,business_id,bookkeeping_record_id,review_issue_id,
        sequence_number,event_type,reason,based_on_decision_id,issue_key,context_fingerprint,
        evidence_fingerprint,question_context,provenance)
      values(issue_id,selected_business,selected_record.id,issue_id,1,'opened','MIXED_USE_CLARIFICATION',decision.id,
        'weekly-v3:mixed:'||p_review_period_id::text||':'||selected_record.id::text,
        md5(p_review_period_id::text||':'||selected_record.id::text||':'||decision.id::text||':'||evidence),evidence,
        jsonb_build_object('schemaVersion',1,'reason','MIXED_USE_CLARIFICATION','businessUse','mixed',
          'reviewPeriodId',p_review_period_id,'flowVersion',3),'system');
      opened_count:=opened_count+1;
    end if;
  end loop;
  if jsonb_array_length(p_items)=0 then
    workflow_event:=public.append_weekly_review_workflow_event(p_review_period_id,p_expected_workflow_event_id,
      'mixed','stage_completed',jsonb_build_object('selectedCount',0),p_request_id);
  else
    workflow_event:=public.append_weekly_review_workflow_event(p_review_period_id,p_expected_workflow_event_id,
      'mixed','stage_reopened',jsonb_build_object('phase','mixed_followups','selectedCount',jsonb_array_length(p_items)),p_request_id);
  end if;
  return jsonb_build_object('workflow_event_id',workflow_event,'opened_count',opened_count,'idempotent',false);
end $$;

revoke execute on function public.open_weekly_mixed_clarifications(uuid,uuid,uuid,jsonb) from public,anon,service_role;
grant execute on function public.open_weekly_mixed_clarifications(uuid,uuid,uuid,jsonb) to authenticated;

create or replace function public.answer_bookkeeping_mixed_use_percentage(
  p_review_issue_id uuid,p_expected_current_event_id uuid,p_expected_current_decision_id uuid,
  p_expected_context_fingerprint text,p_expected_evidence_fingerprint text,p_answer jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare percentage_text text; basis_points integer; authoritative_amount bigint; magnitude bigint;
  business_magnitude bigint; personal_magnitude bigint; result jsonb; answered uuid; source_transaction_id uuid;
  selected_event public.bookkeeping_review_events%rowtype;
begin
  if (select auth.uid()) is null or jsonb_typeof(p_answer)<>'object'
    or (select count(*) from jsonb_object_keys(p_answer))<>2
    or p_answer->'schemaVersion'<>'1'::jsonb or jsonb_typeof(p_answer->'businessPercentage')<>'string'
  then raise exception 'Percentage answer is invalid'; end if;
  percentage_text:=p_answer->>'businessPercentage';
  if percentage_text!~'^(100(?:\.0{1,2})?|(?:[0-9]|[1-9][0-9])(?:\.[0-9]{1,2})?)$'
  then raise exception 'Business percentage must be between 0 and 100 with at most two decimal places'; end if;
  basis_points:=round(percentage_text::numeric*100)::integer;
  select e.* into selected_event from public.bookkeeping_review_events e
    where e.id=p_expected_current_event_id and e.review_issue_id=p_review_issue_id;
  if not found or exists(select 1 from public.bookkeeping_review_events successor where successor.supersedes_event_id=selected_event.id)
    or selected_event.event_type not in('opened','skipped','reopened') or selected_event.reason<>'MIXED_USE_CLARIFICATION'
    or selected_event.based_on_decision_id<>p_expected_current_decision_id
    or selected_event.context_fingerprint<>p_expected_context_fingerprint
    or selected_event.evidence_fingerprint is distinct from p_expected_evidence_fingerprint
    or selected_event.evidence_fingerprint is distinct from public.current_bookkeeping_evidence_fingerprint(selected_event.business_id,selected_event.bookkeeping_record_id)
    or not exists(select 1 from public.businesses b
    where b.id=selected_event.business_id and b.owner_user_id=(select auth.uid()))
  then raise exception 'Review issue is unavailable'; end if;
  select coalesce(t.amount_cents,r.amount_cents),s.financial_transaction_id into authoritative_amount,source_transaction_id
    from public.bookkeeping_records r
    left join public.bookkeeping_financial_sources s on s.business_id=r.business_id and s.bookkeeping_record_id=r.id and s.revoked_at is null
    left join public.financial_transactions t on t.business_id=s.business_id and t.id=s.financial_transaction_id
    where r.id=selected_event.bookkeeping_record_id and r.business_id=selected_event.business_id;
  if authoritative_amount is null or authoritative_amount=0 then raise exception 'A known nonzero amount is required'; end if;
  magnitude:=abs(authoritative_amount); business_magnitude:=floor((magnitude::numeric*basis_points+5000)/10000)::bigint;
  personal_magnitude:=magnitude-business_magnitude;
  if basis_points=10000 then
    result:=public.answer_bookkeeping_mixed_use_all_business(p_review_issue_id,p_expected_current_event_id,
      p_expected_current_decision_id,p_expected_context_fingerprint,p_expected_evidence_fingerprint,
      '{"schemaVersion":1,"scope":"all_business"}'::jsonb);
  elsif basis_points=0 then
    if source_transaction_id is null then raise exception 'Zero percent requires an imported transaction'; end if;
    result:=public.correct_imported_transaction_personal_scope(source_transaction_id,p_expected_current_decision_id,
      gen_random_uuid(),'personal');
    select e.id into answered from public.bookkeeping_review_events e where e.supersedes_event_id=selected_event.id;
    if answered is null then raise exception 'Personal allocation did not resolve the mixed-use issue'; end if;
    result:=result||jsonb_build_object('business_id',selected_event.business_id,
      'answered_event_id',answered,'resolved_event_id',answered,'follow_up_event_id',null);
  else
    if business_magnitude=0 or personal_magnitude=0 then
      raise exception 'That percentage cannot produce a nonzero exact-cent split for this amount'; end if;
    result:=public.answer_bookkeeping_mixed_use_review_issue(p_review_issue_id,p_expected_current_event_id,
      p_expected_current_decision_id,p_expected_context_fingerprint,p_expected_evidence_fingerprint,
      jsonb_build_object('schemaVersion',1,'businessAmountCents',business_magnitude));
  end if;
  answered:=coalesce(answered,(result->>'answered_event_id')::uuid);
  insert into public.bookkeeping_mixed_use_answer_provenance(business_id,bookkeeping_record_id,review_issue_id,
    resulting_review_event_id,input_mode,business_basis_points,business_amount_cents,personal_amount_cents)
  values(selected_event.business_id,selected_event.bookkeeping_record_id,p_review_issue_id,answered,
    'business_percentage',basis_points,case when authoritative_amount<0 then -business_magnitude else business_magnitude end,
    case when authoritative_amount<0 then -personal_magnitude else personal_magnitude end);
  return result||jsonb_build_object('business_basis_points',basis_points,'business_amount_cents',business_magnitude,
    'personal_amount_cents',personal_magnitude);
end $$;

revoke execute on function public.answer_bookkeeping_mixed_use_percentage(uuid,uuid,uuid,text,text,jsonb)
  from public,anon,service_role;
grant execute on function public.answer_bookkeeping_mixed_use_percentage(uuid,uuid,uuid,text,text,jsonb)
  to authenticated;

create or replace function public.enforce_v3_weekly_review_snapshot_readiness()
returns trigger language plpgsql set search_path='' as $$
declare workflow public.bookkeeping_weekly_review_workflow_events%rowtype;
  period public.bookkeeping_review_periods%rowtype;
begin
  select * into workflow from public.bookkeeping_weekly_review_workflow_events w
    where w.business_id=new.business_id and w.review_period_id=new.review_period_id
      and not exists(select 1 from public.bookkeeping_weekly_review_workflow_events successor
        where successor.supersedes_event_id=w.id);
  if workflow.details->>'flowVersion'<>'3' then return new; end if;
  if workflow.stage<>'final' or workflow.event_type<>'stage_completed'
  then raise exception 'Version 3 review workflow is not ready for presentation'; end if;
  select * into period from public.bookkeeping_review_periods
    where id=new.review_period_id and business_id=new.business_id;
  if exists(select 1 from public.bookkeeping_review_events event
    join public.bookkeeping_records record on record.id=event.bookkeeping_record_id
      and record.business_id=event.business_id
    where event.business_id=new.business_id and record.occurred_on between period.period_start and period.period_end
      and event.reason in('BUSINESS_USE_UNCLEAR','MIXED_USE_CLARIFICATION','TRANSACTION_TYPE_UNCLEAR','CONFLICTING_EVIDENCE')
      and event.event_type in('opened','reopened','skipped')
      and not exists(select 1 from public.bookkeeping_review_events successor
        where successor.supersedes_event_id=event.id))
  then raise exception 'Version 3 review has a material unresolved fact'; end if;
  return new;
end $$;

create trigger bookkeeping_review_snapshots_v3_readiness
before insert on public.bookkeeping_review_snapshots for each row
execute function public.enforce_v3_weekly_review_snapshot_readiness();

revoke execute on function public.enforce_v3_weekly_review_snapshot_readiness() from public,anon,authenticated,service_role;

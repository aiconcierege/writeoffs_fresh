-- Let customers acknowledge an outstanding receipt request without resolving it,
-- and let v3 move beyond Documentation while ordinary documentation remains open.

alter table public.bookkeeping_documentation_events
  drop constraint bookkeeping_documentation_events_type_check;
alter table public.bookkeeping_documentation_events
  add constraint bookkeeping_documentation_events_type_check check (
    event_type in ('request_opened','acknowledged_pending','receipt_lost',
      'evidence_attached','resolved','reopened')
  ),
  add column request_id uuid;
create unique index bookkeeping_documentation_events_request_id_idx
  on public.bookkeeping_documentation_events(business_id,request_id)
  where request_id is not null;

create or replace function public.validate_bookkeeping_documentation_event()
returns trigger language plpgsql set search_path='' as $$
declare predecessor public.bookkeeping_documentation_events%rowtype;
begin
  if new.actor_user_id is not null and not exists(select 1 from public.businesses
    where id=new.business_id and owner_user_id=new.actor_user_id)
  then raise exception 'documentation event actor does not own Business'; end if;
  if new.supersedes_event_id is null then
    if new.event_type<>'request_opened' or new.sequence_number<>1
      or new.documentation_issue_id<>new.id or new.provenance not in('automation','system')
      or new.assertion_payload is not null or new.question_context is null
      or new.bookkeeping_document_link_id is not null or new.evidence_satisfies_request is not null
      or new.request_id is not null
    then raise exception 'documentation issue must begin with one trusted request'; end if;
    return new;
  end if;
  select * into predecessor from public.bookkeeping_documentation_events
    where id=new.supersedes_event_id and business_id=new.business_id
      and bookkeeping_record_id=new.bookkeeping_record_id
      and documentation_issue_id=new.documentation_issue_id for update;
  if not found then raise exception 'documentation predecessor is unavailable'; end if;
  if exists(select 1 from public.bookkeeping_documentation_events where supersedes_event_id=predecessor.id)
  then raise exception 'documentation history must supersede its current leaf'; end if;
  if new.sequence_number<>predecessor.sequence_number+1 or new.reason<>predecessor.reason
    or new.issue_key<>predecessor.issue_key
  then raise exception 'documentation issue identity and ordering are immutable'; end if;
  if new.event_type='acknowledged_pending' then
    if predecessor.event_type not in('request_opened','reopened','evidence_attached')
      or (predecessor.event_type='evidence_attached' and predecessor.evidence_satisfies_request)
      or new.provenance<>'user' or new.actor_user_id is null or new.request_id is null
      or new.context_fingerprint<>predecessor.context_fingerprint
      or new.evidence_fingerprint<>predecessor.evidence_fingerprint
      or new.question_context is distinct from predecessor.question_context
      or new.assertion_payload<>'{"schemaVersion":1,"assertion":"receipt_expected_later"}'::jsonb
      or new.bookkeeping_document_link_id is not null or new.evidence_satisfies_request is not null
    then raise exception 'pending documentation acknowledgement is invalid'; end if;
  elsif new.event_type='receipt_lost' then
    if predecessor.event_type not in('request_opened','reopened','evidence_attached')
      or (predecessor.event_type='evidence_attached' and predecessor.evidence_satisfies_request)
      or new.provenance<>'user' or new.actor_user_id is null
      or new.context_fingerprint<>predecessor.context_fingerprint
      or new.evidence_fingerprint<>predecessor.evidence_fingerprint
      or new.question_context is distinct from predecessor.question_context
      or new.assertion_payload<>'{"schemaVersion":1,"assertion":"receipt_lost"}'::jsonb
      or new.request_id is not null
    then raise exception 'Receipt Lost must be one exact user assertion on the outstanding request'; end if;
  elsif new.event_type='evidence_attached' then
    if predecessor.event_type not in('request_opened','reopened','resolved','evidence_attached','acknowledged_pending')
      or (predecessor.event_type='evidence_attached' and predecessor.evidence_satisfies_request)
      or new.provenance not in('automation','system','user')
      or new.question_context is distinct from predecessor.question_context
      or new.context_fingerprint<>predecessor.context_fingerprint
      or new.evidence_fingerprint=predecessor.evidence_fingerprint
      or new.assertion_payload<>jsonb_build_object('schemaVersion',1,'observation','document_linked',
        'satisfiesRequirement',new.evidence_satisfies_request)
      or not exists(select 1 from public.bookkeeping_document_links links
        where links.id=new.bookkeeping_document_link_id and links.business_id=new.business_id
          and links.bookkeeping_record_id=new.bookkeeping_record_id and links.revoked_at is null)
      or new.request_id is not null
    then raise exception 'documentation evidence observation is invalid'; end if;
  elsif new.event_type='resolved' then
    if predecessor.event_type not in('receipt_lost','evidence_attached')
      or (predecessor.event_type='evidence_attached' and not predecessor.evidence_satisfies_request)
      or new.provenance<>'system' or new.assertion_payload is not null
      or new.context_fingerprint<>predecessor.context_fingerprint
      or new.evidence_fingerprint<>predecessor.evidence_fingerprint
      or new.question_context is distinct from predecessor.question_context or new.request_id is not null
    then raise exception 'documentation resolution must preserve its supported context'; end if;
  elsif new.event_type='reopened' then
    if predecessor.event_type='acknowledged_pending' then
      if new.provenance<>'system' or new.assertion_payload is not null
        or new.context_fingerprint<>predecessor.context_fingerprint
        or new.evidence_fingerprint<>predecessor.evidence_fingerprint
        or new.question_context is distinct from predecessor.question_context
      then raise exception 'pending documentation continuation is invalid'; end if;
    elsif predecessor.event_type not in('resolved','evidence_attached')
      or (predecessor.event_type='evidence_attached' and predecessor.evidence_satisfies_request)
      or new.provenance not in('automation','system') or new.assertion_payload is not null
      or new.question_context is null or new.context_fingerprint=predecessor.context_fingerprint
      or new.evidence_fingerprint=predecessor.evidence_fingerprint
    then raise exception 'reopen requires materially new context and evidence'; end if;
    if new.request_id is not null then raise exception 'reopened documentation cannot claim a request id'; end if;
  else raise exception 'unsupported documentation lifecycle transition';
  end if;
  return new;
end $$;

create or replace function public.list_current_bookkeeping_documentation_requests(p_business_id uuid)
returns setof public.bookkeeping_documentation_events language sql stable set search_path='' as $$
  select events.* from public.bookkeeping_documentation_events events
  where events.business_id=p_business_id and (
    events.event_type in('request_opened','reopened','acknowledged_pending')
    or (events.event_type='evidence_attached' and not events.evidence_satisfies_request))
    and not exists(select 1 from public.bookkeeping_documentation_events successors
      where successors.supersedes_event_id=events.id)
  order by events.created_at,events.id
$$;

create function public.acknowledge_weekly_documentation_pending(
  p_review_period_id uuid,p_expected_workflow_event_id uuid,p_request_id uuid,
  p_financial_transaction_id uuid,p_expected_current_decision_id uuid,
  p_expected_documentation_event_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare selected_business uuid; period public.bookkeeping_review_periods%rowtype;
  workflow public.bookkeeping_weekly_review_workflow_events%rowtype;
  selected_record public.bookkeeping_records%rowtype; decision public.bookkeeping_decisions%rowtype;
  documentation public.bookkeeping_documentation_events%rowtype; inserted uuid;
begin
  if (select auth.uid()) is null then raise exception 'authentication required'; end if;
  if p_request_id is null then raise exception 'request id is required'; end if;
  select id into selected_business from public.businesses where owner_user_id=(select auth.uid());
  if selected_business is null then raise exception 'Business was not found'; end if;
  select id into inserted from public.bookkeeping_documentation_events
    where business_id=selected_business and request_id=p_request_id;
  if inserted is not null then return jsonb_build_object('documentation_event_id',inserted,'idempotent',true); end if;
  select * into period from public.bookkeeping_review_periods
    where id=p_review_period_id and business_id=selected_business;
  if not found then raise exception 'Review period was not found'; end if;
  perform pg_advisory_xact_lock(hashtextextended('weekly-documentation:'||p_review_period_id::text,0));
  select * into workflow from public.bookkeeping_weekly_review_workflow_events event
    where event.id=p_expected_workflow_event_id and event.business_id=selected_business
      and event.review_period_id=p_review_period_id and not exists(select 1
        from public.bookkeeping_weekly_review_workflow_events successor
        where successor.supersedes_event_id=event.id) for update;
  if not found or workflow.details->>'flowVersion'<>'3' or not(
    (workflow.stage='mixed' and workflow.event_type='stage_completed')
    or (workflow.stage='documentation' and workflow.event_type='stage_reopened'))
  then raise exception 'Review is not accepting documentation answers'; end if;
  select record.* into selected_record from public.bookkeeping_records record
  join public.bookkeeping_financial_sources source on source.bookkeeping_record_id=record.id
    and source.business_id=record.business_id and source.revoked_at is null
  join public.financial_transactions financial on financial.id=source.financial_transaction_id
    and financial.business_id=source.business_id
  where record.business_id=selected_business and financial.id=p_financial_transaction_id
    and record.source_kind='financial_transaction'
    and record.occurred_on between period.period_start and period.period_end;
  if not found then raise exception 'Documentation activity is outside this review'; end if;
  if (select count(*) from public.bookkeeping_financial_sources source
    where source.business_id=selected_business and source.bookkeeping_record_id=selected_record.id
      and source.revoked_at is null)<>1
  then raise exception 'Documentation activity has an unsupported source structure'; end if;
  select * into decision from public.bookkeeping_decisions item
    where item.id=p_expected_current_decision_id and item.business_id=selected_business
      and item.bookkeeping_record_id=selected_record.id and not exists(select 1
        from public.bookkeeping_decisions successor where successor.supersedes_decision_id=item.id) for update;
  if not found then raise exception 'stale current bookkeeping decision'; end if;
  if decision.bookkeeping_nature<>'expense' or decision.treatment not in('business','mixed_use')
  then raise exception 'Only an established business purchase can be acknowledged'; end if;
  if exists(select 1 from public.bookkeeping_document_links link where link.business_id=selected_business
    and link.bookkeeping_record_id=selected_record.id and link.revoked_at is null)
  then raise exception 'Supporting documentation is already attached'; end if;
  select * into documentation from public.bookkeeping_documentation_events event
    where event.id=p_expected_documentation_event_id and event.business_id=selected_business
      and event.bookkeeping_record_id=selected_record.id
      and (event.event_type in('request_opened','reopened')
        or (event.event_type='evidence_attached' and not event.evidence_satisfies_request))
      and not exists(select 1 from public.bookkeeping_documentation_events successor
        where successor.supersedes_event_id=event.id) for update;
  if not found then raise exception 'Current documentation event changed'; end if;
  if documentation.evidence_fingerprint<>public.current_bookkeeping_evidence_fingerprint(
    selected_business,selected_record.id)
  then raise exception 'canonical evidence changed; documentation request requires reevaluation'; end if;
  insert into public.bookkeeping_documentation_events(business_id,bookkeeping_record_id,
    documentation_issue_id,supersedes_event_id,sequence_number,event_type,reason,issue_key,
    context_fingerprint,evidence_fingerprint,question_context,assertion_payload,provenance,
    actor_user_id,request_id)
  values(selected_business,selected_record.id,documentation.documentation_issue_id,documentation.id,
    documentation.sequence_number+1,'acknowledged_pending',documentation.reason,documentation.issue_key,
    documentation.context_fingerprint,documentation.evidence_fingerprint,documentation.question_context,
    '{"schemaVersion":1,"assertion":"receipt_expected_later"}'::jsonb,'user',(select auth.uid()),p_request_id)
  returning id into inserted;
  return jsonb_build_object('documentation_event_id',inserted,'idempotent',false);
end $$;

revoke execute on function public.acknowledge_weekly_documentation_pending(uuid,uuid,uuid,uuid,uuid,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.acknowledge_weekly_documentation_pending(uuid,uuid,uuid,uuid,uuid,uuid)
  to authenticated;

create function public.complete_weekly_documentation_stage_v3(
  p_review_period_id uuid,p_expected_workflow_event_id uuid,p_request_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare selected_business uuid; period public.bookkeeping_review_periods%rowtype;
  workflow public.bookkeeping_weekly_review_workflow_events%rowtype; inserted uuid; open_count integer;
begin
  if (select auth.uid()) is null then raise exception 'authentication required'; end if;
  select id into selected_business from public.businesses where owner_user_id=(select auth.uid());
  if selected_business is null then raise exception 'Business was not found'; end if;
  select id into inserted from public.bookkeeping_weekly_review_workflow_events
    where business_id=selected_business and review_period_id=p_review_period_id
      and request_id=p_request_id and stage='documentation' and event_type='stage_completed';
  if inserted is not null then return inserted; end if;
  select * into period from public.bookkeeping_review_periods
    where id=p_review_period_id and business_id=selected_business;
  if not found then raise exception 'Review period was not found'; end if;
  select * into workflow from public.bookkeeping_weekly_review_workflow_events event
    where event.id=p_expected_workflow_event_id and event.business_id=selected_business
      and event.review_period_id=p_review_period_id and not exists(select 1
        from public.bookkeeping_weekly_review_workflow_events successor
        where successor.supersedes_event_id=event.id);
  if not found or workflow.details->>'flowVersion'<>'3' or not(
    (workflow.stage='mixed' and workflow.event_type='stage_completed')
    or (workflow.stage='documentation' and workflow.event_type='stage_reopened'))
  then raise exception 'Review is not ready to complete Documentation'; end if;
  if exists(select 1 from public.bookkeeping_review_events issue
    join public.bookkeeping_records record on record.id=issue.bookkeeping_record_id
      and record.business_id=issue.business_id
    where issue.business_id=selected_business
      and record.occurred_on between period.period_start and period.period_end
      and issue.reason='MIXED_USE_CLARIFICATION' and issue.event_type in('opened','reopened','skipped')
      and not exists(select 1 from public.bookkeeping_review_events successor
        where successor.supersedes_event_id=issue.id))
  then raise exception 'An earlier Activity fact is still unresolved'; end if;
  select count(*) into open_count from public.list_current_bookkeeping_documentation_requests(selected_business) event
    join public.bookkeeping_records record on record.id=event.bookkeeping_record_id
      and record.business_id=event.business_id
    where record.occurred_on between period.period_start and period.period_end;
  inserted:=public.append_weekly_review_workflow_event(p_review_period_id,p_expected_workflow_event_id,
    'documentation','stage_completed',jsonb_build_object('completionMeaning','reviewed_for_now',
      'outstandingDocumentationCount',open_count),p_request_id);
  return inserted;
end $$;

revoke execute on function public.complete_weekly_documentation_stage_v3(uuid,uuid,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.complete_weekly_documentation_stage_v3(uuid,uuid,uuid) to authenticated;

-- Preserve the receipt-unavailable path after an acknowledgement by resuming the
-- same outstanding issue inside the atomic attestation transaction.
alter function public.attest_weekly_receipt_unavailable(uuid,uuid,uuid,uuid,uuid,uuid,text)
  rename to attest_weekly_receipt_unavailable_before_pending;
revoke execute on function public.attest_weekly_receipt_unavailable_before_pending(uuid,uuid,uuid,uuid,uuid,uuid,text)
  from public,anon,authenticated,service_role;

create function public.attest_weekly_receipt_unavailable(
  p_review_period_id uuid,p_expected_workflow_event_id uuid,p_request_id uuid,
  p_financial_transaction_id uuid,p_expected_current_decision_id uuid,
  p_expected_documentation_event_id uuid,p_business_use text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare pending public.bookkeeping_documentation_events%rowtype; resumed uuid; selected_business uuid;
begin
  if (select auth.uid()) is null then raise exception 'authentication required'; end if;
  select id into selected_business from public.businesses where owner_user_id=(select auth.uid());
  if selected_business is null then raise exception 'Business was not found'; end if;
  select * into pending from public.bookkeeping_documentation_events event
    where event.id=p_expected_documentation_event_id and event.event_type='acknowledged_pending'
      and event.business_id=selected_business
      and not exists(select 1 from public.bookkeeping_documentation_events successor
        where successor.supersedes_event_id=event.id);
  if found then
    insert into public.bookkeeping_documentation_events(business_id,bookkeeping_record_id,
      documentation_issue_id,supersedes_event_id,sequence_number,event_type,reason,issue_key,
      context_fingerprint,evidence_fingerprint,question_context,provenance)
    values(pending.business_id,pending.bookkeeping_record_id,pending.documentation_issue_id,pending.id,
      pending.sequence_number+1,'reopened',pending.reason,pending.issue_key,pending.context_fingerprint,
      pending.evidence_fingerprint,pending.question_context,'system') returning id into resumed;
  else resumed:=p_expected_documentation_event_id; end if;
  return public.attest_weekly_receipt_unavailable_before_pending(p_review_period_id,
    p_expected_workflow_event_id,p_request_id,p_financial_transaction_id,
    p_expected_current_decision_id,resumed,p_business_use);
end $$;

revoke execute on function public.attest_weekly_receipt_unavailable(uuid,uuid,uuid,uuid,uuid,uuid,text)
  from public,anon,authenticated,service_role;
grant execute on function public.attest_weekly_receipt_unavailable(uuid,uuid,uuid,uuid,uuid,uuid,text)
  to authenticated;

comment on function public.acknowledge_weekly_documentation_pending(uuid,uuid,uuid,uuid,uuid,uuid) is
  'Records that an authenticated customer expects to add one currently requested receipt later; the request stays outstanding.';
comment on function public.complete_weekly_documentation_stage_v3(uuid,uuid,uuid) is
  'Completes the v3 Documentation conversation for now without resolving ordinary outstanding documentation requests.';

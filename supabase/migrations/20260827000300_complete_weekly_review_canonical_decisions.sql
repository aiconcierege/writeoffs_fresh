-- Canonical customer exceptions needed by transaction-first Weekly Review.
-- Source transactions remain immutable; every customer choice appends history.

alter table public.bookkeeping_decisions drop constraint bookkeeping_decisions_resolved_nature_check;
alter table public.bookkeeping_decisions add constraint bookkeeping_decisions_resolved_nature_check check (
  treatment='unresolved' or bookkeeping_nature is not null or treatment in ('personal','excluded')
);

create table public.bookkeeping_weekly_documentation_batches (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  review_period_id uuid not null,
  decision text not null check(decision in ('include_missing','exclude_missing','no_missing')),
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  request_id uuid not null,
  created_at timestamptz not null default now(),
  unique(id,business_id,review_period_id), unique(business_id,request_id),
  foreign key(review_period_id,business_id) references public.bookkeeping_review_periods(id,business_id) on delete restrict
);
create table public.bookkeeping_weekly_documentation_batch_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  review_period_id uuid not null,
  batch_id uuid not null,
  bookkeeping_record_id uuid not null,
  prior_decision_id uuid not null,
  resulting_decision_id uuid not null,
  receipt_lost_event_id uuid not null references public.bookkeeping_documentation_events(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique(batch_id,bookkeeping_record_id),
  foreign key(batch_id,business_id,review_period_id)
    references public.bookkeeping_weekly_documentation_batches(id,business_id,review_period_id) on delete restrict,
  foreign key(prior_decision_id,business_id,bookkeeping_record_id)
    references public.bookkeeping_decisions(id,business_id,bookkeeping_record_id) on delete restrict,
  foreign key(resulting_decision_id,business_id,bookkeeping_record_id)
    references public.bookkeeping_decisions(id,business_id,bookkeeping_record_id) on delete restrict,
  foreign key(bookkeeping_record_id,business_id) references public.bookkeeping_records(id,business_id) on delete restrict
);
create table public.bookkeeping_scope_decision_question_links (
  id uuid primary key default gen_random_uuid(), business_id uuid not null,
  bookkeeping_record_id uuid not null, scope_decision_id uuid not null,
  prior_review_event_id uuid not null references public.bookkeeping_review_events(id) on delete restrict,
  resolved_review_event_id uuid not null references public.bookkeeping_review_events(id) on delete restrict,
  created_at timestamptz not null default now(), unique(scope_decision_id,prior_review_event_id),
  foreign key(scope_decision_id,business_id,bookkeeping_record_id)
    references public.bookkeeping_decisions(id,business_id,bookkeeping_record_id) on delete restrict,
  foreign key(bookkeeping_record_id,business_id) references public.bookkeeping_records(id,business_id) on delete restrict
);
create trigger bookkeeping_weekly_documentation_batches_immutable before update or delete
  on public.bookkeeping_weekly_documentation_batches for each row execute function public.reject_weekly_review_history_mutation();
create trigger bookkeeping_weekly_documentation_batch_items_immutable before update or delete
  on public.bookkeeping_weekly_documentation_batch_items for each row execute function public.reject_weekly_review_history_mutation();
create trigger bookkeeping_scope_decision_question_links_immutable before update or delete
  on public.bookkeeping_scope_decision_question_links for each row execute function public.reject_weekly_review_history_mutation();

create or replace function public.correct_imported_transaction_personal_scope(
  p_financial_transaction_id uuid,p_expected_current_decision_id uuid,
  p_correction_request_id uuid,p_action text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare selected_business uuid; selected_record public.bookkeeping_records%rowtype;
  current_decision public.bookkeeping_decisions%rowtype; prior_decision public.bookkeeping_decisions%rowtype;
  new_decision public.bookkeeping_decisions%rowtype; existing public.bookkeeping_decisions%rowtype;
  source_amount bigint; allocation public.bookkeeping_allocations%rowtype; issue public.bookkeeping_review_events%rowtype;
  resolved_issue_id uuid; question_link public.bookkeeping_scope_decision_question_links%rowtype;
begin
  select id into selected_business from public.businesses where owner_user_id=(select auth.uid());
  if selected_business is null then raise exception 'Business was not found'; end if;
  if p_action not in ('personal','restore_previous') then raise exception 'Personal correction action is invalid'; end if;
  select * into existing from public.bookkeeping_decisions where business_id=selected_business
    and correction_request_id=p_correction_request_id;
  if found then return jsonb_build_object('decision_id',existing.id,'bookkeeping_record_id',existing.bookkeeping_record_id,'idempotent',true); end if;
  select record.* into selected_record
    from public.bookkeeping_records record join public.bookkeeping_financial_sources source
      on source.bookkeeping_record_id=record.id and source.business_id=record.business_id and source.revoked_at is null
    join public.financial_transactions transaction on transaction.id=source.financial_transaction_id and transaction.business_id=source.business_id
    where transaction.id=p_financial_transaction_id and transaction.business_id=selected_business
      and record.source_kind='financial_transaction';
  if selected_record.id is null then raise exception 'Eligible imported activity was not found'; end if;
  select amount_cents into source_amount from public.financial_transactions
    where id=p_financial_transaction_id and business_id=selected_business;
  if source_amount=0 then raise exception 'Eligible imported activity was not found'; end if;
  perform pg_advisory_xact_lock(hashtextextended('bookkeeping-record:'||selected_record.id::text,0));
  select * into current_decision from public.bookkeeping_decisions decision where decision.business_id=selected_business
    and decision.bookkeeping_record_id=selected_record.id and not exists(select 1 from public.bookkeeping_decisions successor
      where successor.supersedes_decision_id=decision.id) for update;
  if current_decision.id is distinct from p_expected_current_decision_id then raise exception 'stale current bookkeeping decision'; end if;
  if p_action='personal' then
    if current_decision.treatment='personal' then raise exception 'Activity is already personal'; end if;
    insert into public.bookkeeping_decisions(business_id,bookkeeping_record_id,supersedes_decision_id,bookkeeping_nature,
      treatment,review_status,provenance,actor_user_id,reason,business_purpose,correction_request_id)
    values(selected_business,selected_record.id,current_decision.id,current_decision.bookkeeping_nature,'personal','resolved',
      'user',(select auth.uid()),'Customer identified this imported activity as personal.',current_decision.business_purpose,p_correction_request_id)
    returning * into new_decision;
    insert into public.bookkeeping_allocations(business_id,bookkeeping_record_id,bookkeeping_decision_id,allocation_kind,amount_cents)
      values(selected_business,selected_record.id,new_decision.id,'personal',source_amount);
    for issue in select event.* from public.bookkeeping_review_events event where event.business_id=selected_business
      and event.bookkeeping_record_id=selected_record.id and event.event_type in('opened','skipped','reopened')
      and not exists(select 1 from public.bookkeeping_review_events successor where successor.supersedes_event_id=event.id)
      for update
    loop
      insert into public.bookkeeping_review_events(business_id,bookkeeping_record_id,review_issue_id,supersedes_event_id,
        sequence_number,event_type,reason,based_on_decision_id,issue_key,context_fingerprint,evidence_fingerprint,
        question_context,provenance)
      values(issue.business_id,issue.bookkeeping_record_id,issue.review_issue_id,issue.id,issue.sequence_number+1,'resolved',
        issue.reason,issue.based_on_decision_id,issue.issue_key,issue.context_fingerprint,issue.evidence_fingerprint,
        issue.question_context,'system') returning id into resolved_issue_id;
      insert into public.bookkeeping_scope_decision_question_links(business_id,bookkeeping_record_id,scope_decision_id,
        prior_review_event_id,resolved_review_event_id) values(selected_business,selected_record.id,new_decision.id,issue.id,resolved_issue_id);
    end loop;
  else
    if current_decision.treatment<>'personal' or current_decision.provenance<>'user' then raise exception 'Only a customer personal decision can be restored'; end if;
    select * into prior_decision from public.bookkeeping_decisions where id=current_decision.supersedes_decision_id;
    if prior_decision.id is null then raise exception 'Prior bookkeeping decision is unavailable'; end if;
    insert into public.bookkeeping_decisions(business_id,bookkeeping_record_id,supersedes_decision_id,bookkeeping_nature,
      treatment,review_status,provenance,actor_user_id,reason,business_purpose,correction_request_id)
    values(selected_business,selected_record.id,current_decision.id,prior_decision.bookkeeping_nature,prior_decision.treatment,
      prior_decision.review_status,'user',(select auth.uid()),'Customer reversed the prior personal decision.',
      prior_decision.business_purpose,p_correction_request_id) returning * into new_decision;
    for allocation in select * from public.bookkeeping_allocations where bookkeeping_decision_id=prior_decision.id loop
      insert into public.bookkeeping_allocations(business_id,bookkeeping_record_id,bookkeeping_decision_id,allocation_kind,
        amount_cents,tax_category_key,memo) values(selected_business,selected_record.id,new_decision.id,allocation.allocation_kind,
        allocation.amount_cents,allocation.tax_category_key,allocation.memo);
    end loop;
    for question_link in select link.* from public.bookkeeping_scope_decision_question_links link
      where link.scope_decision_id=current_decision.id for update
    loop
      select event.* into issue from public.bookkeeping_review_events event where event.id=question_link.resolved_review_event_id
        and not exists(select 1 from public.bookkeeping_review_events successor
          where successor.supersedes_event_id=event.id) for update;
      if issue.id is null then continue;end if;
      insert into public.bookkeeping_review_events(business_id,bookkeeping_record_id,review_issue_id,supersedes_event_id,
        sequence_number,event_type,reason,based_on_decision_id,issue_key,context_fingerprint,evidence_fingerprint,
        question_context,provenance)
      values(issue.business_id,issue.bookkeeping_record_id,issue.review_issue_id,issue.id,issue.sequence_number+1,'reopened',
        issue.reason,new_decision.id,issue.issue_key,md5(issue.context_fingerprint||':'||new_decision.id::text),
        issue.evidence_fingerprint,issue.question_context,'system');
    end loop;
  end if;
  return jsonb_build_object('decision_id',new_decision.id,'bookkeeping_record_id',selected_record.id,'idempotent',false);
end $$;

create or replace function public.complete_weekly_personal_sweep(
 p_review_period_id uuid,p_expected_workflow_event_id uuid,p_request_id uuid,p_items jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare selected_business uuid; existing_event uuid; item jsonb; result jsonb; workflow_event uuid;
 period public.bookkeeping_review_periods%rowtype;
begin
 select id into selected_business from public.businesses where owner_user_id=(select auth.uid());
 if selected_business is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)>500
  then raise exception 'Personal sweep is invalid';end if;
 select id into existing_event from public.bookkeeping_weekly_review_workflow_events
  where business_id=selected_business and request_id=p_request_id;
 if existing_event is not null then return jsonb_build_object('workflow_event_id',existing_event,'idempotent',true);end if;
 select * into period from public.bookkeeping_review_periods where id=p_review_period_id and business_id=selected_business;
 if not found then raise exception 'Review period was not found';end if;
 perform pg_advisory_xact_lock(hashtextextended('weekly-personal:'||p_review_period_id::text,0));
 for item in select value from jsonb_array_elements(p_items) loop
  if item->>'use'<>'personal' then raise exception 'Personal sweep contains an unsupported decision';end if;
  if not exists(select 1 from public.financial_transactions transaction where transaction.id=(item->>'transactionId')::uuid
    and transaction.business_id=selected_business and transaction.transaction_date between period.period_start and period.period_end)
    then raise exception 'Personal sweep activity is outside this review';end if;
  result:=public.correct_imported_transaction_personal_scope((item->>'transactionId')::uuid,
   (item->>'decisionId')::uuid,(item->>'correctionRequestId')::uuid,'personal');
 end loop;
 workflow_event:=public.append_weekly_review_workflow_event(p_review_period_id,p_expected_workflow_event_id,
  'personal','stage_completed',jsonb_build_object('changeCount',jsonb_array_length(p_items)),p_request_id);
 return jsonb_build_object('workflow_event_id',workflow_event,'idempotent',false);
end $$;

create or replace function public.restore_documentation_excluded_transaction(
  p_financial_transaction_id uuid,p_expected_current_decision_id uuid,p_correction_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare selected_business uuid; record_id uuid; current_decision public.bookkeeping_decisions%rowtype;
 prior_decision public.bookkeeping_decisions%rowtype; new_decision public.bookkeeping_decisions%rowtype;
 existing public.bookkeeping_decisions%rowtype; allocation public.bookkeeping_allocations%rowtype;
 question_link public.bookkeeping_scope_decision_question_links%rowtype; issue public.bookkeeping_review_events%rowtype;
begin
 select id into selected_business from public.businesses where owner_user_id=(select auth.uid());
 select * into existing from public.bookkeeping_decisions where business_id=selected_business and correction_request_id=p_correction_request_id;
 if found then return jsonb_build_object('decision_id',existing.id,'bookkeeping_record_id',existing.bookkeeping_record_id,'idempotent',true);end if;
 select source.bookkeeping_record_id into record_id from public.bookkeeping_financial_sources source
  where source.business_id=selected_business and source.financial_transaction_id=p_financial_transaction_id and source.revoked_at is null;
 perform pg_advisory_xact_lock(hashtextextended('bookkeeping-record:'||record_id::text,0));
 select * into current_decision from public.bookkeeping_decisions decision where decision.id=p_expected_current_decision_id
  and decision.business_id=selected_business and decision.bookkeeping_record_id=record_id and decision.treatment='excluded'
  and not exists(select 1 from public.bookkeeping_decisions successor where successor.supersedes_decision_id=decision.id) for update;
 if not found then raise exception 'Current documentation exclusion changed';end if;
 select * into prior_decision from public.bookkeeping_decisions where id=current_decision.supersedes_decision_id;
 if prior_decision.id is null then raise exception 'Prior decision is unavailable';end if;
 insert into public.bookkeeping_decisions(business_id,bookkeeping_record_id,supersedes_decision_id,bookkeeping_nature,treatment,
  review_status,provenance,actor_user_id,reason,business_purpose,correction_request_id)
 values(selected_business,record_id,current_decision.id,prior_decision.bookkeeping_nature,prior_decision.treatment,
  prior_decision.review_status,'user',(select auth.uid()),'Customer reversed the missing-documentation exclusion.',
  prior_decision.business_purpose,p_correction_request_id) returning * into new_decision;
 for allocation in select * from public.bookkeeping_allocations where bookkeeping_decision_id=prior_decision.id loop
  insert into public.bookkeeping_allocations(business_id,bookkeeping_record_id,bookkeeping_decision_id,allocation_kind,
   amount_cents,tax_category_key,memo) values(selected_business,record_id,new_decision.id,allocation.allocation_kind,
   allocation.amount_cents,allocation.tax_category_key,allocation.memo);end loop;
 for question_link in select link.* from public.bookkeeping_scope_decision_question_links link
  where link.scope_decision_id=current_decision.id for update loop
  select event.* into issue from public.bookkeeping_review_events event where event.id=question_link.resolved_review_event_id
   and not exists(select 1 from public.bookkeeping_review_events successor where successor.supersedes_event_id=event.id) for update;
  if issue.id is not null then insert into public.bookkeeping_review_events(business_id,bookkeeping_record_id,review_issue_id,
   supersedes_event_id,sequence_number,event_type,reason,based_on_decision_id,issue_key,context_fingerprint,
   evidence_fingerprint,question_context,provenance)
   values(issue.business_id,issue.bookkeeping_record_id,issue.review_issue_id,issue.id,issue.sequence_number+1,'reopened',
    issue.reason,new_decision.id,issue.issue_key,md5(issue.context_fingerprint||':'||new_decision.id::text),
    issue.evidence_fingerprint,issue.question_context,'system');end if;
 end loop;
 return jsonb_build_object('decision_id',new_decision.id,'bookkeeping_record_id',record_id,'idempotent',false);
end $$;

create or replace function public.complete_weekly_missing_documentation_decision(
 p_review_period_id uuid,p_expected_workflow_event_id uuid,p_request_id uuid,p_decision text,p_record_ids uuid[],
 p_complete_stage boolean default true)
returns jsonb language plpgsql security definer set search_path='' as $$
declare selected_business uuid; period public.bookkeeping_review_periods%rowtype; batch_id uuid; workflow_event_id uuid;
 record_id uuid; selected_record_doc public.bookkeeping_records%rowtype; current_decision public.bookkeeping_decisions%rowtype;
 new_decision public.bookkeeping_decisions%rowtype; documentation public.bookkeeping_documentation_events%rowtype;
 documentation_result jsonb; item_request uuid; issue public.bookkeeping_review_events%rowtype; resolved_issue_id uuid;
begin
 select id into selected_business from public.businesses where owner_user_id=(select auth.uid());
 if selected_business is null then raise exception 'Business was not found';end if;
 select id into batch_id from public.bookkeeping_weekly_documentation_batches where business_id=selected_business and request_id=p_request_id;
 if batch_id is not null then select id into workflow_event_id from public.bookkeeping_weekly_review_workflow_events
   where business_id=selected_business and request_id=p_request_id;return jsonb_build_object('batch_id',batch_id,'workflow_event_id',workflow_event_id,'idempotent',true);end if;
 if p_decision not in('include_missing','exclude_missing','no_missing')
  or (p_decision='no_missing' and cardinality(p_record_ids)<>0)
  or (p_decision<>'no_missing' and coalesce(array_length(p_record_ids,1),0)=0)
  or cardinality(p_record_ids)<>cardinality(array(select distinct unnest(p_record_ids))) then raise exception 'Documentation decision set is invalid';end if;
 select * into period from public.bookkeeping_review_periods where id=p_review_period_id and business_id=selected_business;
 if not found then raise exception 'Review period was not found';end if;
 perform pg_advisory_xact_lock(hashtextextended('weekly-documentation:'||p_review_period_id::text,0));
 if p_decision='no_missing' and exists(select 1 from public.bookkeeping_records r
   join public.bookkeeping_decisions d on d.bookkeeping_record_id=r.id and d.business_id=r.business_id
   join public.bookkeeping_documentation_events e on e.bookkeeping_record_id=r.id and e.business_id=r.business_id
   where r.business_id=selected_business and r.occurred_on between period.period_start and period.period_end
    and d.bookkeeping_nature='expense' and d.treatment in('business','mixed_use')
    and not exists(select 1 from public.bookkeeping_decisions ds where ds.supersedes_decision_id=d.id)
    and e.event_type in('request_opened','reopened','evidence_attached')
    and not exists(select 1 from public.bookkeeping_documentation_events es where es.supersedes_event_id=e.id)
    and not exists(select 1 from public.bookkeeping_document_links l where l.bookkeeping_record_id=r.id and l.business_id=r.business_id and l.revoked_at is null))
 then raise exception 'Missing documentation decisions remain';end if;
 if p_complete_stage and p_decision<>'no_missing' and exists(select 1 from public.bookkeeping_records r
   join public.bookkeeping_decisions d on d.bookkeeping_record_id=r.id and d.business_id=r.business_id
   join public.bookkeeping_documentation_events e on e.bookkeeping_record_id=r.id and e.business_id=r.business_id
   where r.business_id=selected_business and r.occurred_on between period.period_start and period.period_end
    and d.bookkeeping_nature='expense' and d.treatment in('business','mixed_use')
    and not exists(select 1 from public.bookkeeping_decisions ds where ds.supersedes_decision_id=d.id)
    and e.event_type in('request_opened','reopened','evidence_attached')
    and not exists(select 1 from public.bookkeeping_documentation_events es where es.supersedes_event_id=e.id)
    and not exists(select 1 from public.bookkeeping_document_links l where l.bookkeeping_record_id=r.id and l.business_id=r.business_id and l.revoked_at is null)
    and not(r.id=any(p_record_ids))) then raise exception 'Documentation decisions are incomplete for this review';end if;
 insert into public.bookkeeping_weekly_documentation_batches(business_id,review_period_id,decision,actor_user_id,request_id)
 values(selected_business,p_review_period_id,p_decision,(select auth.uid()),p_request_id) returning id into batch_id;
 foreach record_id in array p_record_ids loop
  select * into selected_record_doc from public.bookkeeping_records where id=record_id and business_id=selected_business
   and occurred_on between period.period_start and period.period_end for update;
  if selected_record_doc.id is null then raise exception 'Documentation activity is outside this review';end if;
  select * into current_decision from public.bookkeeping_decisions decision where decision.business_id=selected_business
   and decision.bookkeeping_record_id=selected_record_doc.id and decision.bookkeeping_nature='expense' and decision.treatment in('business','mixed_use')
   and not exists(select 1 from public.bookkeeping_decisions successor where successor.supersedes_decision_id=decision.id) for update;
  if current_decision.id is null or exists(select 1 from public.bookkeeping_document_links link where link.business_id=selected_business
   and link.bookkeeping_record_id=selected_record_doc.id and link.revoked_at is null) then raise exception 'Expense documentation state changed';end if;
  select event.* into documentation from public.bookkeeping_documentation_events event where event.business_id=selected_business
   and event.bookkeeping_record_id=selected_record_doc.id and event.event_type in('request_opened','reopened','evidence_attached')
   and not exists(select 1 from public.bookkeeping_documentation_events successor where successor.supersedes_event_id=event.id) for update;
  if documentation.id is null then raise exception 'Outstanding documentation request was not found';end if;
  documentation_result:=public.mark_bookkeeping_receipt_lost(documentation.documentation_issue_id,documentation.id,
   documentation.context_fingerprint,documentation.evidence_fingerprint,'{"schemaVersion":1,"assertion":"receipt_lost"}'::jsonb);
  new_decision:=current_decision;
  if p_decision='exclude_missing' then
   item_request:=gen_random_uuid();
   insert into public.bookkeeping_decisions(business_id,bookkeeping_record_id,supersedes_decision_id,bookkeeping_nature,treatment,
    review_status,provenance,actor_user_id,reason,business_purpose,correction_request_id)
   values(selected_business,selected_record_doc.id,current_decision.id,current_decision.bookkeeping_nature,'excluded','resolved','user',
    (select auth.uid()),'Customer chose to exclude this expense because supporting documentation is unavailable.',
    current_decision.business_purpose,item_request) returning * into new_decision;
   insert into public.bookkeeping_allocations(business_id,bookkeeping_record_id,bookkeeping_decision_id,allocation_kind,amount_cents,memo)
    values(selected_business,selected_record_doc.id,new_decision.id,'excluded',selected_record_doc.amount_cents,'Excluded by customer because supporting documentation is unavailable.');
   for issue in select event.* from public.bookkeeping_review_events event where event.business_id=selected_business
    and event.bookkeeping_record_id=selected_record_doc.id and event.event_type in('opened','skipped','reopened')
    and not exists(select 1 from public.bookkeeping_review_events successor where successor.supersedes_event_id=event.id) for update loop
    insert into public.bookkeeping_review_events(business_id,bookkeeping_record_id,review_issue_id,supersedes_event_id,
     sequence_number,event_type,reason,based_on_decision_id,issue_key,context_fingerprint,evidence_fingerprint,
     question_context,provenance)
    values(issue.business_id,issue.bookkeeping_record_id,issue.review_issue_id,issue.id,issue.sequence_number+1,'resolved',
     issue.reason,issue.based_on_decision_id,issue.issue_key,issue.context_fingerprint,issue.evidence_fingerprint,
     issue.question_context,'system') returning id into resolved_issue_id;
    insert into public.bookkeeping_scope_decision_question_links(business_id,bookkeeping_record_id,scope_decision_id,
     prior_review_event_id,resolved_review_event_id) values(selected_business,selected_record_doc.id,new_decision.id,issue.id,resolved_issue_id);
   end loop;
  end if;
  insert into public.bookkeeping_weekly_documentation_batch_items(business_id,review_period_id,batch_id,bookkeeping_record_id,
   prior_decision_id,resulting_decision_id,receipt_lost_event_id)
  values(selected_business,p_review_period_id,batch_id,selected_record_doc.id,current_decision.id,new_decision.id,
   (documentation_result->>'receipt_lost_event_id')::uuid);
 end loop;
 if p_complete_stage then workflow_event_id:=public.append_weekly_review_workflow_event(p_review_period_id,p_expected_workflow_event_id,
  'documentation','stage_completed',jsonb_build_object('decision',p_decision,'recordCount',cardinality(p_record_ids)),p_request_id);end if;
 return jsonb_build_object('batch_id',batch_id,'workflow_event_id',workflow_event_id,'idempotent',false);
end $$;

alter table public.bookkeeping_weekly_documentation_batches enable row level security;
alter table public.bookkeeping_weekly_documentation_batch_items enable row level security;
alter table public.bookkeeping_scope_decision_question_links enable row level security;
create policy bookkeeping_weekly_documentation_batches_select_own on public.bookkeeping_weekly_documentation_batches
 for select to authenticated using(exists(select 1 from public.businesses b where b.id=business_id and b.owner_user_id=(select auth.uid())));
create policy bookkeeping_weekly_documentation_batch_items_select_own on public.bookkeeping_weekly_documentation_batch_items
 for select to authenticated using(exists(select 1 from public.businesses b where b.id=business_id and b.owner_user_id=(select auth.uid())));
create policy bookkeeping_scope_decision_question_links_select_own on public.bookkeeping_scope_decision_question_links
 for select to authenticated using(exists(select 1 from public.businesses b where b.id=business_id and b.owner_user_id=(select auth.uid())));
grant select on public.bookkeeping_weekly_documentation_batches,public.bookkeeping_weekly_documentation_batch_items,
 public.bookkeeping_scope_decision_question_links to authenticated,service_role;
revoke execute on function public.correct_imported_transaction_personal_scope(uuid,uuid,uuid,text) from public,anon,service_role;
grant execute on function public.correct_imported_transaction_personal_scope(uuid,uuid,uuid,text) to authenticated;
revoke execute on function public.complete_weekly_personal_sweep(uuid,uuid,uuid,jsonb) from public,anon,service_role;
grant execute on function public.complete_weekly_personal_sweep(uuid,uuid,uuid,jsonb) to authenticated;
revoke execute on function public.restore_documentation_excluded_transaction(uuid,uuid,uuid) from public,anon,service_role;
grant execute on function public.restore_documentation_excluded_transaction(uuid,uuid,uuid) to authenticated;
revoke execute on function public.complete_weekly_missing_documentation_decision(uuid,uuid,uuid,text,uuid[],boolean) from public,anon,service_role;
grant execute on function public.complete_weekly_missing_documentation_decision(uuid,uuid,uuid,text,uuid[],boolean) to authenticated;

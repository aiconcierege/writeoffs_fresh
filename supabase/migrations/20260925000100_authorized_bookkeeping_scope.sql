-- Scope is independent of evidence retention, upload date and question age.
-- Internal authority reads canonical selected start, included months and paid/legacy coverage.
create function public.bookkeeping_scope_authority(p_business_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 with authority as (
  select b.id,b.catch_up_start_date selected_start,
   case when b.onboarding_state='completed' then (b.onboarding_completed_at at time zone 'UTC')::date end activation,
   (s.joined_month-interval '1 month')::date included_start,public.customer_coverage_start(b.id) coverage_start
  from public.businesses b left join public.business_customer_setup s on s.business_id=b.id where b.id=p_business_id
 ), scope as (
  select *,case when selected_start is not null and coverage_start is not null then greatest(selected_start,coverage_start) end active_start,
   coalesce(selected_start<included_start and coverage_start<=selected_start,false) historical from authority
 )
 select jsonb_build_object('businessId',id,'selectedStart',selected_start,'authorizedStart',active_start,
  'includedStart',included_start,'activation',activation,'historicalAuthorized',historical,
  'currentFrom',case when historical then activation else active_start end,
  'catchUp',case when historical and activation>active_start then jsonb_build_object('from',active_start,'through',activation-1) end)
 from scope
$$;
revoke all on function public.bookkeeping_scope_authority(uuid) from public,anon,authenticated;
grant execute on function public.bookkeeping_scope_authority(uuid) to service_role;

create function public.read_authorized_bookkeeping_scope(p_business_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if coalesce(auth.role(),'')<>'service_role' and (auth.uid() is null or coalesce(auth.jwt()->>'aal','')<>'aal2'
  or not exists(select 1 from public.businesses where id=p_business_id and owner_user_id=auth.uid()))
 then raise exception 'Business unavailable' using errcode='42501'; end if;
 return public.bookkeeping_scope_authority(p_business_id);
end; $$;
revoke all on function public.read_authorized_bookkeeping_scope(uuid) from public,anon;
grant execute on function public.read_authorized_bookkeeping_scope(uuid) to authenticated,service_role;

create function public.bookkeeping_date_is_active(p_business_id uuid,p_date date) returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce(p_date >= (public.read_authorized_bookkeeping_scope(p_business_id)->>'authorizedStart')::date,false)
$$;
revoke all on function public.bookkeeping_date_is_active(uuid,date) from public,anon;
grant execute on function public.bookkeeping_date_is_active(uuid,date) to authenticated,service_role;

-- One retained source ledger; active views enforce scope without deleting evidence/history.
create view public.active_bookkeeping_records with(security_invoker=true) as
 select r.* from public.bookkeeping_records r where public.bookkeeping_date_is_active(r.business_id,r.occurred_on);
create view public.active_legacy_transactions with(security_invoker=true) as
 select t.* from public.transactions t join public.businesses b on b.owner_user_id=t.user_id
 where public.bookkeeping_date_is_active(b.id,t.date);
grant select on public.active_bookkeeping_records,public.active_legacy_transactions to authenticated,service_role;

alter view public.customer_transaction_work rename to retained_customer_transaction_work;
create view public.customer_transaction_work with(security_invoker=true) as
 select w.* from public.retained_customer_transaction_work w where public.bookkeeping_date_is_active(w.business_id,w.activity_date);
grant select on public.customer_transaction_work to authenticated;

-- Stale historical question IDs cannot become current customer work through another route.
alter function public.list_current_askable_bookkeeping_question_event_ids(timestamptz) rename to list_current_askable_bookkeeping_question_event_ids_before_scope;
create function public.list_current_askable_bookkeeping_question_event_ids(p_as_of timestamptz default now()) returns table(event_id uuid)
language sql stable security definer set search_path='' as $$
 select q.event_id from public.list_current_askable_bookkeeping_question_event_ids_before_scope(p_as_of) q
 join public.bookkeeping_review_events e on e.id=q.event_id
 join public.bookkeeping_records r on r.id=e.bookkeeping_record_id and r.business_id=e.business_id
 where public.bookkeeping_date_is_active(r.business_id,r.occurred_on)
$$;
revoke all on function public.list_current_askable_bookkeeping_question_event_ids(timestamptz) from public,anon;
grant execute on function public.list_current_askable_bookkeeping_question_event_ids(timestamptz) to authenticated;

-- Read-only operational context. No facts, questions, jobs, or decisions are written.
-- Jobs remain private: expose only owned target/status/version data, never errors,
-- storage paths, provider payloads, lease credentials, or financial credentials.
create or replace function public.read_betti_work_context(p_business_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  if auth.uid() is null or coalesce(auth.jwt()->>'aal','') <> 'aal2'
    or not exists(select 1 from public.businesses where id=p_business_id and owner_user_id=auth.uid())
    then raise exception 'Business unavailable' using errcode='42501'; end if;
  select jsonb_build_object(
    'business',jsonb_build_object('id',b.id,'start',b.catch_up_start_date,
      'activation',case when b.onboarding_state='completed' then
        (b.onboarding_completed_at at time zone 'UTC')::date end,
      'activationEvidence',b.onboarding_completed_at,'timezone',coalesce(s.timezone_name,'UTC'),
      'coverageStart',public.customer_coverage_start(b.id),'authorizedScope',public.bookkeeping_scope_authority(b.id)),
    'records',coalesce((select jsonb_agg(to_jsonb(w)) from (
      select w.business_id,w.record_id,w.activity_date,w.account_id,w.decision_id,w.treatment,
        w.bookkeeping_nature,w.amount_cents,w.has_receipt,w.receipt_unavailable,w.source_kind,
        coalesce((select jsonb_agg(jsonb_build_object('kind',a.allocation_kind,'amountCents',a.amount_cents,
          'category',a.tax_category_key) order by a.id) from public.bookkeeping_allocations a
          where a.business_id=b.id and a.bookkeeping_decision_id=w.decision_id),'[]'::jsonb) allocations
      from public.customer_canonical_transaction_work w where w.business_id=b.id
      order by w.record_id limit 5001) w),'[]'::jsonb),
    'accounts',coalesce((select jsonb_agg(to_jsonb(a)) from (
      select a.business_id,a.id,a.provider,u.id as use_version,u.designation from public.financial_accounts a
      left join public.current_financial_account_use u on u.financial_account_id=a.id and u.business_id=a.business_id
      where a.business_id=b.id and a.archived_at is null order by a.id limit 501) a),'[]'::jsonb),
    'jobs',coalesce((select jsonb_agg(to_jsonb(j)) from (
      select j.business_id,j.id,j.bookkeeping_record_id as record_id,null::uuid as document_id,
        null::uuid as receipt_id,j.state,j.available_at,j.lease_expires_at,j.updated_at,
        'bookkeeping'::text as kind
      from public.bookkeeping_processing_jobs j where j.business_id=b.id and j.state<>'completed'
        and not exists(select 1 from public.bookkeeping_processing_jobs n where n.business_id=j.business_id
          and n.bookkeeping_record_id=j.bookkeeping_record_id and n.processing_reason=j.processing_reason
          and n.created_at>j.created_at and n.state='completed')
      union all
      select j.business_id,j.id,null,j.document_id,j.receipt_id,j.state,j.available_at,j.lease_expires_at,j.updated_at,'document'
      from public.receipt_processing_jobs j where j.business_id=b.id and j.state<>'completed'
        and j.job_type in ('canonical_receipt_extraction','statement_inspection','document_intake')
        and not exists(select 1 from public.receipt_processing_jobs n where n.business_id=j.business_id
          and n.job_type=j.job_type and n.document_id is not distinct from j.document_id
          and n.receipt_id is not distinct from j.receipt_id and n.created_at>j.created_at)
      order by id limit 5001) j),'[]'::jsonb),
    'documents',coalesce((select jsonb_agg(to_jsonb(d)) from (
      select d.business_id,d.id,d.receipt_id,d.created_at,
        exists(select 1 from public.receipt_processing_jobs j where j.business_id=b.id
          and j.job_type in ('canonical_receipt_extraction','statement_inspection','document_intake')
          and (j.document_id=d.id or j.receipt_id=d.receipt_id)) as has_job
      from public.business_documents d where d.business_id=b.id order by d.id limit 5001) d),'[]'::jsonb),
    'links',coalesce((select jsonb_agg(to_jsonb(l)) from (
      select l.business_id,l.bookkeeping_record_id as record_id,l.receipt_id,
        (select e.id from public.bookkeeping_receipt_extractions e where e.business_id=b.id and e.receipt_id=l.receipt_id
          order by e.created_at desc,e.id desc limit 1) as extraction_version
      from public.bookkeeping_document_links l where l.business_id=b.id and l.revoked_at is null
      order by l.id limit 10001) l),'[]'::jsonb),
    'coverage',coalesce((select jsonb_agg(to_jsonb(p)) from (
      select business_id,id,financial_account_id as account_id,document_id,period_start,period_end,
        validation_status,ambiguous_row_count from public.statement_periods where business_id=b.id
      order by id limit 5001) p),'[]'::jsonb),
    'deferred',coalesce((select jsonb_agg(to_jsonb(e)) from (
      select e.business_id,e.id,e.review_issue_id as issue_id,e.bookkeeping_record_id as record_id,e.deferred_until,e.created_at,'bookkeeping'::text as source
      from public.bookkeeping_review_events e where e.business_id=b.id and e.event_type='skipped'
        and not exists(select 1 from public.bookkeeping_review_events n where n.supersedes_event_id=e.id)
        and e.id in (select event_id from public.list_current_evidence_question_event_ids('9999-01-01T00:00:00Z'))
        and not exists(select 1 from public.bookkeeping_records r where r.id=e.bookkeeping_record_id and r.business_id=b.id
          and public.bookkeeping_question_is_historical_documentation(e.reason,e.question_context,r.occurred_on,
            public.bookkeeping_activity_day(b.id)))
      union all
      select e.business_id,e.id,e.attention_id,e.bookkeeping_record_id,null::timestamptz,e.created_at,'deduction'
      from public.current_deduction_attentions e where e.business_id=b.id and e.event_type='deferred'
      union all
      select e.business_id,e.id,e.question_id,null::uuid,e.deferred_until,e.created_at,'contractor'
      from public.contractor_question_deferral_events e where e.business_id=b.id
        and not exists(select 1 from public.contractor_question_deferral_events n where n.business_id=e.business_id
          and n.question_source=e.question_source and n.question_id=e.question_id and n.created_at>e.created_at)
        and ((e.question_source='payment_method' and exists(select 1 from public.current_contractor_payments p
          where p.business_id=b.id and p.id=e.source_version_id and p.payment_method='unknown'))
          or (e.question_source='w9_status' and exists(select 1 from public.current_contractor_w9_status w
            where w.business_id=b.id and w.id=e.source_version_id and w.status<>'on_file')))
      order by id limit 5001) e),'[]'::jsonb),
    'documentRecords',coalesce((select jsonb_agg(distinct jsonb_build_object('business_id',o.business_id,
      'document_id',p.document_id,'record_id',s.bookkeeping_record_id))
      from public.statement_transaction_observations o join public.statement_periods p on p.id=o.statement_period_id and p.business_id=o.business_id
      join public.bookkeeping_financial_sources s on s.financial_transaction_id=o.financial_transaction_id and s.business_id=o.business_id and s.revoked_at is null
      where o.business_id=b.id),'[]'::jsonb),
    'questionVersions',coalesce((select jsonb_agg(v.id order by v.id) from (
      select e.id from public.bookkeeping_review_events e where e.business_id=b.id
        and not exists(select 1 from public.bookkeeping_review_events n where n.supersedes_event_id=e.id)
      union all select e.id from public.current_deduction_attentions e where e.business_id=b.id
      union all select e.id from public.current_contractor_payments e where e.business_id=b.id
      union all select e.id from public.current_contractor_w9_status e where e.business_id=b.id
      order by id limit 10001) v),'[]'::jsonb)
  ) into result from public.businesses b left join public.business_customer_setup s on s.business_id=b.id
    where b.id=p_business_id;
  return result;
end; $$;
revoke all on function public.read_betti_work_context(uuid) from public,anon;
grant execute on function public.read_betti_work_context(uuid) to authenticated;

revoke execute on function public.list_current_askable_bookkeeping_question_event_ids_before_scope(timestamptz) from authenticated;

CREATE OR REPLACE FUNCTION public.enqueue_unresolved_bookkeeping_processing_jobs(p_limit integer DEFAULT 100)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  selected record;
  queued integer := 0;
  evaluator_reason constant text := 'deterministic_evaluation';
begin
  if (select auth.role()) <> 'service_role' then
    raise exception 'trusted bookkeeping worker required';
  end if;
  if p_limit not between 1 and 500 then
    raise exception 'invalid reconciliation limit';
  end if;

  for selected in
    select records.id, records.business_id
    from public.bookkeeping_records as records
    join public.bookkeeping_decisions as decisions
      on decisions.bookkeeping_record_id = records.id
     and decisions.business_id = records.business_id
    where decisions.treatment = 'unresolved' and public.bookkeeping_date_is_active(records.business_id,records.occurred_on)
      and not exists (
        select 1 from public.bookkeeping_decisions as successors
        where successors.supersedes_decision_id = decisions.id
      )
      and not exists (
        select 1 from public.bookkeeping_processing_jobs as jobs
        where jobs.bookkeeping_record_id = records.id
          and jobs.business_id = records.business_id
          and jobs.processing_reason = evaluator_reason
          and jobs.target_fingerprint =
            'bookkeeping-evaluator:v1:record:' || records.id::text
      )
    order by records.created_at, records.id
    limit p_limit
  loop
    perform public.request_bookkeeping_processing(
      selected.business_id,
      selected.id,
      evaluator_reason,
      'bookkeeping-evaluator:v1:record:' || selected.id::text
    );
    queued := queued + 1;
  end loop;
  return queued;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.ensure_current_meal_substantiation_questions()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare selected_business_id uuid; candidate record; opened_count integer:=0; selected_id uuid;
begin
  if (select auth.uid()) is null then raise exception 'authentication required'; end if;
  select id into selected_business_id from public.businesses where owner_user_id=(select auth.uid());
  if selected_business_id is null then raise exception 'Business is unavailable'; end if;
  for candidate in
    select d.id decision_id,d.bookkeeping_record_id
    from public.bookkeeping_decisions d
    where d.business_id=selected_business_id and exists(select 1 from public.active_bookkeeping_records r where r.id=d.bookkeeping_record_id and r.business_id=d.business_id) and d.bookkeeping_nature='expense'
      and d.treatment in ('business','mixed_use') and nullif(btrim(d.business_purpose),'') is not null
      and not exists(select 1 from public.bookkeeping_decisions s where s.supersedes_decision_id=d.id)
      and exists(select 1 from public.bookkeeping_allocations a where a.bookkeeping_decision_id=d.id
        and a.business_id=d.business_id and a.bookkeeping_record_id=d.bookkeeping_record_id
        and a.allocation_kind='business' and a.amount_cents<>0
        and a.tax_category_key in ('meals','business-meals','tax.business-meals'))
      and not exists(select 1 from public.current_bookkeeping_meal_substantiation_facts f
        where f.business_id=d.business_id and f.bookkeeping_record_id=d.bookkeeping_record_id)
      and not exists(select 1 from public.bookkeeping_review_events e
        where e.business_id=d.business_id and e.bookkeeping_record_id=d.bookkeeping_record_id
          and e.issue_key='meal-attendee:'||d.bookkeeping_record_id::text
          and not exists(select 1 from public.bookkeeping_review_events s where s.supersedes_event_id=e.id)
          and e.event_type in ('opened','skipped','reopened'))
  loop
    selected_id:=public.open_bookkeeping_review_issue_v2(selected_business_id,candidate.bookkeeping_record_id,
      candidate.decision_id,'BUSINESS_PURPOSE_NEEDED','meal-attendee:'||candidate.bookkeeping_record_id::text,
      md5(candidate.decision_id::text||':meal-attendee'),
      jsonb_build_object('schemaVersion',1,'reason','BUSINESS_PURPOSE_NEEDED','factType','meal_attendee_relationship'));
    if selected_id is not null then opened_count:=opened_count+1; end if;
  end loop;
  return opened_count;
end $function$
;

CREATE OR REPLACE FUNCTION public.project_receipt_meal_candidate_questions(p_receipt_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
 if not exists(select 1 from public.active_bookkeeping_records r where r.id=record_id and r.business_id=selected_business) then return jsonb_build_object('state','outside_scope'); end if;
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
end $function$
;

CREATE OR REPLACE FUNCTION public.request_bookkeeping_processing(p_business_id uuid, p_bookkeeping_record_id uuid, p_processing_reason text, p_target_fingerprint text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  selected_job_id uuid;
begin
  if p_business_id is null or p_bookkeeping_record_id is null
    or length(btrim(coalesce(p_processing_reason, ''))) not between 1 and 100
    or length(btrim(coalesce(p_target_fingerprint, ''))) not between 1 and 200
  then
    raise exception 'valid bookkeeping processing identity is required';
  end if;

  if not exists (
    select 1 from public.bookkeeping_records
    where id = p_bookkeeping_record_id and business_id = p_business_id
  ) then
    raise exception 'bookkeeping record does not belong to Business';
  end if;

  if not exists(select 1 from public.bookkeeping_records r where r.id=p_bookkeeping_record_id and r.business_id=p_business_id and public.bookkeeping_date_is_active(r.business_id,r.occurred_on)) then return null; end if;

  insert into public.bookkeeping_processing_jobs (
    business_id, bookkeeping_record_id, processing_reason, target_fingerprint
  ) values (
    p_business_id, p_bookkeeping_record_id,
    btrim(p_processing_reason), btrim(p_target_fingerprint)
  )
  on conflict (business_id, bookkeeping_record_id, processing_reason, target_fingerprint)
  do nothing
  returning id into selected_job_id;

  if selected_job_id is null then
    select id into selected_job_id
    from public.bookkeeping_processing_jobs
    where business_id = p_business_id
      and bookkeeping_record_id = p_bookkeeping_record_id
      and processing_reason = btrim(p_processing_reason)
      and target_fingerprint = btrim(p_target_fingerprint);
  end if;

  return selected_job_id;
end;
$function$
;

create or replace view public.bookkeeping_autonomous_receipt_match_candidates
with (security_invoker = true) as
select receipt_event.business_id, receipt_event.receipt_id,
  receipt_event.id as receipt_event_id, receipt_event.extraction_id,
  extraction.merchant as receipt_merchant, extraction.occurred_on as receipt_date,
  extraction.total_amount_cents as receipt_total_amount_cents,
  financial_transaction.id as financial_transaction_id,
  financial_record.id as financial_record_id
from public.bookkeeping_receipt_events receipt_event
join public.bookkeeping_receipt_extractions extraction
  on extraction.id = receipt_event.extraction_id and extraction.business_id = receipt_event.business_id
join public.financial_transactions financial_transaction
  on financial_transaction.business_id = receipt_event.business_id
 and financial_transaction.pending = false
 and financial_transaction.currency = 'USD'
 and financial_transaction.amount_cents = -extraction.total_amount_cents
 and financial_transaction.transaction_date between extraction.occurred_on - 3 and extraction.occurred_on + 3
 and public.normalize_receipt_convergence_merchant(coalesce(
   financial_transaction.merchant_name, financial_transaction.original_description))
   = public.normalize_receipt_convergence_merchant(extraction.merchant)
join public.bookkeeping_financial_sources financial_source
  on financial_source.business_id = financial_transaction.business_id
 and financial_source.financial_transaction_id = financial_transaction.id
 and financial_source.revoked_at is null
join public.bookkeeping_records financial_record
  on financial_record.id = financial_source.bookkeeping_record_id
 and financial_record.business_id = financial_source.business_id
 and financial_record.source_kind = 'financial_transaction'
where receipt_event.event_type = 'extraction_completed'
  and public.bookkeeping_date_is_active(financial_record.business_id,financial_record.occurred_on)
  and public.bookkeeping_date_is_active(extraction.business_id,extraction.occurred_on)
  and not exists (select 1 from public.bookkeeping_receipt_events successor
    where successor.supersedes_event_id = receipt_event.id)
  and extraction.quality_status = 'usable'
  and extraction.quality_policy_version = 'receipt-quality:v1'
  and public.normalize_receipt_convergence_merchant(extraction.merchant) <> ''
  and not exists (select 1 from public.bookkeeping_document_links link
    where link.business_id = financial_record.business_id
      and link.bookkeeping_record_id = financial_record.id and link.revoked_at is null)
  and not exists (select 1 from public.current_bookkeeping_record_convergences convergence
    where convergence.business_id = financial_record.business_id
      and (convergence.survivor_record_id = financial_record.id
        or convergence.absorbed_record_id = financial_record.id))
  and (
    financial_transaction.import_method <> 'provider'
    or exists (
      select 1 from public.plaid_transaction_versions version
      where version.business_id = financial_transaction.business_id
        and version.canonical_financial_transaction_id = financial_transaction.id
        and version.event_type in ('added','modified') and version.pending = false
        and not exists (select 1 from public.plaid_transaction_versions successor
          where successor.supersedes_version_id = version.id)
    )
  );

-- An explicit scope expansion schedules only the newly authorized interval.
-- Durable cursor + existing leased jobs keep expansion bounded and resumable.
create table public.bookkeeping_scope_reassessments (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id),
 from_date date not null, before_date date not null, cursor_id uuid,
 completed_at timestamptz, created_at timestamptz not null default now(), check(from_date<before_date)
);
alter table public.bookkeeping_scope_reassessments enable row level security;
revoke all on public.bookkeeping_scope_reassessments from public,anon,authenticated;
grant all on public.bookkeeping_scope_reassessments to service_role;
create function public.enqueue_authorized_scope_expansion() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.catch_up_start_date<old.catch_up_start_date then
  insert into public.bookkeeping_scope_reassessments(business_id,from_date,before_date)
  values(new.id,new.catch_up_start_date,old.catch_up_start_date);
 end if;return new;
end;$$;
revoke all on function public.enqueue_authorized_scope_expansion() from public,anon,authenticated;
create trigger bookkeeping_scope_expansion after update of catch_up_start_date on public.businesses
 for each row execute function public.enqueue_authorized_scope_expansion();

alter function public.enqueue_unresolved_bookkeeping_processing_jobs(integer) rename to enqueue_unresolved_bookkeeping_processing_jobs_before_scope_expansion;
create function public.enqueue_unresolved_bookkeeping_processing_jobs(p_limit integer default 100) returns integer
language plpgsql security definer set search_path='' as $$
declare batch public.bookkeeping_scope_reassessments%rowtype; r record; n integer:=0; remaining_count integer;
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'trusted bookkeeping worker required';end if;
 if p_limit not between 1 and 500 then raise exception 'invalid reconciliation limit';end if;
 select * into batch from public.bookkeeping_scope_reassessments where completed_at is null
 order by created_at,id for update skip locked limit 1;
 if found then
  for r in select id,business_id from public.bookkeeping_records where business_id=batch.business_id
    and occurred_on>=batch.from_date and occurred_on<batch.before_date
    and (batch.cursor_id is null or id>batch.cursor_id) order by id limit p_limit loop
   perform public.request_bookkeeping_processing(r.business_id,r.id,'deterministic_evaluation',
    'scope-expansion:'||batch.id::text||':record:'||r.id::text);
   update public.bookkeeping_scope_reassessments set cursor_id=r.id where id=batch.id;
   n:=n+1;
  end loop;
  if n<p_limit then update public.bookkeeping_scope_reassessments set completed_at=now() where id=batch.id;end if;
 end if;
 if n<p_limit then remaining_count:=public.enqueue_unresolved_bookkeeping_processing_jobs_before_scope_expansion(p_limit-n);n:=n+remaining_count;end if;
 return n;
end;$$;
revoke all on function public.enqueue_unresolved_bookkeeping_processing_jobs(integer) from public,anon,authenticated;
grant execute on function public.enqueue_unresolved_bookkeeping_processing_jobs(integer) to service_role;

create view public.customer_document_scope with(security_invoker=true) as
 select d.id,d.business_id,
  count(o.id) filter(where public.bookkeeping_date_is_active(d.business_id,o.transaction_date))::integer active_transaction_count,
  count(o.id) filter(where not public.bookkeeping_date_is_active(d.business_id,o.transaction_date))::integer outside_scope_transaction_count
 from public.business_documents d left join public.statement_periods p on p.document_id=d.id and p.business_id=d.business_id
 left join public.statement_transaction_observations o on o.statement_period_id=p.id and o.business_id=d.business_id
 group by d.id,d.business_id;
grant select on public.customer_document_scope to authenticated,service_role;

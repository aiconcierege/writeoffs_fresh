-- Read-only operational context. No facts, questions, jobs, or decisions are written.
-- Jobs remain private: expose only owned target/status/version data, never errors,
-- storage paths, provider payloads, lease credentials, or financial credentials.
create function public.read_betti_work_context(p_business_id uuid)
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
      'coverageStart',public.customer_coverage_start(b.id)),
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

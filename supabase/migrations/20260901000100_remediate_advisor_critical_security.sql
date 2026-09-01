-- Remediate the three bounded Supabase Advisor findings without exposing the
-- internal document-processing queue to customer roles.

revoke all on table public.contractor_awareness_rule_versions
  from public, anon, authenticated, service_role;

alter table public.contractor_awareness_rule_versions enable row level security;

create policy contractor_awareness_rules_select_authenticated
  on public.contractor_awareness_rule_versions
  for select to authenticated
  using (true);

grant select on table public.contractor_awareness_rule_versions
  to authenticated, service_role;

revoke all on table public.current_contractor_awareness_rules
  from public, anon, authenticated, service_role;
grant select on table public.current_contractor_awareness_rules
  to authenticated, service_role;

create or replace function public.read_customer_receipt_processing_status()
returns table (
  receipt_id uuid,
  business_id uuid,
  processing_status text,
  attempt_count integer,
  last_error_code text,
  terminal_reason text,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'authentication required';
  end if;

  return query
  select receipt.id,
    receipt.business_id,
    case
      when current_event.event_type = 'discarded' then 'discarded'
      when current_event.event_type in ('matched', 'retained', 'kept') then 'organized'
      when current_event.event_type = 'extraction_completed' then 'needs_attention'
      when current_job.state = 'processing' then 'processing'
      when current_job.state in ('dead_letter', 'unreadable') then 'unreadable'
      when current_job.state = 'needs_attention' then 'needs_attention'
      else 'queued'
    end,
    current_job.attempt_count,
    current_job.last_error_code,
    current_job.terminal_reason,
    current_job.updated_at
  from public.receipts as receipt
  left join lateral (
    select event.event_type
    from public.bookkeeping_receipt_events as event
    where event.receipt_id = receipt.id
      and event.business_id = receipt.business_id
      and not exists (
        select 1
        from public.bookkeeping_receipt_events as successor
        where successor.business_id = event.business_id
          and successor.receipt_id = event.receipt_id
          and successor.supersedes_event_id = event.id
      )
    limit 1
  ) as current_event on true
  left join lateral (
    select job.state, job.attempt_count, job.last_error_code,
      job.terminal_reason, job.updated_at
    from public.receipt_processing_jobs as job
    where job.receipt_id = receipt.id
      and job.business_id = receipt.business_id
      and job.job_type = 'canonical_receipt_extraction'
    order by job.created_at desc, job.id desc
    limit 1
  ) as current_job on true
  where receipt.user_id = (select auth.uid())
    and exists (
      select 1
      from public.businesses as business
      where business.id = receipt.business_id
        and business.owner_user_id = (select auth.uid())
    );
end;
$$;

revoke all on function public.read_customer_receipt_processing_status()
  from public, anon, authenticated, service_role;
grant execute on function public.read_customer_receipt_processing_status()
  to authenticated;

create or replace view public.current_customer_receipt_processing_status
with (security_invoker = true, security_barrier = true) as
select status.receipt_id, status.business_id, status.processing_status,
  status.attempt_count, status.last_error_code, status.terminal_reason,
  status.updated_at
from public.read_customer_receipt_processing_status() as status;

revoke all on table public.current_customer_receipt_processing_status
  from public, anon, authenticated, service_role;
grant select on table public.current_customer_receipt_processing_status
  to authenticated;

create or replace function public.read_customer_statement_status()
returns table (
  id uuid,
  business_id uuid,
  original_name text,
  bytes integer,
  created_at timestamptz,
  processing_status text,
  attempt_count integer,
  transaction_count integer,
  institution_name text,
  masked_account text,
  account_type text,
  period_start date,
  period_end date,
  statement_account_id uuid,
  account_link_id uuid,
  account_link_event_id uuid,
  target_account_id uuid
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'authentication required';
  end if;

  return query
  select document.id,
    document.business_id,
    document.original_name,
    document.bytes,
    document.created_at,
    case
      when current_job.state = 'completed' then 'organized'
      when current_job.state = 'processing' then 'processing'
      when current_job.state in ('needs_attention', 'dead_letter') then 'needs_attention'
      when current_job.state = 'unreadable' then 'unreadable'
      else 'queued'
    end,
    current_job.attempt_count,
    coalesce(summary.transaction_count, 0)::integer,
    summary.institution_name,
    summary.masked_account,
    summary.account_type,
    summary.period_start,
    summary.period_end,
    summary.financial_account_id,
    active_link.id,
    active_link.event_id,
    active_link.target_account_id
  from public.business_documents as document
  left join lateral (
    select job.state, job.attempt_count
    from public.receipt_processing_jobs as job
    where job.document_id = document.id
      and job.business_id = document.business_id
    order by job.created_at desc, job.id desc
    limit 1
  ) as current_job on true
  left join lateral (
    select count(observation.id) as transaction_count,
      max(period.institution_name) as institution_name,
      max(period.masked_account) as masked_account,
      max(period.account_type) as account_type,
      min(period.period_start) as period_start,
      max(period.period_end) as period_end,
      max(period.financial_account_id::text)::uuid as financial_account_id
    from public.statement_periods as period
    left join public.statement_transaction_observations as observation
      on observation.statement_period_id = period.id
      and observation.business_id = period.business_id
    where period.document_id = document.id
      and period.business_id = document.business_id
  ) as summary on true
  left join public.current_financial_account_equivalence_links as active_link
    on active_link.business_id = document.business_id
    and active_link.statement_account_id = summary.financial_account_id
  where document.owner_user_id = (select auth.uid())
    and exists (
      select 1
      from public.businesses as business
      where business.id = document.business_id
        and business.owner_user_id = (select auth.uid())
    );
end;
$$;

revoke all on function public.read_customer_statement_status()
  from public, anon, authenticated, service_role;
grant execute on function public.read_customer_statement_status()
  to authenticated;

create or replace view public.current_customer_statement_status
with (security_invoker = true, security_barrier = true) as
select status.id, status.business_id, status.original_name, status.bytes,
  status.created_at, status.processing_status, status.attempt_count,
  status.transaction_count, status.institution_name, status.masked_account,
  status.account_type, status.period_start, status.period_end,
  status.statement_account_id, status.account_link_id,
  status.account_link_event_id, status.target_account_id
from public.read_customer_statement_status() as status;

revoke all on table public.current_customer_statement_status
  from public, anon, authenticated, service_role;
grant select on table public.current_customer_statement_status
  to authenticated;

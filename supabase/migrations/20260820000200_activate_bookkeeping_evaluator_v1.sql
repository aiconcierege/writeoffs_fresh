-- Activate deterministic bookkeeping evaluator v1 queue identities. This
-- changes only operational work requests; it does not backfill or write any
-- bookkeeping decision during migration.

create or replace function public.enqueue_new_bookkeeping_record_processing()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.request_bookkeeping_processing(
    new.business_id,
    new.id,
    'deterministic_evaluation',
    'bookkeeping-evaluator:v1:record:' || new.id::text
  );
  return new;
end;
$$;

create or replace function public.enqueue_unresolved_bookkeeping_processing_jobs(
  p_limit integer default 100
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
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
    where decisions.treatment = 'unresolved'
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
$$;

comment on function public.enqueue_unresolved_bookkeeping_processing_jobs(integer) is
  'Explicitly queues current unresolved records once for deterministic bookkeeping evaluator v1; prior Phase 1A jobs do not block reevaluation.';

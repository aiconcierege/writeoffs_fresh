-- Scheduling within a Business, not a second ledger or a change to membership
-- coverage. Keep cross-Business fairness, lease exclusion and retry backoff.
create function public.bookkeeping_work_priority(p_business uuid,p_date date) returns integer
language sql stable security definer set search_path='' as $$
 select case when p_date >= (date_trunc('month',public.bookkeeping_activity_day(p_business)) - interval '1 month')::date then 2
  when p_date >= (public.bookkeeping_scope_authority(p_business)->>'includedStart')::date then 1 else 0 end;
$$;
revoke all on function public.bookkeeping_work_priority(uuid,date) from public,anon,authenticated;
grant execute on function public.bookkeeping_work_priority(uuid,date) to service_role;
do $$ declare original text; updated text; begin
 original:=pg_get_functiondef('public.claim_bookkeeping_processing_jobs(uuid,integer,integer)'::regprocedure);
 updated:=replace(original,
  'row_number() over(partition by jobs.business_id order by jobs.available_at,jobs.created_at,jobs.id)',
  'row_number() over(partition by jobs.business_id order by public.bookkeeping_work_priority(jobs.business_id,(select r.occurred_on from public.bookkeeping_records r where r.id=jobs.bookkeeping_record_id and r.business_id=jobs.business_id)) desc,jobs.available_at,jobs.created_at,jobs.id)');
 if updated=original then raise exception 'Expected per-Business scheduling boundary missing';end if;
 execute updated;
end; $$;

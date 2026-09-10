-- A worker may finish immediately after its lease deadline. The lease token is
-- the fencing identity: if no later worker has reclaimed the row, the original
-- worker still owns the transition. This keeps completion/retry safe while
-- avoiding an invalid retry transition caused solely by wall-clock expiry.

create or replace function public.complete_bookkeeping_processing_job(
  p_job_id uuid,
  p_lease_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed integer;
begin
  if (select auth.role()) <> 'service_role' then
    raise exception 'trusted bookkeeping worker required';
  end if;
  update public.bookkeeping_processing_jobs
  set state = 'completed', completed_at = now(),
      lease_id = null, lease_expires_at = null, last_error_code = null,
      updated_at = now()
  where id = p_job_id and state = 'processing' and lease_id = p_lease_id;
  get diagnostics changed = row_count;
  return changed = 1;
end;
$$;

create or replace function public.retry_bookkeeping_processing_job(
  p_job_id uuid,
  p_lease_id uuid,
  p_error_code text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  next_state text;
begin
  if (select auth.role()) <> 'service_role' then
    raise exception 'trusted bookkeeping worker required';
  end if;
  if p_error_code is null or length(p_error_code) not between 1 and 100
    or p_error_code !~ '^[A-Z0-9_]+$'
  then
    raise exception 'safe bookkeeping worker error code is required';
  end if;

  update public.bookkeeping_processing_jobs
  set state = case when attempt_count >= 8 then 'dead_letter' else 'retryable' end,
      available_at = case
        when attempt_count >= 8 then available_at
        else now() + make_interval(secs => least(3600, 5 * (2 ^ greatest(attempt_count - 1, 0))::integer))
      end,
      lease_id = null,
      lease_expires_at = null,
      last_error_code = p_error_code,
      updated_at = now()
  where id = p_job_id and state = 'processing' and lease_id = p_lease_id
  returning state into next_state;

  if next_state is null then
    raise exception 'bookkeeping processing lease is no longer owned';
  end if;
  return next_state;
end;
$$;

revoke execute on function public.complete_bookkeeping_processing_job(uuid, uuid)
  from public, anon, authenticated;
revoke execute on function public.retry_bookkeeping_processing_job(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.complete_bookkeeping_processing_job(uuid, uuid)
  to service_role;
grant execute on function public.retry_bookkeeping_processing_job(uuid, uuid, text)
  to service_role;

comment on function public.complete_bookkeeping_processing_job(uuid, uuid) is
  'Completes only the processing row still fenced by the supplied worker lease token, including immediately after its deadline when it has not been reclaimed.';
comment on function public.retry_bookkeeping_processing_job(uuid, uuid, text) is
  'Retries only the processing row still fenced by the supplied worker lease token, including immediately after its deadline when it has not been reclaimed.';

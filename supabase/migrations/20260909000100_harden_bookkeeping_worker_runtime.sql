-- Bounded bookkeeping-worker reliability and safe operational diagnostics.
-- Canonical bookkeeping facts and append-only conclusions are unchanged.

alter table public.bookkeeping_processing_jobs
  add column if not exists last_error_stage text,
  add column if not exists last_diagnostic_code text,
  add column if not exists last_error_fingerprint text,
  add column if not exists last_duration_ms integer;

alter table public.bookkeeping_processing_jobs
  add constraint bookkeeping_processing_jobs_diagnostic_check check (
    (last_error_stage is null or last_error_stage ~ '^[a-z][a-z0-9_]{1,49}$')
    and (last_diagnostic_code is null or last_diagnostic_code ~ '^[A-Z0-9_]{3,100}$')
    and (last_error_fingerprint is null or last_error_fingerprint ~ '^[a-f0-9]{64}$')
    and (last_duration_ms is null or last_duration_ms between 0 and 900000)
  );

create table public.bookkeeping_processing_attempt_events (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.bookkeeping_processing_jobs(id) on delete restrict,
  business_id uuid not null references public.businesses(id) on delete restrict,
  bookkeeping_record_id uuid not null,
  attempt_count integer not null check (attempt_count >= 0),
  event_type text not null check (event_type in ('claimed','lease_recovered','completed','failed','recovered')),
  lease_id uuid,
  error_code text,
  error_stage text,
  diagnostic_code text,
  error_fingerprint text,
  duration_ms integer,
  recovery_reason text,
  created_at timestamptz not null default now(),
  foreign key (bookkeeping_record_id, business_id)
    references public.bookkeeping_records(id, business_id) on delete restrict,
  check (error_code is null or error_code ~ '^[A-Z0-9_]{3,100}$'),
  check (error_stage is null or error_stage ~ '^[a-z][a-z0-9_]{1,49}$'),
  check (diagnostic_code is null or diagnostic_code ~ '^[A-Z0-9_]{3,100}$'),
  check (error_fingerprint is null or error_fingerprint ~ '^[a-f0-9]{64}$'),
  check (duration_ms is null or duration_ms between 0 and 900000),
  check (recovery_reason is null or length(recovery_reason) between 1 and 200)
);

create index bookkeeping_processing_attempt_events_job_idx
  on public.bookkeeping_processing_attempt_events (job_id, created_at, id);
create index bookkeeping_processing_attempt_events_business_idx
  on public.bookkeeping_processing_attempt_events (business_id, created_at desc);

alter table public.bookkeeping_processing_attempt_events enable row level security;
revoke all on public.bookkeeping_processing_attempt_events from public, anon, authenticated;
grant select, insert on public.bookkeeping_processing_attempt_events to service_role;

create or replace function public.reject_bookkeeping_processing_attempt_event_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'bookkeeping processing attempt events are append-only';
end;
$$;
create trigger bookkeeping_processing_attempt_events_immutable
before update or delete on public.bookkeeping_processing_attempt_events
for each row execute function public.reject_bookkeeping_processing_attempt_event_mutation();

create or replace function public.claim_bookkeeping_processing_jobs(
  p_lease_id uuid,
  p_limit integer default 10,
  p_lease_seconds integer default 60
)
returns setof public.bookkeeping_processing_jobs
language plpgsql security definer set search_path = '' as $$
declare recovered record;
begin
  if (select auth.role()) <> 'service_role' then raise exception 'trusted bookkeeping worker required'; end if;
  if p_lease_id is null or p_limit not between 1 and 25 or p_lease_seconds not between 15 and 900
  then raise exception 'invalid bookkeeping worker claim'; end if;

  for recovered in
    select * from public.bookkeeping_processing_jobs
    where state = 'processing' and lease_expires_at <= now()
  loop
    insert into public.bookkeeping_processing_attempt_events(job_id,business_id,bookkeeping_record_id,
      attempt_count,event_type,lease_id,error_code,error_stage,diagnostic_code,error_fingerprint,duration_ms)
    values(recovered.id,recovered.business_id,recovered.bookkeeping_record_id,recovered.attempt_count,
      'lease_recovered',recovered.lease_id,recovered.last_error_code,recovered.last_error_stage,
      recovered.last_diagnostic_code,recovered.last_error_fingerprint,recovered.last_duration_ms);
  end loop;

  update public.bookkeeping_processing_jobs
  set state='dead_letter',lease_id=null,lease_expires_at=null,
      last_error_code=coalesce(last_error_code,'RETRY_LIMIT_EXCEEDED'),
      last_error_stage=coalesce(last_error_stage,'lease_recovery'),
      last_diagnostic_code=coalesce(last_diagnostic_code,'RETRY_LIMIT_EXCEEDED'),updated_at=now()
  where state='processing' and lease_expires_at<=now() and attempt_count>=8;

  return query
  with ranked as (
    select jobs.id,jobs.business_id,jobs.available_at,jobs.created_at,
      row_number() over(partition by jobs.business_id order by jobs.available_at,jobs.created_at,jobs.id) as business_rank
    from public.bookkeeping_processing_jobs jobs
    where ((jobs.state in ('pending','retryable') and jobs.available_at<=now())
      or (jobs.state='processing' and jobs.lease_expires_at<=now()))
      and jobs.attempt_count<8
      -- Canonical writers serialize by Business. Do not claim a second job that
      -- would merely wait on the same advisory lock until its lease expires.
      and not exists (
        select 1 from public.bookkeeping_processing_jobs active
        where active.business_id=jobs.business_id and active.id<>jobs.id
          and active.state='processing' and active.lease_expires_at>now()
      )
  ), candidates as (
    select jobs.id
    from public.bookkeeping_processing_jobs jobs join ranked on ranked.id=jobs.id
    where ranked.business_rank=1
    order by jobs.available_at,jobs.created_at,jobs.id
    for update skip locked limit p_limit
  ), claimed as (
    update public.bookkeeping_processing_jobs jobs
    set state='processing',attempt_count=jobs.attempt_count+1,lease_id=p_lease_id,
      lease_expires_at=now()+make_interval(secs=>p_lease_seconds),claimed_at=now(),last_attempted_at=now(),
      last_error_code=null,last_error_stage=null,last_diagnostic_code=null,last_error_fingerprint=null,
      last_duration_ms=null,updated_at=now()
    from candidates where jobs.id=candidates.id returning jobs.*
  ), logged as (
    insert into public.bookkeeping_processing_attempt_events(job_id,business_id,bookkeeping_record_id,
      attempt_count,event_type,lease_id)
    select id,business_id,bookkeeping_record_id,attempt_count,'claimed',lease_id from claimed
  )
  select * from claimed;
end;
$$;

create or replace function public.complete_bookkeeping_processing_job(p_job_id uuid,p_lease_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare selected public.bookkeeping_processing_jobs%rowtype;
begin
  if (select auth.role()) <> 'service_role' then raise exception 'trusted bookkeeping worker required'; end if;
  select * into selected from public.bookkeeping_processing_jobs
    where id=p_job_id and state='processing' and lease_id=p_lease_id for update;
  if selected.id is null then return false; end if;
  update public.bookkeeping_processing_jobs set state='completed',completed_at=now(),lease_id=null,
    lease_expires_at=null,last_error_code=null,last_error_stage=null,last_diagnostic_code=null,
    last_error_fingerprint=null,updated_at=now() where id=p_job_id;
  insert into public.bookkeeping_processing_attempt_events(job_id,business_id,bookkeeping_record_id,
    attempt_count,event_type,lease_id,duration_ms)
  values(selected.id,selected.business_id,selected.bookkeeping_record_id,selected.attempt_count,'completed',
    p_lease_id,least(900000,greatest(0,(extract(epoch from (now()-selected.claimed_at))*1000)::integer)));
  return true;
end;
$$;

create or replace function public.retry_bookkeeping_processing_job_diagnostic(
  p_job_id uuid,p_lease_id uuid,p_error_code text,p_error_stage text,p_diagnostic_code text,
  p_error_fingerprint text,p_duration_ms integer
)
returns text language plpgsql security definer set search_path = '' as $$
declare selected public.bookkeeping_processing_jobs%rowtype; next_state text;
begin
  if (select auth.role()) <> 'service_role' then raise exception 'trusted bookkeeping worker required'; end if;
  if p_error_code !~ '^[A-Z0-9_]{3,100}$' or p_error_stage !~ '^[a-z][a-z0-9_]{1,49}$'
    or p_diagnostic_code !~ '^[A-Z0-9_]{3,100}$' or p_error_fingerprint !~ '^[a-f0-9]{64}$'
    or p_duration_ms not between 0 and 900000 then raise exception 'safe worker diagnostic required'; end if;
  select * into selected from public.bookkeeping_processing_jobs
    where id=p_job_id and state='processing' and lease_id=p_lease_id for update;
  if selected.id is null then raise exception 'bookkeeping processing lease is no longer owned'; end if;
  next_state:=case when selected.attempt_count>=8 then 'dead_letter' else 'retryable' end;
  update public.bookkeeping_processing_jobs set state=next_state,
    available_at=case when next_state='dead_letter' then available_at else now()+make_interval(secs=>least(3600,5*(2^greatest(attempt_count-1,0))::integer)) end,
    lease_id=null,lease_expires_at=null,last_error_code=p_error_code,last_error_stage=p_error_stage,
    last_diagnostic_code=p_diagnostic_code,last_error_fingerprint=p_error_fingerprint,
    last_duration_ms=p_duration_ms,updated_at=now() where id=p_job_id;
  insert into public.bookkeeping_processing_attempt_events(job_id,business_id,bookkeeping_record_id,
    attempt_count,event_type,lease_id,error_code,error_stage,diagnostic_code,error_fingerprint,duration_ms)
  values(selected.id,selected.business_id,selected.bookkeeping_record_id,selected.attempt_count,'failed',
    p_lease_id,p_error_code,p_error_stage,p_diagnostic_code,p_error_fingerprint,p_duration_ms);
  return next_state;
end;
$$;

create or replace function public.recover_bookkeeping_processing_jobs(
  p_job_ids uuid[],p_recovery_reason text
)
returns integer language plpgsql security definer set search_path = '' as $$
declare selected public.bookkeeping_processing_jobs%rowtype; recovered integer:=0;
begin
  if (select auth.role()) <> 'service_role' then raise exception 'trusted bookkeeping worker required'; end if;
  if coalesce(array_length(p_job_ids,1),0) not between 1 and 500
    or length(btrim(coalesce(p_recovery_reason,''))) not between 1 and 200
  then raise exception 'bounded recovery identity required'; end if;
  for selected in select * from public.bookkeeping_processing_jobs
    where id=any(p_job_ids) and state='dead_letter' for update
  loop
    update public.bookkeeping_processing_jobs set state='retryable',attempt_count=0,available_at=now(),
      completed_at=null,lease_id=null,lease_expires_at=null,last_error_code=null,last_error_stage=null,
      last_diagnostic_code=null,last_error_fingerprint=null,last_duration_ms=null,updated_at=now()
      where id=selected.id;
    insert into public.bookkeeping_processing_attempt_events(job_id,business_id,bookkeeping_record_id,
      attempt_count,event_type,recovery_reason)
    values(selected.id,selected.business_id,selected.bookkeeping_record_id,selected.attempt_count,
      'recovered',btrim(p_recovery_reason));
    recovered:=recovered+1;
  end loop;
  return recovered;
end;
$$;

revoke execute on function public.retry_bookkeeping_processing_job_diagnostic(uuid,uuid,text,text,text,text,integer)
  from public,anon,authenticated;
revoke execute on function public.recover_bookkeeping_processing_jobs(uuid[],text)
  from public,anon,authenticated;
grant execute on function public.retry_bookkeeping_processing_job_diagnostic(uuid,uuid,text,text,text,text,integer)
  to service_role;
grant execute on function public.recover_bookkeeping_processing_jobs(uuid[],text) to service_role;

comment on table public.bookkeeping_processing_attempt_events is
  'Append-only safe operational history for claims, failures, lease recovery, completion, and explicit recovery.';
comment on function public.recover_bookkeeping_processing_jobs(uuid[],text) is
  'Explicit bounded recovery for diagnosed dead-letter jobs; never changes canonical bookkeeping conclusions.';

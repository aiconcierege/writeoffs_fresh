-- Route all public waitlist writes through the controlled server endpoint and
-- provide a small service-only fixed-window abuse limiter.

alter table public.waitlist enable row level security;

drop policy if exists "waitlist_public_insert" on public.waitlist;
revoke all privileges on table public.waitlist from public, anon, authenticated, service_role;
grant insert on table public.waitlist to service_role;

create table public.waitlist_rate_limits (
  key_hash text primary key,
  window_started_at timestamptz not null,
  request_count integer not null check (request_count > 0),
  updated_at timestamptz not null default now(),
  constraint waitlist_rate_limits_key_hash_check
    check (key_hash ~ '^[0-9a-f]{64}$')
);
create index waitlist_rate_limits_updated_at_idx
  on public.waitlist_rate_limits(updated_at);

alter table public.waitlist_rate_limits enable row level security;
revoke all privileges on table public.waitlist_rate_limits
  from public, anon, authenticated, service_role;

create or replace function public.consume_waitlist_rate_limit(
  p_key_hash text,
  p_limit integer default 6,
  p_window_seconds integer default 600
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_count integer;
begin
  if (select auth.role()) <> 'service_role' then
    raise exception 'service role required';
  end if;
  if p_key_hash !~ '^[0-9a-f]{64}$'
     or p_limit < 1 or p_limit > 100
     or p_window_seconds < 60 or p_window_seconds > 86400 then
    raise exception 'invalid waitlist rate-limit input';
  end if;

  -- Bound storage growth without turning a public request into an unbounded sweep.
  delete from public.waitlist_rate_limits
  where key_hash in (
    select key_hash from public.waitlist_rate_limits
    where updated_at < now() - interval '1 day'
    order by updated_at
    limit 100
  );

  insert into public.waitlist_rate_limits (
    key_hash, window_started_at, request_count, updated_at
  ) values (p_key_hash, now(), 1, now())
  on conflict (key_hash) do update set
    window_started_at = case
      when public.waitlist_rate_limits.window_started_at
        <= now() - make_interval(secs => p_window_seconds)
      then now() else public.waitlist_rate_limits.window_started_at end,
    request_count = case
      when public.waitlist_rate_limits.window_started_at
        <= now() - make_interval(secs => p_window_seconds)
      then 1 else public.waitlist_rate_limits.request_count + 1 end,
    updated_at = now()
  returning request_count into current_count;

  return current_count <= p_limit;
end;
$$;

revoke all on function public.consume_waitlist_rate_limit(text,integer,integer)
  from public, anon, authenticated, service_role;
grant execute on function public.consume_waitlist_rate_limit(text,integer,integer)
  to service_role;

comment on table public.waitlist_rate_limits is
  'Short-lived pseudonymous request counters for the controlled public waitlist endpoint; no customer data.';

-- Explicit scope changes use a bounded queue drained by the existing worker.
-- A tenant selector supports trusted, isolated operational verification; customers
-- cannot call it and cannot supply scope through it.
create function public.enqueue_authorized_scope_processing_batch(p_limit integer default 100,p_business_id uuid default null)
returns integer language plpgsql security definer set search_path='' as $$
declare batch public.bookkeeping_scope_reassessments%rowtype; r record; n integer:=0; batch_count integer;
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'trusted bookkeeping worker required';end if;
 if p_limit not between 1 and 500 then raise exception 'invalid reconciliation limit';end if;
 for batch in select * from public.bookkeeping_scope_reassessments where completed_at is null
   and (p_business_id is null or business_id=p_business_id)
   order by created_at,id for update skip locked limit p_limit loop
  batch_count:=0;
  for r in select id,business_id from public.bookkeeping_records where business_id=batch.business_id
    and occurred_on>=batch.from_date and occurred_on<batch.before_date
    and (batch.cursor_id is null or id>batch.cursor_id) order by id limit (p_limit-n) loop
   perform public.request_bookkeeping_processing(r.business_id,r.id,'deterministic_evaluation',
    'scope-expansion:'||batch.id::text||':record:'||r.id::text);
   update public.bookkeeping_scope_reassessments set cursor_id=r.id where id=batch.id;
   n:=n+1;batch_count:=batch_count+1;
  end loop;
  if not exists(select 1 from public.bookkeeping_records remaining_record
    join public.bookkeeping_scope_reassessments s on s.id=batch.id and s.business_id=remaining_record.business_id
    where remaining_record.occurred_on>=s.from_date and remaining_record.occurred_on<s.before_date and (s.cursor_id is null or remaining_record.id>s.cursor_id))
   then update public.bookkeeping_scope_reassessments set completed_at=now() where id=batch.id;end if;
  if n>=p_limit then exit;end if;
 end loop;
 return n;
end;$$;
revoke all on function public.enqueue_authorized_scope_processing_batch(integer,uuid) from public,anon,authenticated;
grant execute on function public.enqueue_authorized_scope_processing_batch(integer,uuid) to service_role;
create or replace function public.enqueue_unresolved_bookkeeping_processing_jobs(p_limit integer default 100) returns integer
language plpgsql security definer set search_path='' as $$
declare n integer;
begin
 n:=public.enqueue_authorized_scope_processing_batch(p_limit,null);
 if n<p_limit then n:=n+public.enqueue_unresolved_bookkeeping_processing_jobs_before_scope_expansion(p_limit-n);end if;
 return n;
end;$$;
create or replace function public.enqueue_authorized_scope_expansion() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if old.onboarding_state='completed' and new.catch_up_start_date<old.catch_up_start_date then
  insert into public.bookkeeping_scope_reassessments(business_id,from_date,before_date)
  values(new.id,new.catch_up_start_date,old.catch_up_start_date);
 end if;return new;
end;$$;

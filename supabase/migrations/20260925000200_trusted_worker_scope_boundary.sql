-- Trusted ingestion already validates its worker lease/business, then temporarily
-- adopts the owner identity for canonical insertion. Scope is still enforced,
-- but an internal trigger must not require that service session to have user MFA.
create function public.bookkeeping_activity_in_scope(p_business_id uuid,p_date date) returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce(p_date >= (public.bookkeeping_scope_authority(p_business_id)->>'authorizedStart')::date,false)
$$;
revoke all on function public.bookkeeping_activity_in_scope(uuid,date) from public,anon,authenticated;
grant execute on function public.bookkeeping_activity_in_scope(uuid,date) to service_role;
do $$ declare original text; revised text; begin
 original:=pg_get_functiondef('public.request_bookkeeping_processing(uuid,uuid,text,text)'::regprocedure);
 revised:=replace(original,'public.bookkeeping_date_is_active(r.business_id,r.occurred_on)',
  'public.bookkeeping_activity_in_scope(r.business_id,r.occurred_on)');
 if revised=original then raise exception 'Expected processing scope guard missing';end if;
 execute revised;
end;$$;

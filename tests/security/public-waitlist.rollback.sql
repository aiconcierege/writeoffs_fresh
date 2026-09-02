-- Run after the public-waitlist migration in the same transaction; caller rolls back.
do $$ declare public_execute boolean; begin
  if not (select relrowsecurity from pg_class where oid='public.waitlist'::regclass) then
    raise exception 'waitlist RLS is disabled';
  end if;
  if has_table_privilege('anon','public.waitlist','INSERT')
    or has_table_privilege('authenticated','public.waitlist','INSERT') then
    raise exception 'browser role retained direct waitlist insertion';
  end if;
  if not has_table_privilege('service_role','public.waitlist','INSERT') then
    raise exception 'controlled server insertion is unavailable';
  end if;
  if has_table_privilege('anon','public.waitlist_rate_limits','SELECT,INSERT,UPDATE,DELETE')
    or has_table_privilege('authenticated','public.waitlist_rate_limits','SELECT,INSERT,UPDATE,DELETE') then
    raise exception 'browser role can access waitlist limiter state';
  end if;
  select exists(
    select 1 from pg_proc p
    cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl
    where p.oid='public.consume_waitlist_rate_limit(text,integer,integer)'::regprocedure
      and acl.grantee=0 and acl.privilege_type='EXECUTE'
  ) into public_execute;
  if public_execute
    or has_function_privilege('anon','public.consume_waitlist_rate_limit(text,integer,integer)','EXECUTE')
    or has_function_privilege('authenticated','public.consume_waitlist_rate_limit(text,integer,integer)','EXECUTE')
    or not has_function_privilege('service_role','public.consume_waitlist_rate_limit(text,integer,integer)','EXECUTE') then
    raise exception 'waitlist limiter ACL is incorrect';
  end if;
end $$;

set local role anon;
do $$ declare denied boolean:=false; begin
  begin
    insert into public.waitlist(email,name,source)
    values('anon-direct@example.test','Direct','test');
  exception when others then denied:=true; end;
  if not denied then raise exception 'anon direct waitlist insert succeeded'; end if;
end $$;
reset role;

set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
insert into public.waitlist(email,name,source)
values('server-controlled@example.test','Server','landing#waitlist');
do $$ declare allowed boolean; i integer; begin
  for i in 1..6 loop
    allowed:=public.consume_waitlist_rate_limit(repeat('a',64),6,600);
    if not allowed then raise exception 'limiter rejected request % too early',i; end if;
  end loop;
  allowed:=public.consume_waitlist_rate_limit(repeat('a',64),6,600);
  if allowed then raise exception 'limiter allowed request beyond configured bound'; end if;
end $$;
reset role;

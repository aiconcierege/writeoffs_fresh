begin;

do $$
begin
  if not exists(select 1 from pg_constraint where conname='bookkeeping_documentation_events_type_check'
    and pg_get_constraintdef(oid) like '%acknowledged_pending%') then
    raise exception 'acknowledged_pending constraint is missing';
  end if;
  if has_function_privilege('anon','public.acknowledge_weekly_documentation_pending(uuid,uuid,uuid,uuid,uuid,uuid)','EXECUTE')
    or has_function_privilege('service_role','public.acknowledge_weekly_documentation_pending(uuid,uuid,uuid,uuid,uuid,uuid)','EXECUTE') then
    raise exception 'pending acknowledgement RPC has an overbroad ACL';
  end if;
  if not has_function_privilege('authenticated','public.acknowledge_weekly_documentation_pending(uuid,uuid,uuid,uuid,uuid,uuid)','EXECUTE') then
    raise exception 'authenticated acknowledgement grant is missing';
  end if;
  if has_function_privilege('anon','public.complete_weekly_documentation_stage_v3(uuid,uuid,uuid)','EXECUTE')
    or not has_function_privilege('authenticated','public.complete_weekly_documentation_stage_v3(uuid,uuid,uuid)','EXECUTE') then
    raise exception 'documentation completion ACL is incorrect';
  end if;
end $$;

rollback;

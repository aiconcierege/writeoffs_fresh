-- A published index schedules its next refresh at its eligibility deadline.
-- A new routing version must be eligible sooner, while failures retain backoff.
-- The staging freeze predicate remains first and unchanged.
do $$ declare original text;updated text;begin
 original:=pg_get_functiondef('public.claim_betti_action_index_refresh_excluding(uuid,uuid,text,boolean,uuid[])'::regprocedure);
 updated:=replace(original,'and s.available_at<=now() and (s.lease_expires_at',
  'and (s.available_at<=now() or (s.engine_version is distinct from p_engine_version and s.last_error is null)) and (s.lease_expires_at');
 if updated=original then raise exception 'Expected index refresh schedule guard missing';end if;
 execute updated;
end;$$;

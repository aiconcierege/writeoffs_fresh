-- Expose the server-owned projection version to the allocation command adapter.
-- Older publications still use canonical fallback; replay semantics are unchanged.
do $$ declare original text; updated text; begin
 original:=pg_get_functiondef('public.read_betti_indexed_question(uuid,uuid,uuid)'::regprocedure);
 updated:=replace(original,
 'return jsonb_build_object(''initialized'',true,''action'',e.action,''commandItem'',e.command_item);',
 'return jsonb_build_object(''initialized'',true,''action'',e.action,''commandItem'',e.command_item,''engineVersion'',s.engine_version);');
 if updated=original then raise exception 'Expected indexed eligibility boundary missing';end if;execute updated;
end; $$;

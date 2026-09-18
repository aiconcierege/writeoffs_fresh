-- PostgreSQL views bind function OIDs. Renaming the old eligibility function
-- retains that dependency even though new function calls use the canonical name.
-- Rebind direct views to the new canonical eligibility boundary; never restore
-- authenticated execution of the old bypass. Preserve each view's options.
do $$
declare old_oid oid; old_name text; v record; definition text; options text; n integer:=0;
begin
 select p.oid,p.proname into strict old_oid,old_name from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace
 where ns.nspname='public' and p.proname like 'list_current_evidence_question_event_ids_before_money_source%';
 for v in select distinct c.oid,c.relname,c.reloptions,ns.nspname from pg_depend d
 join pg_rewrite rw on rw.oid=d.objid join pg_class c on c.oid=rw.ev_class
 join pg_namespace ns on ns.oid=c.relnamespace
 where d.refobjid=old_oid and d.refclassid='pg_proc'::regclass and d.classid='pg_rewrite'::regclass
 and c.relkind='v' and ns.nspname='public' loop
  definition:=pg_get_viewdef(v.oid,true);
  if position(old_name in definition)=0 then raise exception 'inspect eligibility view dependency';end if;
  definition:=replace(definition,old_name,'list_current_evidence_question_event_ids');
  options:=case when v.reloptions is null then '' else ' with ('||array_to_string(v.reloptions,',')||')' end;
  execute format('create or replace view %I.%I%s as %s',v.nspname,v.relname,options,definition);
  n:=n+1;
 end loop;
 if n=0 then raise exception 'expected canonical eligibility view dependency';end if;
end;$$;

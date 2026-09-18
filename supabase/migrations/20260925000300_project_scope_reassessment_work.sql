-- A newly authorized interval is genuinely queued even before its first leased
-- record job is materialized. Expose the durable queue, never claim it is settled.
do $$ declare original text; revised text; needle text; addition text; begin
 original:=pg_get_functiondef('public.read_betti_work_context(uuid)'::regprocedure);
 needle:='      union all'||chr(10)||'      select j.business_id,j.id,null,j.document_id';
 addition:=$replacement$      union all
      select s.business_id,s.id,r.id,null::uuid,null::uuid,'pending'::text,s.created_at,
        null::timestamptz,s.created_at,'scope_reassessment'::text
      from public.bookkeeping_scope_reassessments s join public.bookkeeping_records r
        on r.business_id=s.business_id and r.occurred_on>=s.from_date and r.occurred_on<s.before_date
        and (s.cursor_id is null or r.id>s.cursor_id)
      where s.business_id=b.id and s.completed_at is null
        and public.bookkeeping_activity_in_scope(r.business_id,r.occurred_on)
      union all
      select j.business_id,j.id,null,j.document_id$replacement$;
 revised:=replace(original,needle,addition);
 if revised=original then raise exception 'Expected work context queue boundary missing';end if;
 execute revised;
end;$$;

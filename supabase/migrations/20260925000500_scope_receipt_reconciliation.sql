-- Matching/convergence are trusted bookkeeping work too. Keep both sides inside
-- authorized scope, using the internal predicate after canonical ownership checks.
do $$ declare definition text; revised text; begin
 definition:=pg_get_viewdef('public.bookkeeping_autonomous_receipt_match_candidates'::regclass,true);
 revised:=replace(definition,'bookkeeping_date_is_active(', 'bookkeeping_activity_in_scope(');
 if revised=definition then raise exception 'Expected matching scope predicate missing';end if;
 execute 'create or replace view public.bookkeeping_autonomous_receipt_match_candidates with(security_invoker=true) as '||revised;
 definition:=regexp_replace(pg_get_viewdef('public.bookkeeping_receipt_convergence_candidates'::regclass,true),';\s*$','');
 execute 'create or replace view public.bookkeeping_receipt_convergence_candidates with(security_invoker=true) as '
  ||definition||' and public.bookkeeping_activity_in_scope(financial_record.business_id,financial_record.occurred_on)'
  ||' and public.bookkeeping_activity_in_scope(receipt_record.business_id,receipt_record.occurred_on)';
end;$$;

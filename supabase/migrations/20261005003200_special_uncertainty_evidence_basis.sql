-- Preserve a special-workflow uncertainty as uncertainty, not a seven-day
-- postponement or financial fact. No historical event is rewritten/backfilled.
create table public.bookkeeping_special_uncertainty_basis (
 special_event_id uuid primary key references public.bookkeeping_special_events(id) on delete restrict,
 business_id uuid not null references public.businesses(id) on delete restrict,
 evidence_fingerprint text not null
);
alter table public.bookkeeping_special_uncertainty_basis enable row level security;
revoke all on public.bookkeeping_special_uncertainty_basis from public,anon,authenticated;
grant select,insert on public.bookkeeping_special_uncertainty_basis to service_role;
create trigger special_uncertainty_basis_immutable before update or delete on public.bookkeeping_special_uncertainty_basis
 for each row execute function public.reject_canonical_bookkeeping_mutation();
create function public.capture_special_uncertainty_basis() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.action='unsure' then
  insert into public.bookkeeping_special_uncertainty_basis values(new.id,new.business_id,
   public.current_bookkeeping_evidence_fingerprint(new.business_id,new.bookkeeping_record_id));
 end if;
 return new;
end;$$;
revoke all on function public.capture_special_uncertainty_basis() from public,anon,authenticated;
create trigger capture_special_uncertainty_basis after insert on public.bookkeeping_special_events
 for each row execute function public.capture_special_uncertainty_basis();
alter function public.read_betti_work_context(uuid) rename to read_betti_work_context_before_special_uncertainty;
revoke all on function public.read_betti_work_context_before_special_uncertainty(uuid) from public,anon,authenticated;
create function public.read_betti_work_context(p_business_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;begin
 result:=public.read_betti_work_context_before_special_uncertainty(p_business_id);
 return result||jsonb_build_object('specialUncertainties',coalesce((select jsonb_agg(to_jsonb(u)) from (
  select distinct on(s.bookkeeping_record_id) s.business_id,s.id,s.bookkeeping_record_id record_id,s.decision_id,s.created_at
  from public.bookkeeping_special_events s join public.bookkeeping_special_uncertainty_basis b
   on b.special_event_id=s.id and b.business_id=s.business_id
  join jsonb_array_elements(result->'records') r on r->>'record_id'=s.bookkeeping_record_id::text
   and r->>'decision_id'=s.decision_id::text
  where s.business_id=p_business_id and s.action='unsure'
   and b.evidence_fingerprint=public.current_bookkeeping_evidence_fingerprint(p_business_id,s.bookkeeping_record_id)
  order by s.bookkeeping_record_id,s.created_at desc,s.id desc
 )u),'[]'));
end;$$;
revoke all on function public.read_betti_work_context(uuid) from public,anon;
grant execute on function public.read_betti_work_context(uuid) to authenticated;

-- Old publications cannot present a special question whose uncertainty is held.
do $$ declare original text; updated text; signature text; begin
 foreach signature in array array['public.read_betti_action_index(uuid,uuid,text,boolean)',
 'public.execute_betti_indexed_question(uuid,uuid,uuid,text,jsonb,uuid,boolean)'] loop
  original:=pg_get_functiondef(signature::regprocedure);
  updated:=replace(original,'betti-action-index:v7-catch-up-journey','betti-action-index:v8-special-uncertainty');
  if updated=original then raise exception 'Expected action-index version missing';end if;
  execute updated;
 end loop;
end;$$;

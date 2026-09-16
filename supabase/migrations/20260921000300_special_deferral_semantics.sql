alter table public.bookkeeping_special_events drop constraint bookkeeping_special_events_action_check;
alter table public.bookkeeping_special_events add constraint bookkeeping_special_events_action_check check(action in('merchant_return','reimbursement','refund_link','refund_unlink','loan_payment','owner_use','card_payment','defer','unsure'));
do $$declare definition text;revised text;begin
 definition:=pg_get_functiondef('public.record_special_transaction(uuid,uuid,uuid,text,uuid,bigint)'::regprocedure);
 revised:=replace(definition,'elsif p_action=''defer'' then','elsif p_action in(''defer'',''unsure'') then');
 if revised=definition then raise exception 'special action function changed';end if;execute revised;
end;$$;
-- Explicit deferral delays existing conversational issues, without answering them.
alter function public.list_current_askable_bookkeeping_question_event_ids(timestamptz) rename to list_current_askable_bookkeeping_question_event_ids_before_special;
create function public.list_current_askable_bookkeeping_question_event_ids(p_as_of timestamptz default now()) returns table(event_id uuid)
language sql stable security definer set search_path='' as $$
 select q.event_id from public.list_current_askable_bookkeeping_question_event_ids_before_special(p_as_of) q
 join public.bookkeeping_review_events e on e.id=q.event_id
 where not exists(select 1 from public.bookkeeping_special_events s where s.bookkeeping_record_id=e.bookkeeping_record_id and s.business_id=e.business_id and s.decision_id=e.based_on_decision_id and s.action='defer' and s.created_at>p_as_of-interval '7 days');
$$;
revoke all on function public.list_current_askable_bookkeeping_question_event_ids(timestamptz) from public,anon;
grant execute on function public.list_current_askable_bookkeeping_question_event_ids(timestamptz) to authenticated;

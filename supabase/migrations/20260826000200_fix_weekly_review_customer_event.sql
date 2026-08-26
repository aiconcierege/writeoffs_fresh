-- Remove an accidental reference to the correction-link RPC parameter from the
-- separate period-event function. Customer review actions remain owner-scoped,
-- append-only, idempotent, and bound to the exact presented snapshot.
create or replace function public.append_customer_review_period_event(
  p_review_period_id uuid,p_expected_event_id uuid,p_event_type text,
  p_review_snapshot_id uuid,p_deferred_until timestamptz,p_request_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare selected_business uuid; current_event public.bookkeeping_review_period_events%rowtype; inserted uuid;
begin
  select id into selected_business from public.businesses where owner_user_id=(select auth.uid());
  if selected_business is null then raise exception 'Business was not found'; end if;
  if p_event_type not in ('deferred','correction_started','confirmed') then
    raise exception 'Unsupported customer review action'; end if;
  select * into current_event from public.bookkeeping_review_period_events
    where id=p_expected_event_id and review_period_id=p_review_period_id
      and business_id=selected_business for update;
  if not found or exists(select 1 from public.bookkeeping_review_period_events
    where supersedes_event_id=current_event.id) then raise exception 'Review state changed'; end if;
  if p_event_type='confirmed' and (p_review_snapshot_id is null
    or current_event.event_type not in ('presented','correction_linked')) then
    raise exception 'Only the exact presented review can be confirmed'; end if;
  if p_event_type='confirmed' and p_review_snapshot_id is distinct from current_event.review_snapshot_id then
    raise exception 'Presented review snapshot changed'; end if;
  insert into public.bookkeeping_review_period_events(business_id,review_period_id,
    sequence_number,supersedes_event_id,event_type,review_snapshot_id,deferred_until,
    provenance,actor_user_id,request_id)
  values(selected_business,p_review_period_id,current_event.sequence_number+1,current_event.id,
    p_event_type,coalesce(p_review_snapshot_id,current_event.review_snapshot_id),p_deferred_until,
    'user',(select auth.uid()),p_request_id) returning id into inserted;
  return inserted;
exception when unique_violation then
  select id into inserted from public.bookkeeping_review_period_events
    where business_id=selected_business and request_id=p_request_id;
  return inserted;
end $$;

revoke all on function public.append_customer_review_period_event(uuid,uuid,text,uuid,timestamptz,uuid) from public,anon;
grant execute on function public.append_customer_review_period_event(uuid,uuid,text,uuid,timestamptz,uuid) to authenticated;

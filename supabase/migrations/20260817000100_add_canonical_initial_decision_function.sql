-- Record the resolver-created initial decision as system provenance without
-- allowing authenticated callers to submit arbitrary system decisions.

create or replace function public.ensure_initial_bookkeeping_decision(
  p_business_id uuid,
  p_bookkeeping_record_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_decision_id uuid;
begin
  if (select auth.uid()) is null or not exists (
    select 1
    from public.businesses
    where businesses.id = p_business_id
      and businesses.owner_user_id = (select auth.uid())
  ) then
    raise exception 'bookkeeping Business is unavailable to the authenticated user';
  end if;

  insert into public.bookkeeping_decisions (
    business_id, bookkeeping_record_id, supersedes_decision_id,
    bookkeeping_nature, treatment, review_status, provenance,
    actor_user_id, confidence, reason, business_purpose
  ) values (
    p_business_id, p_bookkeeping_record_id, null,
    null, 'unresolved', 'needs_review', 'system',
    null, null, 'Awaiting bookkeeping review.', null
  )
  on conflict (bookkeeping_record_id)
    where supersedes_decision_id is null do nothing
  returning id into selected_decision_id;

  if selected_decision_id is null then
    select decisions.id into selected_decision_id
    from public.bookkeeping_decisions as decisions
    where decisions.business_id = p_business_id
      and decisions.bookkeeping_record_id = p_bookkeeping_record_id
      and not exists (
        select 1 from public.bookkeeping_decisions as successors
        where successors.supersedes_decision_id = decisions.id
      );
  end if;

  if selected_decision_id is null then
    raise exception 'bookkeeping decision is unavailable';
  end if;
  return selected_decision_id;
end;
$$;

revoke execute on function public.ensure_initial_bookkeeping_decision(uuid, uuid)
  from public, anon;
grant execute on function public.ensure_initial_bookkeeping_decision(uuid, uuid)
  to authenticated;

comment on function public.ensure_initial_bookkeeping_decision(uuid, uuid) is
  'Owner-checked, idempotent creation of the fixed unresolved system decision used by canonical source resolution.';

-- Customer review-stage progress is append-only and separate from canonical
-- transaction decisions. Questions remain one continuous canonical queue.
create table public.bookkeeping_weekly_review_workflow_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  review_period_id uuid not null,
  supersedes_event_id uuid,
  stage text not null check(stage in ('personal','mixed','questions','documentation','mileage','final')),
  event_type text not null check(event_type in ('stage_completed','stage_reopened')),
  details jsonb not null default '{}'::jsonb check(jsonb_typeof(details)='object'),
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  request_id uuid not null,
  created_at timestamptz not null default now(),
  unique(id,business_id,review_period_id),
  unique(business_id,request_id),
  foreign key(review_period_id,business_id)
    references public.bookkeeping_review_periods(id,business_id) on delete restrict,
  foreign key(supersedes_event_id,business_id,review_period_id)
    references public.bookkeeping_weekly_review_workflow_events(id,business_id,review_period_id) on delete restrict
);
create unique index bookkeeping_weekly_review_workflow_one_successor_idx
  on public.bookkeeping_weekly_review_workflow_events(supersedes_event_id)
  where supersedes_event_id is not null;

create trigger bookkeeping_weekly_review_workflow_events_immutable before update or delete
  on public.bookkeeping_weekly_review_workflow_events for each row
  execute function public.reject_weekly_review_history_mutation();

create or replace function public.append_weekly_review_workflow_event(
  p_review_period_id uuid,p_expected_event_id uuid,p_stage text,p_event_type text,
  p_details jsonb,p_request_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare selected_business uuid; current_event public.bookkeeping_weekly_review_workflow_events%rowtype;
  inserted uuid; expected_stage text;
begin
  select id into selected_business from public.businesses where owner_user_id=(select auth.uid());
  if selected_business is null then raise exception 'Business was not found'; end if;
  select id into inserted from public.bookkeeping_weekly_review_workflow_events
    where business_id=selected_business and request_id=p_request_id;
  if inserted is not null then return inserted; end if;
  if p_stage not in ('personal','mixed','questions','documentation','mileage','final')
    or p_event_type not in ('stage_completed','stage_reopened') or jsonb_typeof(p_details)<>'object'
  then raise exception 'Review workflow action is invalid'; end if;
  select * into current_event from public.bookkeeping_weekly_review_workflow_events
    where business_id=selected_business and review_period_id=p_review_period_id
      and not exists(select 1 from public.bookkeeping_weekly_review_workflow_events successor
        where successor.supersedes_event_id=bookkeeping_weekly_review_workflow_events.id) for update;
  if current_event.id is distinct from p_expected_event_id then raise exception 'Review workflow changed'; end if;
  expected_stage:=case current_event.stage when 'personal' then 'mixed' when 'mixed' then 'questions'
    when 'questions' then 'documentation' when 'documentation' then 'mileage'
    when 'mileage' then 'final' else null end;
  if p_event_type='stage_completed' and ((current_event.id is null and p_stage<>'personal')
    or (current_event.id is not null and p_stage<>expected_stage)) then raise exception 'Review stages must be completed in order'; end if;
  insert into public.bookkeeping_weekly_review_workflow_events(business_id,review_period_id,
    supersedes_event_id,stage,event_type,details,actor_user_id,request_id)
  values(selected_business,p_review_period_id,current_event.id,p_stage,p_event_type,p_details,
    (select auth.uid()),p_request_id) returning id into inserted;
  return inserted;
end $$;

alter table public.bookkeeping_weekly_review_workflow_events enable row level security;
create policy bookkeeping_weekly_review_workflow_events_select_own on public.bookkeeping_weekly_review_workflow_events
  for select to authenticated using(exists(select 1 from public.businesses b where b.id=business_id and b.owner_user_id=(select auth.uid())));
grant select on public.bookkeeping_weekly_review_workflow_events to authenticated,service_role;
grant insert on public.bookkeeping_weekly_review_workflow_events to service_role;
revoke execute on function public.append_weekly_review_workflow_event(uuid,uuid,text,text,jsonb,uuid) from public,anon;
grant execute on function public.append_weekly_review_workflow_event(uuid,uuid,text,text,jsonb,uuid) to authenticated;

comment on table public.bookkeeping_weekly_review_workflow_events is
  'Append-only proof of transaction-first customer review stages; never bookkeeping truth.';

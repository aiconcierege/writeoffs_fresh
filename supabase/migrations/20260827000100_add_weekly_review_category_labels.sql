-- Preserve the customer-facing category as part of the exact immutable weekly
-- review snapshot. Existing snapshots remain valid with no category label.

alter table public.bookkeeping_review_snapshot_items
  add column category_label text
  check(category_label is null or length(trim(category_label)) between 1 and 120);

create or replace function public.present_bookkeeping_weekly_review(
  p_business_id uuid,p_review_period_id uuid,p_expected_event_id uuid,p_membership_scope text,
  p_currency text,p_income_cents bigint,p_expense_cents bigint,p_unresolved_question_count integer,
  p_activity_fingerprint text,p_items jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare current_event public.bookkeeping_review_period_events%rowtype; snapshot_id uuid;
  next_revision integer; item jsonb;
begin
  if p_membership_scope not in ('expenses','business') or jsonb_typeof(p_items)<>'array'
    or jsonb_array_length(p_items)=0 then raise exception 'Review presentation is invalid'; end if;
  select * into current_event from public.bookkeeping_review_period_events
    where id=p_expected_event_id and business_id=p_business_id and review_period_id=p_review_period_id for update;
  if not found or current_event.event_type not in ('opened','questions_pending','ready','reopened')
    or exists(select 1 from public.bookkeeping_review_period_events where supersedes_event_id=current_event.id)
  then raise exception 'Review state changed'; end if;
  select coalesce(max(revision),0)+1 into next_revision from public.bookkeeping_review_snapshots
    where review_period_id=p_review_period_id;
  insert into public.bookkeeping_review_snapshots(business_id,review_period_id,revision,membership_scope,
    currency,income_cents,expense_cents,unresolved_question_count,activity_fingerprint,presentation_version)
  values(p_business_id,p_review_period_id,next_revision,p_membership_scope,p_currency,
    case when p_membership_scope='business' then p_income_cents else null end,p_expense_cents,
    p_unresolved_question_count,p_activity_fingerprint,2) returning id into snapshot_id;
  for item in select value from jsonb_array_elements(p_items) loop
    if not exists(select 1 from public.bookkeeping_decisions decision
      where decision.id=(item->>'bookkeepingDecisionId')::uuid
        and decision.bookkeeping_record_id=(item->>'bookkeepingRecordId')::uuid
        and decision.business_id=p_business_id
        and not exists(select 1 from public.bookkeeping_decisions successor where successor.supersedes_decision_id=decision.id))
    then raise exception 'Review item is not a current canonical decision'; end if;
    insert into public.bookkeeping_review_snapshot_items(business_id,review_period_id,review_snapshot_id,
      bookkeeping_record_id,bookkeeping_decision_id,activity_role,display_label,category_label,treatment,
      signed_business_amount_cents,financial_transaction_id,occurred_on,evidence_fingerprint)
    values(p_business_id,p_review_period_id,snapshot_id,(item->>'bookkeepingRecordId')::uuid,
      (item->>'bookkeepingDecisionId')::uuid,item->>'activityRole',left(trim(item->>'displayLabel'),240),
      case when nullif(trim(item->>'categoryLabel'),'') is null then null
        else left(trim(item->>'categoryLabel'),120) end,item->>'treatment',
      (item->>'signedBusinessAmountCents')::bigint,(item->>'financialTransactionId')::uuid,
      (item->>'occurredOn')::date,item->>'evidenceFingerprint');
  end loop;
  insert into public.bookkeeping_review_period_events(business_id,review_period_id,sequence_number,
    supersedes_event_id,event_type,review_snapshot_id,provenance)
  values(p_business_id,p_review_period_id,current_event.sequence_number+1,current_event.id,
    'presented',snapshot_id,'system');
  return snapshot_id;
end $$;

revoke execute on function public.present_bookkeeping_weekly_review(uuid,uuid,uuid,text,text,bigint,bigint,integer,text,jsonb)
  from public,anon,authenticated;
grant execute on function public.present_bookkeeping_weekly_review(uuid,uuid,uuid,text,text,bigint,bigint,integer,text,jsonb)
  to service_role;

-- Obsolete evidence-bound issues remain historical, not answered/resolved.
-- Reassessing an open issue must bind it to current evidence without inventing an answer.
create or replace function public.open_bookkeeping_review_issue_v2(
  p_business_id uuid,
  p_bookkeeping_record_id uuid,
  p_based_on_decision_id uuid,
  p_reason text,
  p_issue_key text,
  p_context_fingerprint text,
  p_question_context jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  issue_uuid uuid := gen_random_uuid();
  selected_event_id uuid;
  selected_evidence_fingerprint text;
  existing_event public.bookkeeping_review_events%rowtype;
begin
  if p_reason not in (
    'BUSINESS_USE_UNCLEAR', 'BUSINESS_PURPOSE_NEEDED',
    'MIXED_USE_CLARIFICATION', 'TRANSACTION_TYPE_UNCLEAR',
    'CONFLICTING_EVIDENCE'
  ) then raise exception 'unsupported Weekly Review reason'; end if;
  if length(btrim(p_issue_key)) not between 1 and 200
    or length(btrim(p_context_fingerprint)) not between 1 and 200
  then raise exception 'review issue identity is required'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_bookkeeping_record_id::text, 41));
  selected_evidence_fingerprint := public.current_bookkeeping_evidence_fingerprint(
    p_business_id, p_bookkeeping_record_id
  );
  perform pg_advisory_xact_lock(hashtextextended(
    p_business_id::text || ':' || p_bookkeeping_record_id::text || ':' ||
    p_reason || ':' || p_issue_key, 0
  ));

  insert into public.bookkeeping_review_events (
    id, business_id, bookkeeping_record_id, review_issue_id,
    supersedes_event_id, sequence_number, event_type, reason,
    based_on_decision_id, issue_key, context_fingerprint,
    evidence_fingerprint, question_context, provenance, actor_user_id
  ) values (
    issue_uuid, p_business_id, p_bookkeeping_record_id, issue_uuid,
    null, 1, 'opened', p_reason, p_based_on_decision_id,
    btrim(p_issue_key), btrim(p_context_fingerprint),
    selected_evidence_fingerprint, p_question_context, 'automation', null
  ) on conflict (business_id, bookkeeping_record_id, reason, issue_key)
    where event_type = 'opened' do nothing
  returning id into selected_event_id;

  if selected_event_id is null then
    select events.id into selected_event_id
    from public.bookkeeping_review_events as events
    where events.business_id = p_business_id
      and events.bookkeeping_record_id = p_bookkeeping_record_id
      and events.reason = p_reason and events.issue_key = btrim(p_issue_key)
      and not exists (
        select 1 from public.bookkeeping_review_events as successors
        where successors.supersedes_event_id = events.id
      );
  end if;
  select * into existing_event from public.bookkeeping_review_events where id=selected_event_id;
  if existing_event.event_type in ('opened','reopened')
    and existing_event.evidence_fingerprint is distinct from selected_evidence_fingerprint then
    return public.open_bookkeeping_review_issue_v2(p_business_id,p_bookkeeping_record_id,
      p_based_on_decision_id,p_reason,
      'evidence-refresh:'||md5(p_issue_key||':'||selected_evidence_fingerprint),
      p_context_fingerprint,p_question_context);
  end if;
  -- An answered/resolved issue or a customer deferral is never silently reopened.
  return selected_event_id;
end;
$$;

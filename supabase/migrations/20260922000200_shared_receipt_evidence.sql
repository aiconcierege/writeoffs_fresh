-- Read model over existing immutable extractions. No customer backfill, mutation,
-- or new evidence authority. Latest corrections win; history remains intact.
create view public.current_bookkeeping_receipt_extractions
with (security_invoker=true,security_barrier=true) as
select distinct on (business_id,receipt_id) e.*
from public.bookkeeping_receipt_extractions e
order by business_id,receipt_id,created_at desc,id desc;
grant select on public.current_bookkeeping_receipt_extractions to authenticated,service_role;

-- New extraction/correction evidence must reach records already linked to a
-- receipt, not only records first created after extraction. Existing jobs retain
-- leases/idempotency; this schedules only future material evidence events.
create function public.enqueue_receipt_extraction_evidence() returns trigger
language plpgsql security definer set search_path='' as $$
declare target record;
begin
 for target in select distinct l.bookkeeping_record_id from public.bookkeeping_document_links l
   where l.business_id=new.business_id and l.receipt_id=new.receipt_id and l.revoked_at is null loop
  perform public.request_bookkeeping_processing(new.business_id,target.bookkeeping_record_id,
    'deterministic_evaluation','bookkeeping-evaluator:v2:record:'||target.bookkeeping_record_id::text
      ||':receipt-extraction:'||new.id::text);
 end loop;
 return new;
end;$$;
revoke all on function public.enqueue_receipt_extraction_evidence() from public,anon,authenticated;
create trigger bookkeeping_receipt_extractions_enqueue_evidence after insert
on public.bookkeeping_receipt_extractions for each row execute function public.enqueue_receipt_extraction_evidence();

-- A customer business-use answer is a legitimate meal-context prerequisite too.
-- Do not strand a new meal question just because the earlier decision was user-authored.
-- Preserve all ownership/current-event/current-decision/evidence guards.
do $$ declare original text; revised text;
begin
 original:=pg_get_functiondef('public.answer_bookkeeping_business_context_meal_issue(uuid,uuid,uuid,text,text,text,text,text,text)'::regprocedure);
 revised:=replace(original, 'a.assessment_state=''established''',
   'a.assessment_state in(''established'',''customer_authoritative'')');
 if revised=original then raise exception 'meal context function changed; inspect before migration'; end if;
 revised:=replace(revised,
   'elsif purpose is null and nullif(btrim(d.business_purpose),'''') is null then',
   'elsif purpose is null and (nullif(btrim(d.business_purpose),'''') is null or
     (public.bookkeeping_has_current_expense_purpose_answer(e.business_id,e.bookkeeping_record_id)
      and not coalesce(e.question_context->''establishedFacts'' ? ''businessPurpose'',false))) then');
 execute revised;
end;$$;

-- Evidence enrichment refreshes unanswered questions in place in the event chain.
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
    and (existing_event.evidence_fingerprint is distinct from selected_evidence_fingerprint
      or existing_event.context_fingerprint is distinct from btrim(p_context_fingerprint)
      or existing_event.based_on_decision_id is distinct from p_based_on_decision_id) then
    -- Refresh the same unanswered issue, preserving its full history and identity.
    -- The caller is the trusted worker; answered/resolved/skipped issues never enter here.
    insert into public.bookkeeping_review_events(business_id,bookkeeping_record_id,review_issue_id,
      supersedes_event_id,sequence_number,event_type,reason,based_on_decision_id,issue_key,
      context_fingerprint,evidence_fingerprint,question_context,provenance)
    values(p_business_id,p_bookkeeping_record_id,existing_event.review_issue_id,existing_event.id,
      existing_event.sequence_number+1,'reopened',p_reason,p_based_on_decision_id,existing_event.issue_key,
      btrim(p_context_fingerprint),selected_evidence_fingerprint,p_question_context,'automation')
    returning id into selected_event_id;
  end if;
  -- An answered/resolved issue or a customer deferral is never silently reopened.
  return selected_event_id;
end;
$$;

-- An outstanding question may receive a new evidence/decision version without
-- pretending it was answered or resolving and recreating its identity. Customer
-- deferrals and answers are not eligible for this refresh transition.
do $$ declare original text; revised text;
begin
 original:=pg_get_functiondef('public.validate_bookkeeping_review_event()'::regprocedure);
 revised:=replace(original, 'if predecessor.event_type <> ''resolved''',
   'if predecessor.event_type not in (''resolved'', ''opened'', ''reopened'')');
 revised:=replace(revised, 'or new.context_fingerprint = predecessor.context_fingerprint',
   'or (new.context_fingerprint = predecessor.context_fingerprint
     and new.evidence_fingerprint is not distinct from predecessor.evidence_fingerprint
     and new.based_on_decision_id is not distinct from predecessor.based_on_decision_id)');
 if revised=original then raise exception 'review validator changed; inspect before migration'; end if;
 execute revised;
end;$$;

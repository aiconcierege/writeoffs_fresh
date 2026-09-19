-- Keep one money-source fact while allowing the evidence worker to enrich its
-- explanation. Generic SQL reconciliation must not erase that understanding.
-- No customer data is rewritten; this changes subsequent canonical generation.
create or replace function public.open_bookkeeping_review_issue_v2(p_business_id uuid,p_bookkeeping_record_id uuid,
 p_based_on_decision_id uuid,p_reason text,p_issue_key text,p_context_fingerprint text,p_question_context jsonb default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare fp text; existing_event public.bookkeeping_review_events%rowtype;
begin
 if p_reason='TRANSACTION_TYPE_UNCLEAR' and p_question_context->>'factType'='money_in_source'
 and exists(select 1 from public.bookkeeping_records r where r.id=p_bookkeeping_record_id
   and r.business_id=p_business_id and r.source_kind='financial_transaction' and r.amount_cents>0) then
  perform pg_advisory_xact_lock(hashtextextended(p_bookkeeping_record_id::text,41));
  fp:=public.current_bookkeeping_evidence_fingerprint(p_business_id,p_bookkeeping_record_id);
  select * into existing_event from public.bookkeeping_review_events where id=
   public.current_money_source_question_event(p_business_id,p_bookkeeping_record_id,p_based_on_decision_id,fp);
  p_issue_key:=coalesce(existing_event.issue_key,'money-source:'||p_bookkeeping_record_id::text||':'||p_based_on_decision_id::text);
  -- Only carry a worker explanation across the exact same decision and evidence.
  -- Explicit null from a worker can withdraw it; a generic generator cannot.
  if not (p_question_context ? 'understanding') and existing_event.question_context ? 'understanding' then
   p_question_context:=p_question_context||jsonb_build_object('understanding',existing_event.question_context->'understanding');
  end if;
  p_context_fingerprint:=md5(p_based_on_decision_id::text||':money-source:'||fp||
   case when jsonb_typeof(p_question_context->'understanding')='object'
    then ':'||(p_question_context->'understanding')::text else '' end);
 end if;
 -- The existing append-only command updates only unanswered issues. Customer
 -- answers, resolutions and deferrals retain their authority and exact identity.
 return public.open_bookkeeping_review_issue_v2_before_money_source_identity(p_business_id,p_bookkeeping_record_id,
  p_based_on_decision_id,p_reason,p_issue_key,p_context_fingerprint,p_question_context);
end;$$;
revoke all on function public.open_bookkeeping_review_issue_v2(uuid,uuid,uuid,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.open_bookkeeping_review_issue_v2(uuid,uuid,uuid,text,text,text,jsonb) to service_role;

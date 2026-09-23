\set ON_ERROR_STOP on
begin;
do $$ begin if current_database()<>'routing_certification_local' then raise exception 'Local synthetic database required';end if;end $$;
do $test$
declare uid uuid:=gen_random_uuid();bid uuid;r public.bookkeeping_records;d uuid;e public.bookkeeping_review_events;
 result jsonb;reason text;before_decision jsonb;after_decision jsonb;message text;did uuid;eid uuid;skipped uuid;
begin
 insert into auth.users(id,email,raw_user_meta_data) values(uid,'uncertainty@local.invalid','{"synthetic":true}');
 select id into bid from public.businesses where owner_user_id=uid;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','authenticated','aal','aal2')::text,true);
 foreach reason in array array['BUSINESS_USE_UNCLEAR','BUSINESS_PURPOSE_NEEDED','MIXED_USE_CLARIFICATION','TRANSACTION_TYPE_UNCLEAR'] loop
  r:=public.ensure_bookkeeping_record(bid,'manual',null,'automation',gen_random_uuid()::text,-20000,'USD','2026-05-20');
  d:=public.append_bookkeeping_decision(bid,r.id,null,
   case when reason='BUSINESS_PURPOSE_NEEDED' then 'expense' else null end,
   case when reason='BUSINESS_PURPOSE_NEEDED' then 'business' else 'unresolved' end,
   'needs_review','system',null,'More facts needed',null,
   case when reason='BUSINESS_PURPOSE_NEEDED' then '[{"kind":"business","amount_cents":-20000,"tax_category_key":"supplies"}]'::jsonb else '[]'::jsonb end);
  eid:=public.open_bookkeeping_review_issue_v2(bid,r.id,d,reason,gen_random_uuid()::text,gen_random_uuid()::text,jsonb_build_object('schemaVersion',1,'reason',reason));
  select * into e from public.bookkeeping_review_events where id=eid;
  select to_jsonb(x)-array['id','created_at','supersedes_decision_id','provenance','actor_user_id'] into before_decision from public.bookkeeping_decisions x where id=d;
  begin
   perform public.answer_bookkeeping_customer_not_sure(e.review_issue_id,e.id,d,e.context_fingerprint,e.evidence_fingerprint,'{"schemaVersion":1,"response":"purchase"}');
   raise exception 'Invalid answer accepted';
  exception when raise_exception then get stacked diagnostics message=message_text;
   if message<>'only the exact Not sure response is accepted' then raise exception '%',message;end if;
  end;
  result:=public.answer_bookkeeping_customer_not_sure(e.review_issue_id,e.id,d,e.context_fingerprint,e.evidence_fingerprint,'{"schemaVersion":1,"response":"not_sure"}');
  did:=(result->>'decision_id')::uuid;
  select to_jsonb(x)-array['id','created_at','supersedes_decision_id','provenance','actor_user_id'] into after_decision from public.bookkeeping_decisions x where id=did;
  if before_decision is distinct from after_decision then raise exception 'Uncertainty invented bookkeeping facts';end if;
  if reason<>'BUSINESS_PURPOSE_NEEDED' and exists(select 1 from public.bookkeeping_allocations where bookkeeping_decision_id=did) then raise exception 'Uncertainty invented P&L allocation';end if;
  if reason='BUSINESS_PURPOSE_NEEDED' and not exists(select 1 from public.bookkeeping_allocations where bookkeeping_decision_id=did and allocation_kind='business' and amount_cents=-20000 and tax_category_key='supplies') then raise exception 'Uncertainty removed supported expense';end if;
  if not exists(select 1 from public.bookkeeping_review_events where id=(result->>'answered_event_id')::uuid and answer_payload='{"schemaVersion":1,"response":"not_sure"}') then raise exception 'Uncertainty not persisted';end if;
  if not exists(select 1 from public.bookkeeping_review_events where id=(result->>'resolved_event_id')::uuid and event_type='resolved') then raise exception 'Answer did not close current turn';end if;
  -- Defer is a separate event, with no knowledge answer or new decision.
  eid:=public.open_bookkeeping_review_issue_v2(bid,r.id,did,reason,gen_random_uuid()::text,gen_random_uuid()::text,jsonb_build_object('schemaVersion',1,'reason',reason));
  skipped:=public.skip_bookkeeping_review_issue(bid,eid,eid,now()+interval '7 days');
  if not exists(select 1 from public.bookkeeping_review_events where id=skipped and event_type='skipped' and answer_payload is null and deferred_until>now()) then raise exception 'Defer semantics lost';end if;
  if exists(select 1 from public.bookkeeping_decisions where supersedes_decision_id=did) then raise exception 'Defer changed facts';end if;
 end loop;
end;$test$;
rollback;

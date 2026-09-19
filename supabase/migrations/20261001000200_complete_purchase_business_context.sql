-- Fill only the unknown business-use dimension after a factual purchase answer.
-- The canonical worker selects this operation only for ordinary purchases with
-- no allocation-specific question. No merchant/category logic is duplicated here.
create function public.complete_purchase_business_context(p_business uuid,p_record uuid,p_expected uuid,p_answer uuid,p_account_use uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare account_id uuid; account_event public.financial_account_use_events%rowtype;
 d public.bookkeeping_decisions%rowtype; r public.bookkeeping_records%rowtype;
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'Worker required' using errcode='42501';end if;
 select ft.financial_account_id into strict account_id from public.bookkeeping_financial_sources fs
 join public.financial_transactions ft on ft.id=fs.financial_transaction_id and ft.business_id=fs.business_id
 where fs.business_id=p_business and fs.bookkeeping_record_id=p_record and fs.revoked_at is null;
 -- Same lock/order as an account-use change: neither fact can change mid-write.
 perform pg_advisory_xact_lock(hashtextextended('account-use:'||account_id::text,0));
 perform pg_advisory_xact_lock(hashtextextended(p_record::text,41));
 select * into strict account_event from public.current_financial_account_use
 where business_id=p_business and financial_account_id=account_id;
 if account_event.id<>p_account_use or account_event.designation<>'business_only'
 then raise exception 'Account use changed';end if;
 select * into strict r from public.bookkeeping_records where id=p_record and business_id=p_business;
 if r.amount_cents>=0 or not public.bookkeeping_date_is_active(p_business,r.occurred_on)
 then raise exception 'Active purchase required';end if;
 select * into strict d from public.bookkeeping_decisions where business_id=p_business and bookkeeping_record_id=p_record
 and not exists(select 1 from public.bookkeeping_decisions n where n.supersedes_decision_id=bookkeeping_decisions.id);
 if d.id<>p_expected or d.provenance<>'user' or d.bookkeeping_nature<>'expense' or d.treatment<>'unresolved'
 or exists(select 1 from public.bookkeeping_allocations where bookkeeping_decision_id=d.id)
 then raise exception 'Purchase decision changed';end if;
 if not exists(select 1 from public.bookkeeping_review_events e where e.id=p_answer and e.business_id=p_business
  and e.bookkeeping_record_id=p_record and e.resulting_decision_id=d.id and e.event_type='answered'
  and e.provenance='user' and e.reason='TRANSACTION_TYPE_UNCLEAR' and e.answer_payload->>'activity'='purchase')
 or exists(select 1 from public.bookkeeping_decisions old where old.business_id=p_business and old.bookkeeping_record_id=p_record
  and old.provenance='user' and old.treatment in('business','personal','mixed_use','excluded'))
 or exists(select 1 from public.bookkeeping_review_events e where e.business_id=p_business and e.bookkeeping_record_id=p_record
  and e.reason='CONFLICTING_EVIDENCE' and e.event_type<>'resolved'
  and not exists(select 1 from public.bookkeeping_review_events n where n.supersedes_event_id=e.id))
 then raise exception 'Customer facts do not authorize completion';end if;
 return public.append_bookkeeping_decision(p_business,p_record,d.id,'expense','business','resolved','automation',0.99,
  'Customer designated the payment account as Business only. Account fact '||account_event.id::text||'; purchase answer '||p_answer::text||'.',
  d.business_purpose,jsonb_build_array(jsonb_build_object('kind','business','amount_cents',r.amount_cents)));
end;$$;
revoke all on function public.complete_purchase_business_context(uuid,uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.complete_purchase_business_context(uuid,uuid,uuid,uuid,uuid) to service_role;

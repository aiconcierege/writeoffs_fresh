-- Run after installing the function inside the same rollback transaction.
-- Caller supplies test.user_id / test.business_id for an isolated May fixture.
create function pg_temp.verify_purchase_context() returns jsonb language plpgsql as $$
declare e public.bookkeeping_review_events%rowtype; result jsonb; answered uuid; decision uuid; completed uuid; account_fact uuid; bid uuid:=current_setting('test.business_id')::uuid;
begin
 if not exists(select 1 from auth.users where id=current_setting('test.user_id')::uuid and raw_user_meta_data->>'synthetic_ux1'='true') then raise exception 'Synthetic fixture required';end if;
 select q.* into strict e from public.bookkeeping_review_events q join public.bookkeeping_records r on r.id=q.bookkeeping_record_id
 where r.business_id=bid and r.amount_cents=-17500 and q.reason='TRANSACTION_TYPE_UNCLEAR'
 and not exists(select 1 from public.bookkeeping_review_events n where n.supersedes_event_id=q.id);
 select u.id into strict account_fact from public.bookkeeping_financial_sources s join public.financial_transactions t on t.id=s.financial_transaction_id
 join public.current_financial_account_use u on u.financial_account_id=t.financial_account_id and u.business_id=bid
 where s.bookkeeping_record_id=e.bookkeeping_record_id and s.revoked_at is null;
 perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','aal','aal2','sub',current_setting('test.user_id'))::text,true);
 result:=public.answer_bookkeeping_transaction_type_review_issue(e.review_issue_id,e.id,e.based_on_decision_id,e.context_fingerprint,e.evidence_fingerprint,'{"schemaVersion":1,"activity":"purchase"}');
 decision:=(result->>'decision_id')::uuid;answered:=(result->>'answered_event_id')::uuid;
 if decision is null or answered is null then raise exception 'Purchase command did not return proof';end if;
 perform set_config('request.jwt.claims','{"role":"service_role"}',true);
 begin
  perform public.complete_purchase_business_context(bid,e.bookkeeping_record_id,decision,answered,gen_random_uuid());
  raise exception 'Changed account accepted' using errcode='ZX001';
 exception when sqlstate 'ZX001' then raise;when others then null;end;
 begin
  perform public.complete_purchase_business_context(gen_random_uuid(),e.bookkeeping_record_id,decision,answered,account_fact);
  raise exception 'Wrong tenant accepted' using errcode='ZX001';
 exception when sqlstate 'ZX001' then raise;when others then null;end;
 begin
  perform public.complete_purchase_business_context(bid,e.bookkeeping_record_id,decision,gen_random_uuid(),account_fact);
  raise exception 'Wrong proof accepted' using errcode='ZX001';
 exception when sqlstate 'ZX001' then raise;when others then null;end;
 completed:=public.complete_purchase_business_context(bid,e.bookkeeping_record_id,decision,answered,account_fact);
 if not exists(select 1 from public.bookkeeping_decisions d join public.bookkeeping_allocations a on a.bookkeeping_decision_id=d.id
 where d.id=completed and d.supersedes_decision_id=decision and d.provenance='automation' and d.treatment='business'
 and d.bookkeeping_nature='expense' and a.allocation_kind='business' and a.amount_cents=-17500 and a.tax_category_key is null)
 then raise exception 'Wrong working treatment';end if;
 begin
  perform public.complete_purchase_business_context(bid,e.bookkeeping_record_id,decision,answered,account_fact);
  raise exception 'Stale retry accepted' using errcode='ZX001';
 exception when sqlstate 'ZX001' then raise;when others then null;end;
 if has_function_privilege('authenticated','public.complete_purchase_business_context(uuid,uuid,uuid,uuid,uuid)','execute')
 or has_function_privilege('anon','public.complete_purchase_business_context(uuid,uuid,uuid,uuid,uuid)','execute') then raise exception 'Worker API exposed';end if;
 return '{"purchaseFactPreserved":true,"accountFactReused":true,"amountPreserved":true,"categoryNotInvented":true,"changedAccountRejected":true,"tenantRejected":true,"invalidProofRejected":true,"staleRetryRejected":true,"workerOnly":true}'::jsonb;
end;$$;
select pg_temp.verify_purchase_context() validation;

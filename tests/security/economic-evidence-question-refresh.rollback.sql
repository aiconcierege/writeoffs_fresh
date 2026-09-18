-- Run in a transaction against an explicitly selected synthetic staging tenant.
-- Set writeoffs.test_business_id and writeoffs.test_user_id before execution.
-- Never supplies/changes a real customer's answers; all assertions roll back.
begin;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
create function pg_temp.verify() returns jsonb language plpgsql as $$
declare r record; a uuid; b uuid; c uuid; issue uuid; account uuid; count1 int; begin
if not exists(select 1 from auth.users where id=current_setting('writeoffs.test_user_id')::uuid and raw_user_meta_data->>'synthetic_guided_contract'='true') then raise exception 'isolated synthetic tenant required';end if;
select br.id,br.business_id,d.id decision_id into r from public.bookkeeping_records br join public.bookkeeping_decisions d on d.bookkeeping_record_id=br.id and d.business_id=br.business_id where br.business_id=current_setting('writeoffs.test_business_id')::uuid and br.amount_cents=125000 and not exists(select 1 from public.bookkeeping_decisions s where s.supersedes_decision_id=d.id);
a:=public.open_bookkeeping_review_issue_v2(r.business_id,r.id,r.decision_id,'TRANSACTION_TYPE_UNCLEAR','refresh-proof',repeat('a',64),'{"schemaVersion":1,"reason":"TRANSACTION_TYPE_UNCLEAR","factType":"economic_nature"}'::jsonb);
select financial_account_id into account from public.current_financial_account_use where business_id=r.business_id limit 1;
perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','aal','aal2','sub',current_setting('writeoffs.test_user_id'))::text,true);
perform public.set_financial_account_use(account,'business_and_personal',now(),gen_random_uuid());
perform set_config('request.jwt.claims','{"role":"service_role"}',true);
b:=public.open_bookkeeping_review_issue_v2(r.business_id,r.id,r.decision_id,'TRANSACTION_TYPE_UNCLEAR','refresh-proof',repeat('a',64),'{"schemaVersion":1,"reason":"TRANSACTION_TYPE_UNCLEAR","factType":"economic_nature"}'::jsonb);
if a=b then raise exception 'changed evidence did not refresh';end if;
c:=public.open_bookkeeping_review_issue_v2(r.business_id,r.id,r.decision_id,'TRANSACTION_TYPE_UNCLEAR','refresh-proof',repeat('a',64),'{"schemaVersion":1,"reason":"TRANSACTION_TYPE_UNCLEAR","factType":"economic_nature"}'::jsonb);
if c<>b then raise exception 'unchanged retry created another version';end if;
select review_issue_id into issue from public.bookkeeping_review_events where id=b;
perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','aal','aal2','sub',current_setting('writeoffs.test_user_id'))::text,true);
c:=public.skip_bookkeeping_review_issue(r.business_id,issue,b,now()+interval '1 day');
perform set_config('request.jwt.claims','{"role":"service_role"}',true);
if public.open_bookkeeping_review_issue_v2(r.business_id,r.id,r.decision_id,'TRANSACTION_TYPE_UNCLEAR','refresh-proof',repeat('b',64),'{"schemaVersion":1,"reason":"TRANSACTION_TYPE_UNCLEAR","factType":"economic_nature"}'::jsonb)<>c then raise exception 'deferred issue reopened';end if;
b:=public.resolve_bookkeeping_review_issue(r.business_id,issue,c);
if public.open_bookkeeping_review_issue_v2(r.business_id,r.id,r.decision_id,'TRANSACTION_TYPE_UNCLEAR','refresh-proof',repeat('c',64),'{"schemaVersion":1,"reason":"TRANSACTION_TYPE_UNCLEAR","factType":"economic_nature"}'::jsonb)<>b then raise exception 'resolved issue reopened';end if;
count1:=public.enqueue_economic_evidence_reassessment(2,r.business_id);
if count1>2 then raise exception 'unbounded reassessment';end if;
perform public.enqueue_economic_evidence_reassessment(100,r.business_id);
if public.enqueue_economic_evidence_reassessment(100,r.business_id)<>0 then raise exception 'reassessment duplicated';end if;
perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','aal','aal2','sub',current_setting('writeoffs.test_user_id'))::text,true);
begin perform public.enqueue_economic_evidence_reassessment(2,r.business_id);raise exception 'customer worker permitted';exception when others then if SQLERRM<>'trusted bookkeeping worker required' then raise;end if;end;
return '{"evidenceOnlyRefresh":true,"sameVersionRetry":true,"deferralPreserved":true,"resolvedPreserved":true,"boundedReassessment":true,"workerTenantSelector":true,"workerRestricted":true,"rollback":true}'::jsonb;
end;$$;
select pg_temp.verify() validation;
rollback;

-- Run after the migration inside BEGIN on dedicated staging; always rolls back.
-- Dedicated staging only; execute inside BEGIN ... ROLLBACK with the migration.
-- Entirely transaction-local synthetic tenants, never a manual customer.
insert into auth.users(id,email,raw_user_meta_data)
values('8777c5e3-b615-4acd-a4dd-01056a1251dd','shared-evidence-a@example.invalid','{}'),
 ('be9ec1e8-7d61-422c-a20c-60d589440b04','shared-evidence-b@example.invalid','{}');
update public.businesses set id='8205b373-c03f-4099-a3ef-1b57b48fff2d' where owner_user_id='8777c5e3-b615-4acd-a4dd-01056a1251dd';
update public.businesses set id='6fe00fc0-16f9-4966-b4b5-ccad657aedfc' where owner_user_id='be9ec1e8-7d61-422c-a20c-60d589440b04';

insert into public.bookkeeping_records(id,business_id,source_kind,ingestion_key,amount_cents,currency,occurred_on)
values('f2000000-0000-4000-8000-000000000001','8205b373-c03f-4099-a3ef-1b57b48fff2d','manual','betti-work-a',-954,'USD','2026-09-08'),
('f2000000-0000-4000-8000-000000000002','6fe00fc0-16f9-4966-b4b5-ccad657aedfc','manual','betti-work-b',-1999,'USD','2026-05-01');
insert into public.bookkeeping_processing_jobs(business_id,bookkeeping_record_id,processing_reason,target_fingerprint)
values('8205b373-c03f-4099-a3ef-1b57b48fff2d','f2000000-0000-4000-8000-000000000001','test','test-a'),
('6fe00fc0-16f9-4966-b4b5-ccad657aedfc','f2000000-0000-4000-8000-000000000002','test','test-b');
set local role authenticated;

select set_config('request.jwt.claims','{"sub":"8777c5e3-b615-4acd-a4dd-01056a1251dd","role":"authenticated","aal":"aal2"}',true);
do $$ declare result jsonb; begin
 result:=public.read_betti_work_context('8205b373-c03f-4099-a3ef-1b57b48fff2d');
 if result::text like '%f2000000-0000-4000-8000-000000000002%' then raise exception 'foreign record leaked'; end if;
 if jsonb_array_length(result->'records')<>1 then raise exception 'owned record missing'; end if;
 if result<>public.read_betti_work_context('8205b373-c03f-4099-a3ef-1b57b48fff2d') then raise exception 'read changed state'; end if;
 if result->'business'->>'id'<>'8205b373-c03f-4099-a3ef-1b57b48fff2d' then raise exception 'wrong business'; end if;
 begin
  perform public.read_betti_work_context('6fe00fc0-16f9-4966-b4b5-ccad657aedfc');
  raise exception 'cross tenant access permitted';
 exception when insufficient_privilege then null; end;
end; $$;
select set_config('request.jwt.claims','{"sub":"8777c5e3-b615-4acd-a4dd-01056a1251dd","role":"authenticated","aal":"aal1"}',true);
do $$ begin
 begin
  perform public.read_betti_work_context('8205b373-c03f-4099-a3ef-1b57b48fff2d');
  raise exception 'MFA bypass';
 exception when insufficient_privilege then null; end;
end; $$;
rollback;
select 'betti_work_rollback_security_passed' as result;

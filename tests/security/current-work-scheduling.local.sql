-- Synthetic local database only, all queue changes roll back.
begin;
do $$ declare uid uuid:=gen_random_uuid(); control_uid uuid:=gen_random_uuid(); bid uuid; control_bid uuid;
 old_record uuid:=gen_random_uuid(); ongoing_record uuid:=gen_random_uuid(); recent_record uuid:=gen_random_uuid(); control_record uuid:=gen_random_uuid();
 day date; claimed uuid[];
begin
 insert into auth.users(id,email,raw_user_meta_data) values(uid,'work-priority@local.invalid','{"synthetic":true}'),(control_uid,'work-control@local.invalid','{"synthetic":true}');
 select id into bid from public.businesses where owner_user_id=uid;
 select id into control_bid from public.businesses where owner_user_id=control_uid;
 perform set_config('request.jwt.claims','{"role":"service_role"}',true);
 perform public.create_business_membership_grant(bid,'business',now()-interval '1 day',null,'priority-local','Synthetic scheduling','admin',null);
 perform public.create_business_membership_grant(control_bid,'business',now()-interval '1 day',null,'priority-control','Synthetic scheduling control','admin',null);
 day:=public.bookkeeping_activity_day(bid);
 insert into public.business_customer_setup(business_id,joined_month,grandfathered_start_date,timezone_name)
 values(bid,(date_trunc('month',day)-interval '2 months')::date,(date_trunc('month',day)-interval '6 months')::date,'UTC');
 update public.businesses set catch_up_start_date=(date_trunc('month',day)-interval '6 months')::date where id=bid;
 insert into public.bookkeeping_records(id,business_id,source_kind,ingestion_key,amount_cents,currency,occurred_on) values
 (old_record,bid,'financial_transaction','historical-control',-100,'USD',(day-interval '5 months')::date),
 (ongoing_record,bid,'financial_transaction','included-control',-100,'USD',(day-interval '2 months')::date),
 (recent_record,bid,'financial_transaction','recent-control',-100,'USD',day),
 (control_record,control_bid,'financial_transaction','other-business-control',-100,'USD',day);
 insert into public.bookkeeping_processing_jobs(business_id,bookkeeping_record_id,processing_reason,target_fingerprint)
 select business_id,id,'synthetic-scheduling','synthetic-scheduling' from public.bookkeeping_records
 where id in(old_record,ongoing_record,recent_record,control_record) on conflict do nothing;
 update public.bookkeeping_processing_jobs set available_at=now()-interval '1 hour',created_at=now()-interval '1 hour' where business_id in(bid,control_bid);
 update public.bookkeeping_processing_jobs set available_at=now()-interval '3 days',created_at=now()-interval '3 days' where bookkeeping_record_id=old_record;
 if public.bookkeeping_work_priority(bid,(day-interval '5 months')::date)<>0
  or public.bookkeeping_work_priority(bid,(day-interval '2 months')::date)<>1
  or public.bookkeeping_work_priority(bid,day)<>2 then raise exception 'Scope priority changed commercial meaning';end if;
 select array_agg(bookkeeping_record_id) into claimed from public.claim_bookkeeping_processing_jobs(gen_random_uuid(),25,60);
 if not recent_record=any(claimed) or not control_record=any(claimed)
  or old_record=any(claimed) or ongoing_record=any(claimed) then raise exception 'Current-first scheduling or cross-Business fairness failed';end if;
 if exists(select 1 from public.claim_bookkeeping_processing_jobs(gen_random_uuid(),25,60) where business_id in(bid,control_bid))
 then raise exception 'Active lease allowed competing work';end if;
end; $$;
rollback;

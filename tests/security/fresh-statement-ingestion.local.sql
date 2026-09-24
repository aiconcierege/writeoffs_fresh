-- Reproduces the real trusted worker owner-context switch; synthetic and rollback-only.
begin;
do $$ declare uid uuid:=gen_random_uuid();bid uuid;aid uuid:=gen_random_uuid();tid uuid; r public.bookkeeping_records; i int; failed boolean;
begin
 insert into auth.users(id,email,raw_user_meta_data) values(uid,'empty-ingest@local.invalid','{"synthetic":true}');select id into bid from public.businesses where owner_user_id=uid;
 perform set_config('request.jwt.claims','{"role":"service_role"}',true);
 perform public.create_business_membership_grant(bid,'business',now()-interval '1 day',null,'empty-ingest','Synthetic','admin',null);
 perform set_config('request.jwt.claim.sub',uid::text,true);
 perform set_config('request.jwt.claim.role','authenticated',true);
 insert into public.financial_accounts(id,business_id,institution_name,display_name,account_type) values(aid,bid,'Synthetic','Checking','checking');
 for i in 1..24 loop
 tid:=gen_random_uuid();insert into public.financial_transactions(id,business_id,financial_account_id,source_fingerprint,import_method,original_description,amount_cents,transaction_date) values(tid,bid,aid,'normal-source-'||i,'statement','ordinary purchase',-1234,'2026-05-19');
 r:=public.ensure_bookkeeping_record(bid,'financial_transaction',tid,'import','test-source-'||i,-1234,'USD','2026-05-19');perform public.ensure_initial_bookkeeping_decision(bid,r.id);
 end loop;
 if (select count(*) from public.bookkeeping_records where business_id=bid)<>24
 or (select count(*) from public.bookkeeping_decisions where business_id=bid)<>24 then raise exception 'Fresh statement ingestion incomplete';end if;
 -- A normal customer cannot claim the trusted-worker exception or bypass MFA.
 perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','authenticated','aal','aal1')::text,true);
 failed:=false;begin perform public.associate_later_bank_receipt(bid,tid);exception when others then failed:=true;end;
 if not failed then raise exception 'Customer MFA bypass';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','authenticated','aal','aal2')::text,true);
 failed:=false;begin perform public.associate_later_bank_receipt(gen_random_uuid(),tid);exception when others then failed:=true;end;
 if not failed then raise exception 'Cross-tenant association accepted';end if;
end $$;
set constraints all immediate;
rollback;

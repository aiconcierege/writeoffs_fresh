begin;
do $$ declare uid uuid:=gen_random_uuid(); bid uuid; doc public.business_documents%rowtype;
 job public.receipt_processing_jobs%rowtype; lease uuid:=gen_random_uuid(); first_receipt uuid; second_receipt uuid;
 failed boolean; regions jsonb:='[{"page":1,"x":10,"y":10,"width":250,"height":200}]';
begin
 insert into auth.users(id,email,raw_user_meta_data) values(uid,'receipt-regions@local.invalid','{"synthetic":true}');
 select id into bid from public.businesses where owner_user_id=uid;
 perform set_config('request.jwt.claims','{"role":"service_role"}',true);
 perform public.create_business_membership_grant(bid,'business',now()-interval '1 day',null,'receipt-regions-local','Synthetic region regression','admin',null);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','authenticated','aal','aal2')::text,true);
 doc:=public.register_customer_document(gen_random_uuid(),repeat('a',64),'two-receipts.pdf','application/pdf',100);
 perform set_config('request.jwt.claims','{"role":"service_role"}',true);
 select * into job from public.claim_customer_document_job(doc.id,lease);
 first_receipt:=public.worker_route_document_receipt_part(job.id,lease,repeat('b',64),'application/pdf',50,regions,0);
 if first_receipt<>public.worker_route_document_receipt_part(job.id,lease,repeat('b',64),'application/pdf',50,regions,0)
 then raise exception 'Part retry duplicated receipt';end if;
 second_receipt:=public.worker_route_document_receipt_part(job.id,lease,repeat('c',64),'application/pdf',50,
  '[{"page":1,"x":320,"y":10,"width":250,"height":200}]',1);
 if first_receipt=second_receipt or (select count(*) from public.receipt_source_regions where business_id=bid)<>2
 then raise exception 'Independent parts not retained';end if;
 failed:=false;
 begin perform public.worker_route_document_receipt_part(job.id,lease,repeat('d',64),'application/pdf',50,regions,0);
 exception when others then failed:=true;end;
 if not failed or (select count(*) from public.receipts where business_id=bid)<>2 then raise exception 'Changed retry created another receipt';end if;
 failed:=false;
 begin perform public.worker_route_document_receipt_part(job.id,gen_random_uuid(),repeat('e',64),'application/pdf',50,regions,2);
 exception when others then failed:=true;end;
 if not failed then raise exception 'Stale lease accepted';end if;
 if exists(select 1 from public.bookkeeping_records where business_id=bid) then raise exception 'Boundary detection invented expense';end if;
 if has_function_privilege('authenticated','public.worker_route_document_receipt_part(uuid,uuid,text,text,integer,jsonb,integer)','EXECUTE')
 then raise exception 'Customer can register worker parts';end if;
 perform set_config('test.receipt_regions_owner',uid::text,true);
 perform set_config('test.receipt_regions_business',bid::text,true);
end; $$;
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('test.receipt_regions_owner'),true);
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.receipt_regions_owner'),'role','authenticated','aal','aal2')::text,true);
do $$ begin
 if (select count(*) from public.receipt_source_regions where business_id=current_setting('test.receipt_regions_business')::uuid)<>2
 then raise exception 'Owner lineage inaccessible';end if;
end; $$;
select set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
do $$ begin
 if exists(select 1 from public.receipt_source_regions where business_id=current_setting('test.receipt_regions_business')::uuid)
 then raise exception 'Cross-tenant lineage exposed';end if;
end; $$;
reset role;
rollback;

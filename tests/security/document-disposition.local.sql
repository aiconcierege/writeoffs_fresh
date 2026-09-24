begin;
do $$ declare uid uuid:=gen_random_uuid(); other_uid uuid:=gen_random_uuid(); bid uuid; other_bid uuid;
 doc public.business_documents%rowtype; job public.receipt_processing_jobs%rowtype; lease uuid:=gen_random_uuid(); request_id uuid:=gen_random_uuid(); failed boolean;
begin
 insert into auth.users(id,email,raw_user_meta_data) values(uid,'document-owner@local.invalid','{"synthetic":true}'),(other_uid,'document-other@local.invalid','{"synthetic":true}');
 select id into bid from public.businesses where owner_user_id=uid;select id into other_bid from public.businesses where owner_user_id=other_uid;
 perform set_config('request.jwt.claims','{"role":"service_role"}',true);
 perform public.create_business_membership_grant(bid,'business',now()-interval '1 day',null,'discard-local','Synthetic discard','admin',null);
 perform public.create_business_membership_grant(other_bid,'business',now()-interval '1 day',null,'discard-other','Synthetic isolation','admin',null);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','authenticated','aal','aal2')::text,true);
 doc:=public.register_customer_document(gen_random_uuid(),repeat('9',64),'picnic-invitation.pdf','application/pdf',100);
 failed:=false;begin perform public.set_aside_unrecognized_document(doc.id,request_id);exception when others then failed:=true;end;
 if not failed then raise exception 'Pending work discarded';end if;
 perform set_config('request.jwt.claims','{"role":"service_role"}',true);
 select * into job from public.claim_customer_document_job(doc.id,lease);
 perform public.finish_receipt_processing_job(job.id,lease,'needs_attention','DOCUMENT_TYPE_UNCLEAR');
 perform set_config('request.jwt.claims',jsonb_build_object('sub',other_uid,'role','authenticated','aal','aal2')::text,true);
 failed:=false;begin perform public.set_aside_unrecognized_document(doc.id,request_id);exception when others then failed:=true;end;
 if not failed then raise exception 'Cross-tenant discard accepted';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','authenticated','aal','aal1')::text,true);
 failed:=false;begin perform public.set_aside_unrecognized_document(doc.id,request_id);exception when others then failed:=true;end;
 if not failed then raise exception 'MFA bypass accepted';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','authenticated','aal','aal2')::text,true);
 if not public.set_aside_unrecognized_document(doc.id,request_id) or not public.set_aside_unrecognized_document(doc.id,request_id)
  or not public.set_aside_unrecognized_document(doc.id,gen_random_uuid()) then raise exception 'Idempotent discard failed';end if;
 if (select count(*) from public.customer_document_dispositions where business_id=bid)<>1
  or not exists(select 1 from public.business_documents where id=doc.id and upload_fingerprint=repeat('9',64))
  or not exists(select 1 from public.receipt_processing_jobs where id=job.id and state='completed' and terminal_reason='CUSTOMER_SET_ASIDE')
  or exists(select 1 from public.bookkeeping_records where business_id=bid) then raise exception 'Discard changed evidence or books';end if;
 failed:=false;begin perform public.set_aside_unrecognized_document(gen_random_uuid(),request_id);exception when others then failed:=true;end;
 if not failed then raise exception 'Changed retry accepted';end if;
 doc:=public.register_customer_document(gen_random_uuid(),repeat('8',64),'ambiguous-receipts.pdf','application/pdf',100);
 perform set_config('request.jwt.claims','{"role":"service_role"}',true);
 select * into job from public.claim_customer_document_job(doc.id,lease);
 perform public.finish_receipt_processing_job(job.id,lease,'needs_attention','RECEIPT_BOUNDARIES_UNCLEAR');
 perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','authenticated','aal','aal2')::text,true);
 failed:=false;begin perform public.set_aside_unrecognized_document(doc.id,gen_random_uuid());exception when others then failed:=true;end;
 if not failed then raise exception 'Receipt evidence bypassed its own review workflow';end if;
 if has_function_privilege('anon','public.set_aside_unrecognized_document(uuid,uuid)','EXECUTE')
  or has_table_privilege('authenticated','public.customer_document_dispositions','INSERT') then raise exception 'Direct access exposed';end if;
end; $$;
rollback;

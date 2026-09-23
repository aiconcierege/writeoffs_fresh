-- Each receipt retains its own existing Keep/Discard/match history, while the
-- original document and visual source regions remain independently traceable.
create table public.receipt_source_regions (
 business_id uuid not null references public.businesses(id),
 document_id uuid not null references public.business_documents(id),
 receipt_id uuid not null references public.receipts(id),
 part_index integer not null check(part_index between 0 and 19),
 source_sha256 text not null check(source_sha256 ~ '^[a-f0-9]{64}$'),
 crop_version text not null default 'original-marks:v1' check(crop_version='original-marks:v1'),
 regions jsonb not null check(jsonb_typeof(regions)='array' and jsonb_array_length(regions) between 1 and 10),
 created_at timestamptz not null default now(),
 primary key(document_id,receipt_id), unique(document_id,part_index),
 foreign key(document_id,business_id) references public.business_documents(id,business_id),
 foreign key(receipt_id,business_id) references public.receipts(id,business_id)
);
alter table public.receipt_source_regions enable row level security;
revoke all on public.receipt_source_regions from public,anon,authenticated;
grant select on public.receipt_source_regions to authenticated;
grant all on public.receipt_source_regions to service_role;
create policy receipt_regions_owner on public.receipt_source_regions for select to authenticated
 using(exists(select 1 from public.businesses b where b.id=business_id and b.owner_user_id=auth.uid()) and auth.jwt()->>'aal'='aal2');
create trigger receipt_regions_immutable before update or delete on public.receipt_source_regions
 for each row execute function public.reject_canonical_bookkeeping_mutation();
create trigger betti_action_index_invalidate after insert on public.receipt_source_regions
 for each row execute function public.invalidate_betti_action_index_from_fact();

create function public.worker_route_document_receipt_part(p_job uuid,p_lease uuid,p_fingerprint text,p_mime text,p_bytes integer,p_regions jsonb,p_part integer)
returns uuid language plpgsql security definer set search_path='' as $$
declare j public.receipt_processing_jobs%rowtype;d public.business_documents%rowtype;r public.receipts%rowtype;
 original_sub text:=current_setting('request.jwt.claim.sub',true); original_role text:=current_setting('request.jwt.claim.role',true);
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'Trusted worker required';end if;
 select * into j from public.receipt_processing_jobs where id=p_job and state='processing'
  and lease_id=p_lease and lease_expires_at>now() for update;
 select * into d from public.business_documents where id=j.document_id and business_id=j.business_id;
 if p_part is null or p_part not between 0 and 19 or d.id is null or j.job_type<>'document_intake' or d.upload_fingerprint<>j.document_sha256
  or jsonb_typeof(p_regions) is distinct from 'array' or jsonb_array_length(p_regions) not between 1 and 10
  or exists(select 1 from jsonb_array_elements(p_regions) region_value where
   (region_value->>'page')::integer not between 1 and 10 or (region_value->>'x')::numeric<0 or (region_value->>'y')::numeric<0
   or (region_value->>'width')::numeric<=0 or (region_value->>'height')::numeric<=0
   or not(region_value ?& array['page','x','y','width','height']))
 then raise exception 'Receipt source unavailable';end if;
 perform set_config('request.jwt.claim.sub',d.owner_user_id::text,true);
 perform set_config('request.jwt.claim.role','authenticated',true);
 if not public.customer_has_active_membership() or exists(select 1 from public.current_customer_membership
  where business_id=d.business_id and deletion_status is not null) then raise exception 'Processing not authorized'; end if;
 r:=public.register_bookkeeping_receipt(gen_random_uuid(),p_fingerprint,
  'receipts/'||d.owner_user_id::text||'/'||p_fingerprint,d.original_name,p_mime,p_bytes);
 insert into public.receipt_source_regions(business_id,document_id,receipt_id,source_sha256,regions,part_index)
 values(d.business_id,d.id,r.id,d.upload_fingerprint,p_regions,p_part) on conflict do nothing;
 if not exists(select 1 from public.receipt_source_regions s where s.document_id=d.id and s.receipt_id=r.id
  and s.business_id=d.business_id and s.source_sha256=d.upload_fingerprint and s.regions=p_regions and s.part_index=p_part)
 then raise exception 'Receipt source retry changed';end if;
 update public.business_documents set document_class='receipt' where id=d.id;
 perform set_config('request.jwt.claim.sub',coalesce(original_sub,''),true);
 perform set_config('request.jwt.claim.role',coalesce(original_role,''),true);
 return r.id;
end; $$;
revoke all on function public.worker_route_document_receipt_part(uuid,uuid,text,text,integer,jsonb,integer) from public,anon,authenticated;
grant execute on function public.worker_route_document_receipt_part(uuid,uuid,text,text,integer,jsonb,integer) to service_role;

alter function public.read_betti_work_context(uuid) rename to read_betti_work_context_before_receipt_regions;
revoke all on function public.read_betti_work_context_before_receipt_regions(uuid) from public,anon,authenticated;
create function public.read_betti_work_context(p_business_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 result:=public.read_betti_work_context_before_receipt_regions(p_business_id);
 return jsonb_set(result,'{documentRecords}',coalesce(result->'documentRecords','[]'::jsonb)||coalesce((
  select jsonb_agg(distinct jsonb_build_object('business_id',s.business_id,'document_id',s.document_id,'record_id',l.bookkeeping_record_id))
  from public.receipt_source_regions s join public.bookkeeping_document_links l
   on l.receipt_id=s.receipt_id and l.business_id=s.business_id and l.revoked_at is null
  where s.business_id=p_business_id),'[]'::jsonb));
end; $$;
revoke all on function public.read_betti_work_context(uuid) from public,anon;
grant execute on function public.read_betti_work_context(uuid) to authenticated;

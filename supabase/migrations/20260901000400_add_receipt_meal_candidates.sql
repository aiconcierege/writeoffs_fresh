-- Evidence-backed receipt context that may open factual questions but never
-- creates business treatment, allocations, a tax category, or a deduction.
create table public.bookkeeping_receipt_meal_candidates(
 id uuid primary key default gen_random_uuid(),business_id uuid not null references public.businesses(id) on delete restrict,
 receipt_id uuid not null,document_sha256 text not null,support_kind text not null,evidence jsonb not null,
 processor_version text not null,created_at timestamptz not null default now(),
 constraint receipt_meal_candidate_receipt_fkey foreign key(receipt_id,business_id) references public.receipts(id,business_id) on delete restrict,
 constraint receipt_meal_candidate_unique unique(business_id,receipt_id,document_sha256,processor_version),
 constraint receipt_meal_candidate_hash check(document_sha256~'^[a-f0-9]{64}$'),
 constraint receipt_meal_candidate_support check(support_kind in('explicit_restaurant_context','meal_line_items')),
 constraint receipt_meal_candidate_evidence check(jsonb_typeof(evidence)='array' and jsonb_array_length(evidence) between 1 and 3)
);
alter table public.bookkeeping_receipt_meal_candidates enable row level security;
create policy receipt_meal_candidates_select_own on public.bookkeeping_receipt_meal_candidates for select to authenticated
 using(exists(select 1 from public.businesses b where b.id=business_id and b.owner_user_id=(select auth.uid())));
revoke all on public.bookkeeping_receipt_meal_candidates from public,anon,authenticated,service_role;
grant select on public.bookkeeping_receipt_meal_candidates to authenticated,service_role;
grant insert on public.bookkeeping_receipt_meal_candidates to service_role;
create trigger receipt_meal_candidates_no_mutation before update or delete on public.bookkeeping_receipt_meal_candidates
 for each row execute function public.reject_canonical_bookkeeping_mutation();

create or replace function public.worker_record_receipt_meal_candidate(p_business_id uuid,p_receipt_id uuid,
 p_document_sha256 text,p_support_kind text,p_evidence jsonb,p_processor_version text) returns uuid
language plpgsql security definer set search_path='' as $$ declare selected uuid;
begin
 if (select auth.role())<>'service_role' then raise exception 'service role required'; end if;
 if not exists(select 1 from public.receipts r where r.id=p_receipt_id and r.business_id=p_business_id
   and r.upload_fingerprint=p_document_sha256) then raise exception 'receipt candidate target is unavailable'; end if;
 if p_support_kind not in('explicit_restaurant_context','meal_line_items') or jsonb_typeof(p_evidence)<>'array'
   or jsonb_array_length(p_evidence) not between 1 and 3 then raise exception 'invalid meal candidate evidence'; end if;
 insert into public.bookkeeping_receipt_meal_candidates(business_id,receipt_id,document_sha256,support_kind,evidence,processor_version)
 values(p_business_id,p_receipt_id,p_document_sha256,p_support_kind,p_evidence,p_processor_version)
 on conflict(business_id,receipt_id,document_sha256,processor_version) do nothing returning id into selected;
 if selected is null then select id into selected from public.bookkeeping_receipt_meal_candidates where business_id=p_business_id
   and receipt_id=p_receipt_id and document_sha256=p_document_sha256 and processor_version=p_processor_version; end if;
 return selected;
end $$;

create or replace function public.project_receipt_meal_candidate_questions(p_receipt_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare selected_business uuid; record_id uuid; d public.bookkeeping_decisions%rowtype; candidate_id uuid; issue uuid;
 fact_exists boolean; active_reason text; context jsonb; understanding_state text; record_source text;
begin
 if (select auth.uid()) is null then raise exception 'authentication required'; end if;
 select r.business_id into selected_business from public.receipts r join public.businesses b on b.id=r.business_id
   where r.id=p_receipt_id and r.user_id=(select auth.uid()) and b.owner_user_id=(select auth.uid());
 if selected_business is null then raise exception 'receipt unavailable'; end if;
 select id into candidate_id from public.bookkeeping_receipt_meal_candidates where business_id=selected_business
   and receipt_id=p_receipt_id order by created_at desc limit 1;
 if candidate_id is null then
   select state into understanding_state from public.receipt_processing_jobs where business_id=selected_business
     and receipt_id=p_receipt_id and job_type='receipt_understanding_shadow' order by created_at desc limit 1;
   return jsonb_build_object('state',case when understanding_state in('pending','processing','retryable')
     then 'processing' else 'not_a_meal_candidate' end);
 end if;
 select e.bookkeeping_record_id into record_id from public.bookkeeping_receipt_events e where e.receipt_id=p_receipt_id
   and not exists(select 1 from public.bookkeeping_receipt_events s where s.supersedes_event_id=e.id);
 if record_id is null then return jsonb_build_object('state','processing'); end if;
 record_id:=coalesce((select c.survivor_record_id from public.current_bookkeeping_record_convergences c
   where c.business_id=selected_business and c.receipt_id=p_receipt_id limit 1),record_id);
 select source_kind into record_source from public.bookkeeping_records where id=record_id and business_id=selected_business;
 if record_source<>'financial_transaction' then
   return jsonb_build_object('state','waiting_for_transaction','record_id',record_id);
 end if;
 select * into d from public.bookkeeping_decisions x where x.business_id=selected_business and x.bookkeeping_record_id=record_id
   and not exists(select 1 from public.bookkeeping_decisions s where s.supersedes_decision_id=x.id) for update;
 if d.id is null then return jsonb_build_object('state','processing'); end if;
 if d.bookkeeping_nature is null and d.treatment='unresolved' then
   d.id:=public.append_bookkeeping_decision(selected_business,record_id,d.id,'expense','unresolved','needs_review',
     'automation',0.9000,'Receipt evidence establishes a purchase; business use remains unknown.',null,'[]'::jsonb);
   select * into d from public.bookkeeping_decisions where id=d.id;
 end if;
 if d.bookkeeping_nature<>'expense' or d.treatment in('personal','excluded') then
   return jsonb_build_object('state','complete','record_id',record_id); end if;
 select exists(select 1 from public.current_bookkeeping_meal_substantiation_facts f where f.business_id=selected_business
   and (f.bookkeeping_record_id=record_id or exists(select 1 from public.current_bookkeeping_record_convergences c
     where c.business_id=selected_business and c.survivor_record_id=record_id and c.absorbed_record_id=f.bookkeeping_record_id))) into fact_exists;
 if d.treatment='unresolved' then active_reason:='BUSINESS_USE_UNCLEAR';
 elsif nullif(btrim(d.business_purpose),'') is null then active_reason:='BUSINESS_PURPOSE_NEEDED';
 elsif not fact_exists then active_reason:='BUSINESS_PURPOSE_NEEDED';
 else return jsonb_build_object('state','complete','record_id',record_id); end if;
 context:=jsonb_build_object('schemaVersion',1,'reason',active_reason,'receiptMealCandidateId',candidate_id,
   'factType',case when active_reason='BUSINESS_PURPOSE_NEEDED' and d.business_purpose is not null
     then 'meal_attendee_relationship' else 'receipt_meal_candidate' end);
 select public.open_bookkeeping_review_issue_v2(selected_business,record_id,d.id,active_reason,
   case when context->>'factType'='meal_attendee_relationship' then 'meal-attendee:' else lower(active_reason)||':meal-candidate:' end||record_id::text,
   md5(d.id::text||':'||active_reason||':'||(context->>'factType')||':'||candidate_id::text),context) into issue;
 return jsonb_build_object('state','question_ready','record_id',record_id,'review_event_id',issue);
end $$;

create or replace function public.ensure_current_receipt_meal_candidate_questions() returns integer
language plpgsql security definer set search_path='' as $$ declare selected_business uuid; candidate record; projected jsonb; n integer:=0;
begin
 if (select auth.uid()) is null then raise exception 'authentication required'; end if;
 select id into selected_business from public.businesses where owner_user_id=(select auth.uid());
 for candidate in select distinct receipt_id from public.bookkeeping_receipt_meal_candidates where business_id=selected_business loop
   projected:=public.project_receipt_meal_candidate_questions(candidate.receipt_id);
   if projected->>'state'='question_ready' then n:=n+1; end if;
 end loop;return n;
end $$;

create or replace function public.enqueue_uploaded_receipt_understanding() returns trigger
language plpgsql security definer set search_path='' as $$ declare fingerprint text;
begin if new.event_type='uploaded' then select upload_fingerprint into fingerprint from public.receipts
 where id=new.receipt_id and business_id=new.business_id;if fingerprint is not null then
 insert into public.receipt_processing_jobs(business_id,receipt_id,job_type,processing_reason,document_sha256,
 processor_version,provider,model,prompt_version,output_schema_version) values(new.business_id,new.receipt_id,
 'canonical_receipt_extraction','receipt_registered',fingerprint,'canonical-receipt-extraction:v1','google_vision',
 'document-text-detection','receipt-parser:v1','receipt-extraction:v1') on conflict do nothing;
 perform public.request_receipt_understanding_processing(new.business_id,new.receipt_id,'receipt_registered',fingerprint,
 'receipt-understanding:r1.2','openai','environment-configured','receipt-understanding-prompt:v2','receipt-understanding-schema:v2');
 end if;end if;return new;end $$;

revoke all on function public.worker_record_receipt_meal_candidate(uuid,uuid,text,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.worker_record_receipt_meal_candidate(uuid,uuid,text,text,jsonb,text) to service_role;
revoke all on function public.project_receipt_meal_candidate_questions(uuid) from public,anon,service_role;
grant execute on function public.project_receipt_meal_candidate_questions(uuid) to authenticated;
revoke all on function public.ensure_current_receipt_meal_candidate_questions() from public,anon,service_role;
grant execute on function public.ensure_current_receipt_meal_candidate_questions() to authenticated;

-- Transport snapshot only. Existing canonical SQL + TypeScript retain eligibility,
-- suppression, scope, evidence and priority authority. One STABLE invocation gives
-- all readers one PostgreSQL statement snapshot; no read creates bookkeeping work.
create function public.read_betti_work_inputs(p_business_id uuid,p_as_of timestamptz)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare
 snapshot_context jsonb; reviews jsonb; askable jsonb; tables jsonb:='{}'; rows jsonb;
 timings jsonb:='{}'; started timestamptz; record_ids uuid[]; decision_ids uuid[]; financial_ids uuid[];
begin
 if p_as_of is null then raise exception 'Snapshot time required'; end if;
 -- The existing context enforces owner + MFA before returning any data.
 started:=clock_timestamp();
 snapshot_context:=public.read_betti_work_context(p_business_id);
 timings:=timings||jsonb_build_object('context_ms',extract(epoch from clock_timestamp()-started)*1000);
 if jsonb_array_length(snapshot_context->'records')>=1000 or jsonb_array_length(snapshot_context->'links')>=1000
  or jsonb_array_length(snapshot_context->'questionVersions')>=1000 then raise exception 'Work input capacity exceeded'; end if;
 started:=clock_timestamp();
 select coalesce(jsonb_agg(to_jsonb(r)),'[]') into reviews from
  (select * from public.list_current_bookkeeping_review_issues(p_business_id,p_as_of) limit 1001) r;
 select coalesce(jsonb_agg(to_jsonb(r)),'[]') into askable from
  (select * from public.list_current_askable_bookkeeping_question_event_ids(p_as_of) limit 1001) r;
 if jsonb_array_length(reviews)>=1000 or jsonb_array_length(askable)>=1000 then raise exception 'Question input capacity exceeded'; end if;
 timings:=timings||jsonb_build_object('review_eligibility_ms',extract(epoch from clock_timestamp()-started)*1000);
 started:=clock_timestamp();
 select coalesce(jsonb_agg(to_jsonb(r)),'[]') into rows from (select business_id,convergence_id,convergence_event_id,survivor_record_id,absorbed_record_id,receipt_id,financial_transaction_id from public.current_bookkeeping_record_convergences where business_id=p_business_id limit 1001) r;
 if jsonb_array_length(rows)>=1000 then raise exception 'Work input capacity exceeded: current_bookkeeping_record_convergences'; end if;
 tables:=tables||jsonb_build_object('current_bookkeeping_record_convergences',rows);
 timings:=timings||jsonb_build_object('current_bookkeeping_record_convergences_ms',extract(epoch from clock_timestamp()-started)*1000);
 started:=clock_timestamp();
 select coalesce(jsonb_agg(to_jsonb(r)),'[]') into rows from (select business_id,id,supersedes_event_id,event_type,bookkeeping_record_id,context from public.bookkeeping_receipt_events where business_id=p_business_id limit 1001) r;
 if jsonb_array_length(rows)>=1000 then raise exception 'Work input capacity exceeded: bookkeeping_receipt_events'; end if;
 tables:=tables||jsonb_build_object('bookkeeping_receipt_events',rows);
 timings:=timings||jsonb_build_object('bookkeeping_receipt_events_ms',extract(epoch from clock_timestamp()-started)*1000);
 started:=clock_timestamp();
 select coalesce(jsonb_agg(to_jsonb(r)),'[]') into rows from (select business_id,reconciliation_id,reconciliation_event_id,anchor_bookkeeping_record_id,anchor_financial_transaction_id,bookkeeping_record_id,link_id,linked_amount_cents,relationship_role from public.current_bookkeeping_compound_components where business_id=p_business_id limit 1001) r;
 if jsonb_array_length(rows)>=1000 then raise exception 'Work input capacity exceeded: current_bookkeeping_compound_components'; end if;
 tables:=tables||jsonb_build_object('current_bookkeeping_compound_components',rows);
 timings:=timings||jsonb_build_object('current_bookkeeping_compound_components_ms',extract(epoch from clock_timestamp()-started)*1000);
 started:=clock_timestamp();
 select coalesce(jsonb_agg(to_jsonb(r)),'[]') into rows from (select business_id,id,manual_financial_source_id,supersedes_event_id,event_type,bookkeeping_record_id from public.manual_financial_source_events where business_id=p_business_id limit 1001) r;
 if jsonb_array_length(rows)>=1000 then raise exception 'Work input capacity exceeded: manual_financial_source_events'; end if;
 tables:=tables||jsonb_build_object('manual_financial_source_events',rows);
 timings:=timings||jsonb_build_object('manual_financial_source_events_ms',extract(epoch from clock_timestamp()-started)*1000);
 started:=clock_timestamp();
 select coalesce(jsonb_agg(to_jsonb(r)),'[]') into rows from (select business_id,convergence_id,convergence_event_id,survivor_record_id,absorbed_record_id from public.current_bookkeeping_source_convergences where business_id=p_business_id limit 1001) r;
 if jsonb_array_length(rows)>=1000 then raise exception 'Work input capacity exceeded: current_bookkeeping_source_convergences'; end if;
 tables:=tables||jsonb_build_object('current_bookkeeping_source_convergences',rows);
 timings:=timings||jsonb_build_object('current_bookkeeping_source_convergences_ms',extract(epoch from clock_timestamp()-started)*1000);
 started:=clock_timestamp();
 select coalesce(jsonb_agg(to_jsonb(r)),'[]') into rows from (select business_id,id,attention_id,event_type,fact_type,bookkeeping_record_id,question_type,prompt,guidance,scope_key,signal_version,created_at from public.current_deduction_attentions where business_id=p_business_id and event_type='opened' order by created_at limit 1001) r;
 if jsonb_array_length(rows)>=1000 then raise exception 'Work input capacity exceeded: current_deduction_attentions'; end if;
 tables:=tables||jsonb_build_object('current_deduction_attentions',rows);
 timings:=timings||jsonb_build_object('current_deduction_attentions_ms',extract(epoch from clock_timestamp()-started)*1000);
 started:=clock_timestamp();
 select coalesce(jsonb_agg(to_jsonb(r)),'[]') into rows from (select * from public.current_contractor_payments where business_id=p_business_id limit 1001) r;
 if jsonb_array_length(rows)>=1000 then raise exception 'Work input capacity exceeded: current_contractor_payments'; end if;
 tables:=tables||jsonb_build_object('current_contractor_payments',rows);
 timings:=timings||jsonb_build_object('current_contractor_payments_ms',extract(epoch from clock_timestamp()-started)*1000);
 started:=clock_timestamp();
 select coalesce(jsonb_agg(to_jsonb(r)),'[]') into rows from (select business_id,id,display_name from public.current_canonical_contractors where business_id=p_business_id limit 1001) r;
 if jsonb_array_length(rows)>=1000 then raise exception 'Work input capacity exceeded: current_canonical_contractors'; end if;
 tables:=tables||jsonb_build_object('current_canonical_contractors',rows);
 timings:=timings||jsonb_build_object('current_canonical_contractors_ms',extract(epoch from clock_timestamp()-started)*1000);
 started:=clock_timestamp();
 select coalesce(jsonb_agg(to_jsonb(r)),'[]') into rows from (select * from public.current_contractor_w9_status where business_id=p_business_id limit 1001) r;
 if jsonb_array_length(rows)>=1000 then raise exception 'Work input capacity exceeded: current_contractor_w9_status'; end if;
 tables:=tables||jsonb_build_object('current_contractor_w9_status',rows);
 timings:=timings||jsonb_build_object('current_contractor_w9_status_ms',extract(epoch from clock_timestamp()-started)*1000);
 started:=clock_timestamp();
 select coalesce(jsonb_agg(to_jsonb(r)),'[]') into rows from (select business_id,question_source,question_id,source_version_id,deferred_until from public.contractor_question_deferral_events where business_id=p_business_id and deferred_until>p_as_of limit 1001) r;
 if jsonb_array_length(rows)>=1000 then raise exception 'Work input capacity exceeded: contractor_question_deferral_events'; end if;
 tables:=tables||jsonb_build_object('contractor_question_deferral_events',rows);
 timings:=timings||jsonb_build_object('contractor_question_deferral_events_ms',extract(epoch from clock_timestamp()-started)*1000);
 started:=clock_timestamp();
 select coalesce(jsonb_agg(to_jsonb(r)),'[]') into rows from (select business_id,id,display_name,archived_at,created_at from public.business_vehicles where business_id=p_business_id and archived_at is null order by created_at limit 1001) r;
 if jsonb_array_length(rows)>=1000 then raise exception 'Work input capacity exceeded: business_vehicles'; end if;
 tables:=tables||jsonb_build_object('business_vehicles',rows);
 timings:=timings||jsonb_build_object('business_vehicles_ms',extract(epoch from clock_timestamp()-started)*1000);
 select array_agg(distinct id) into record_ids from (
   select (r->>'bookkeeping_record_id')::uuid id from jsonb_array_elements(reviews) r
   union select (r->>'bookkeeping_record_id')::uuid from jsonb_array_elements(tables->'current_deduction_attentions') r) ids;
 select array_agg(distinct (r->>'based_on_decision_id')::uuid) into decision_ids from jsonb_array_elements(reviews) r;
 started:=clock_timestamp();
 select coalesce(jsonb_agg(to_jsonb(r)),'[]') into rows from (select business_id,id,amount_cents,currency,occurred_on from public.bookkeeping_records where business_id=p_business_id and id=any(record_ids) limit 1001) r;
 if jsonb_array_length(rows)>=1000 then raise exception 'Work input capacity exceeded: bookkeeping_records'; end if;
 tables:=tables||jsonb_build_object('bookkeeping_records',rows);
 timings:=timings||jsonb_build_object('bookkeeping_records_ms',extract(epoch from clock_timestamp()-started)*1000);
 started:=clock_timestamp();
 select coalesce(jsonb_agg(to_jsonb(r)),'[]') into rows from (select business_id,bookkeeping_record_id,financial_transaction_id,revoked_at from public.bookkeeping_financial_sources where business_id=p_business_id and bookkeeping_record_id=any(record_ids) and revoked_at is null limit 1001) r;
 if jsonb_array_length(rows)>=1000 then raise exception 'Work input capacity exceeded: bookkeeping_financial_sources'; end if;
 tables:=tables||jsonb_build_object('bookkeeping_financial_sources',rows);
 timings:=timings||jsonb_build_object('bookkeeping_financial_sources_ms',extract(epoch from clock_timestamp()-started)*1000);
 started:=clock_timestamp();
 select coalesce(jsonb_agg(to_jsonb(r)),'[]') into rows from (select * from public.bookkeeping_decisions where business_id=p_business_id and (id=any(decision_ids) or bookkeeping_record_id in (select (r->>'bookkeeping_record_id')::uuid from jsonb_array_elements(tables->'current_deduction_attentions') r)) limit 1001) r;
 if jsonb_array_length(rows)>=1000 then raise exception 'Work input capacity exceeded: bookkeeping_decisions'; end if;
 tables:=tables||jsonb_build_object('bookkeeping_decisions',rows);
 timings:=timings||jsonb_build_object('bookkeeping_decisions_ms',extract(epoch from clock_timestamp()-started)*1000);
 started:=clock_timestamp();
 select coalesce(jsonb_agg(to_jsonb(r)),'[]') into rows from (select business_id,bookkeeping_decision_id,allocation_kind,amount_cents,tax_category_key,memo from public.bookkeeping_allocations where business_id=p_business_id and bookkeeping_decision_id=any(decision_ids) limit 1001) r;
 if jsonb_array_length(rows)>=1000 then raise exception 'Work input capacity exceeded: bookkeeping_allocations'; end if;
 tables:=tables||jsonb_build_object('bookkeeping_allocations',rows);
 timings:=timings||jsonb_build_object('bookkeeping_allocations_ms',extract(epoch from clock_timestamp()-started)*1000);
 started:=clock_timestamp();
 select coalesce(jsonb_agg(to_jsonb(r)),'[]') into rows from (select business_id,id,bookkeeping_record_id,receipt_id,revoked_at from public.bookkeeping_document_links where business_id=p_business_id and revoked_at is null limit 1001) r;
 if jsonb_array_length(rows)>=1000 then raise exception 'Work input capacity exceeded: bookkeeping_document_links'; end if;
 tables:=tables||jsonb_build_object('bookkeeping_document_links',rows);
 timings:=timings||jsonb_build_object('bookkeeping_document_links_ms',extract(epoch from clock_timestamp()-started)*1000);
 select array_agg(distinct id) into financial_ids from (
   select (r->>'financial_transaction_id')::uuid id from jsonb_array_elements(tables->'bookkeeping_financial_sources') r
   union select (r->>'anchor_financial_transaction_id')::uuid from jsonb_array_elements(tables->'current_bookkeeping_compound_components') r) ids;
 started:=clock_timestamp();
 select coalesce(jsonb_agg(to_jsonb(r)),'[]') into rows from (select business_id,id,merchant_name,original_description,amount_cents,currency,transaction_date,import_method,raw_payload from public.financial_transactions where business_id=p_business_id and id=any(financial_ids) limit 1001) r;
 if jsonb_array_length(rows)>=1000 then raise exception 'Work input capacity exceeded: financial_transactions'; end if;
 tables:=tables||jsonb_build_object('financial_transactions',rows);
 timings:=timings||jsonb_build_object('financial_transactions_ms',extract(epoch from clock_timestamp()-started)*1000);
 started:=clock_timestamp();
 select coalesce(jsonb_agg(to_jsonb(r)),'[]') into rows from (select business_id,id,plaid_transaction_id,supersedes_version_id,canonical_financial_transaction_id,event_type from public.plaid_transaction_versions where business_id=p_business_id and plaid_transaction_id in (select plaid_transaction_id from public.plaid_transaction_versions where business_id=p_business_id and canonical_financial_transaction_id=any(financial_ids)) limit 1001) r;
 if jsonb_array_length(rows)>=1000 then raise exception 'Work input capacity exceeded: plaid_transaction_versions'; end if;
 tables:=tables||jsonb_build_object('plaid_transaction_versions',rows);
 timings:=timings||jsonb_build_object('plaid_transaction_versions_ms',extract(epoch from clock_timestamp()-started)*1000);
 started:=clock_timestamp();
 select coalesce(jsonb_agg(to_jsonb(r)),'[]') into rows from (select business_id,id,storage_path,original_name from public.receipts where business_id=p_business_id and id in (select (r->>'receipt_id')::uuid from jsonb_array_elements(tables->'bookkeeping_document_links') r) limit 1001) r;
 if jsonb_array_length(rows)>=1000 then raise exception 'Work input capacity exceeded: receipts'; end if;
 tables:=tables||jsonb_build_object('receipts',rows);
 timings:=timings||jsonb_build_object('receipts_ms',extract(epoch from clock_timestamp()-started)*1000);
 started:=clock_timestamp();
 select coalesce(jsonb_agg(to_jsonb(r)),'[]') into rows from (select business_id,id,receipt_id,provider,merchant,occurred_on,total_amount_cents,quality_status,raw_payload from public.current_bookkeeping_receipt_extractions where business_id=p_business_id and receipt_id in (select (r->>'receipt_id')::uuid from jsonb_array_elements(tables->'bookkeeping_document_links') r) limit 1001) r;
 if jsonb_array_length(rows)>=1000 then raise exception 'Work input capacity exceeded: current_bookkeeping_receipt_extractions'; end if;
 tables:=tables||jsonb_build_object('current_bookkeeping_receipt_extractions',rows);
 timings:=timings||jsonb_build_object('current_bookkeeping_receipt_extractions_ms',extract(epoch from clock_timestamp()-started)*1000);
 return jsonb_build_object('version',1,'businessId',p_business_id,'asOf',p_as_of,
  'context',snapshot_context,'reviews',reviews,'askable',askable,'tables',tables,'timings',timings);
end;$$;
revoke all on function public.read_betti_work_inputs(uuid,timestamptz) from public,anon;
grant execute on function public.read_betti_work_inputs(uuid,timestamptz) to authenticated;

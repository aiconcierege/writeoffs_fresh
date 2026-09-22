// Synthetic facts only; never import data rows from the staging application.
import {randomUUID} from 'node:crypto'
export const syntheticTenant=()=>({user:randomUUID(),business:randomUUID(),account:randomUUID(),record:randomUUID(),decision:randomUUID(),issue:randomUUID()})
export function seedSyntheticTenant(t){
 for(const value of Object.values(t))if(!/^[a-f0-9-]{36}$/.test(value))throw new Error('DR_FIXTURE_ID_INVALID')
 return `begin; set local session_replication_role=replica;
 insert into auth.users(id,email) values('${t.user}','synthetic-${t.user}@example.test');
 insert into auth.mfa_factors(id,user_id,factor_type,status,created_at,updated_at,secret) values(gen_random_uuid(),'${t.user}','totp','verified',now(),now(),'synthetic-not-a-real-secret');
 insert into public.businesses(id,owner_user_id,name) values('${t.business}','${t.user}','Synthetic DR fixture');
 insert into public.financial_accounts(id,business_id,institution_name,display_name,account_type) values('${t.account}','${t.business}','Synthetic','Synthetic','checking');
 insert into public.financial_transactions(business_id,financial_account_id,source_fingerprint,import_method,original_description,amount_cents,transaction_date) values('${t.business}','${t.account}','synthetic-${t.business}','provider','Synthetic expense',-12500,'2026-09-01');
 insert into public.plaid_items(business_id,plaid_item_id,access_token_ciphertext,environment,sync_cursor,sync_requested_at,sync_lease_id,sync_lease_expires_at) values('${t.business}','synthetic-${t.business}','synthetic-not-a-provider-token','sandbox','synthetic-cursor',now(),gen_random_uuid(),now()+interval '1 hour');
 insert into public.bookkeeping_records(id,business_id,source_kind,ingestion_key,amount_cents) values('${t.record}','${t.business}','financial_transaction','synthetic',-12500);
 insert into public.bookkeeping_decisions(id,business_id,bookkeeping_record_id,bookkeeping_nature,treatment,review_status,provenance) values('${t.decision}','${t.business}','${t.record}','expense','business','resolved','system');
 insert into public.bookkeeping_review_events(business_id,bookkeeping_record_id,review_issue_id,sequence_number,event_type,reason,based_on_decision_id,issue_key,context_fingerprint,provenance,question_context,answer_payload) values('${t.business}','${t.record}','${t.issue}',1,'answered','BUSINESS_PURPOSE_NEEDED','${t.decision}','synthetic','synthetic','system','{"question":"Synthetic purpose?"}','{"answer":"Synthetic business fact"}');
 insert into public.bookkeeping_processing_jobs(business_id,bookkeeping_record_id,processing_reason,target_fingerprint,state,lease_id,lease_expires_at,claimed_at) values('${t.business}','${t.record}','synthetic','synthetic','processing',gen_random_uuid(),now()+interval '1 hour',now());
 insert into public.receipts(user_id,business_id,storage_path,mime_type,bytes) values('${t.user}','${t.business}','receipts/${t.user}/receipt.pdf','application/pdf',16);
 commit;`
}
export function tenantSnapshot(sql,t){
 const rows={}
 for(const [table,column,id] of [
  ['public.businesses','id',t.business],['public.financial_accounts','business_id',t.business],['public.financial_transactions','business_id',t.business],
  ['public.bookkeeping_records','business_id',t.business],['public.bookkeeping_decisions','business_id',t.business],['public.bookkeeping_review_events','business_id',t.business],
  ['public.plaid_items','business_id',t.business],['public.bookkeeping_processing_jobs','business_id',t.business],['public.receipts','user_id',t.user],
  ['auth.users','id',t.user],['auth.mfa_factors','user_id',t.user],
 ])rows[table]=JSON.parse(sql(`select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]'::jsonb) from ${table} x where ${column}='${id}';`))
 return rows
}

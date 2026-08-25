import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { listContractorSummaries } from '../../app/lib/bookkeeping/contractor-awareness'
import { provisionLocalCanonicalOwner } from '../helpers/local-canonical'

const url=process.env.LOCAL_SUPABASE_URL,anonKey=process.env.LOCAL_SUPABASE_ANON_KEY,serviceKey=process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY
const enabled=process.env.RUN_LOCAL_SUPABASE_INTEGRATION==='1'&&Boolean(url&&anonKey&&serviceKey)
const suite=enabled?describe.sequential:describe.skip
async function records(owner:Awaited<ReturnType<typeof provisionLocalCanonicalOwner>>){return(await owner.customer.from('bookkeeping_records').select('id,amount_cents').eq('business_id',owner.businessId).order('occurred_on')).data??[]}
async function resolve(admin:SupabaseClient,owner:Awaited<ReturnType<typeof provisionLocalCanonicalOwner>>,record:{id:string;amount_cents:number}){const current=(await admin.from('bookkeeping_decisions').select('id').eq('bookkeeping_record_id',record.id).single()).data!;expect((await admin.rpc('append_bookkeeping_decision',{p_business_id:owner.businessId,p_bookkeeping_record_id:record.id,p_expected_current_decision_id:current.id,p_bookkeeping_nature:'expense',p_treatment:'business',p_review_status:'resolved',p_provenance:'system',p_confidence:null,p_reason:'Trusted contractor expense.',p_business_purpose:'Subcontract work',p_allocations:[{kind:'business',amount_cents:record.amount_cents}]})).error).toBeNull()}

suite('contractor awareness against local PostgreSQL',()=>{it('tracks exact current payments, corrections, removal, W-9 awareness, idempotency, and isolation',async()=>{
 const admin=createClient(url!,serviceKey!,{auth:{persistSession:false}})
 const owner=await provisionLocalCanonicalOwner({admin,url:url!,anonKey:anonKey!,label:'joe-smith',amounts:[-80000,-120000,-90000]})
 const rows=await records(owner);for(const row of rows)await resolve(admin,owner,row as{id:string;amount_cents:number})
 const key=crypto.randomUUID(),created=await owner.customer.rpc('create_canonical_contractor',{p_display_name:'Joe Smith',p_business_name:'Joe Landscaping',p_request_key:key})
 expect(created.error).toBeNull();expect((await owner.customer.rpc('create_canonical_contractor',{p_display_name:'Joe Smith',p_business_name:'Joe Landscaping',p_request_key:key})).data).toBe(created.data)
 for(let index=0;index<rows.length;index++)expect((await owner.customer.rpc('associate_contractor_payment',{p_bookkeeping_record_id:rows[index].id,p_contractor_id:created.data,p_expected_event_id:null,p_payment_method:index===2?'unknown':index===1?'ach_zelle':'check',p_payment_method_source:'customer',p_remove:false,p_request_key:crypto.randomUUID()})).error).toBeNull()
 let summary=(await listContractorSummaries({supabase:owner.customer,businessId:owner.businessId,taxYear:2026}))[0]
 expect(summary.totalPaidCents).toBe(290000);expect(summary.paymentCount).toBe(3);expect(summary.awareness).toBe('information_incomplete')
 const unknown=(await owner.customer.from('current_contractor_payments').select('*').eq('payment_method','unknown').single()).data!
 expect((await owner.customer.rpc('associate_contractor_payment',{p_bookkeeping_record_id:unknown.bookkeeping_record_id,p_contractor_id:created.data,p_expected_event_id:unknown.id,p_payment_method:'check',p_payment_method_source:'customer',p_remove:false,p_request_key:crypto.randomUUID()})).error).toBeNull()
 const w9=(await owner.customer.from('current_contractor_w9_status').select('*').eq('contractor_id',created.data).single()).data!
 expect((await owner.customer.rpc('record_contractor_w9_status',{p_contractor_id:created.data,p_expected_event_id:w9.id,p_status:'on_file',p_evidence_note:'Customer confirmed document is retained; no tax ID stored.',p_request_key:crypto.randomUUID()})).error).toBeNull()
 summary=(await listContractorSummaries({supabase:owner.customer,businessId:owner.businessId,taxYear:2026}))[0];expect(summary.awareness).toBe('potential_1099_attention');expect(summary.ruleVersion).toBe('contractor-awareness:2026:v2')
 const corrected=(await owner.customer.from('current_contractor_payments').select('*').eq('bookkeeping_record_id',unknown.bookkeeping_record_id).single()).data!
 expect((await owner.customer.rpc('associate_contractor_payment',{p_bookkeeping_record_id:unknown.bookkeeping_record_id,p_contractor_id:created.data,p_expected_event_id:corrected.id,p_payment_method:'check',p_payment_method_source:'customer',p_remove:true,p_request_key:crypto.randomUUID()})).error).toBeNull()
 summary=(await listContractorSummaries({supabase:owner.customer,businessId:owner.businessId,taxYear:2026}))[0];expect(summary.totalPaidCents).toBe(200000);expect(summary.paymentCount).toBe(2);expect(summary.awareness).toBe('potential_1099_attention')
 const contractor=(await owner.customer.from('current_canonical_contractors').select('*').eq('id',created.data).single()).data!
 expect((await owner.customer.rpc('correct_canonical_contractor',{p_contractor_id:created.data,p_expected_event_id:contractor.current_event_id,p_display_name:'Joseph Smith',p_business_name:'Joe Landscaping',p_active:true,p_request_key:crypto.randomUUID()})).error).toBeNull()
 const other=await provisionLocalCanonicalOwner({admin,url:url!,anonKey:anonKey!,label:'other-contractor',amounts:[]})
 expect((await other.customer.rpc('record_contractor_w9_status',{p_contractor_id:created.data,p_expected_event_id:w9.id,p_status:'needed',p_evidence_note:'',p_request_key:crypto.randomUUID()})).error).not.toBeNull()
 expect((await other.customer.from('canonical_contractors').select('id').eq('id',created.data)).data).toEqual([])
})})

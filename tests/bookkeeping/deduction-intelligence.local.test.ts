import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { describe,expect,it } from 'vitest'
import { loadBookkeepingEvaluationSnapshot } from '../../app/lib/bookkeeping/evaluation-snapshot'
import { runDeductionIntelligenceForRecord } from '../../app/lib/bookkeeping/deduction-intelligence'
import { drainBookkeepingProcessingJobs } from '../../app/lib/bookkeeping/processing'
import { SupabaseCanonicalFinancialSummaryRepository } from '../../app/lib/bookkeeping/financial-summary-repository'
import { buildCanonicalReport } from '../../app/lib/bookkeeping/reporting-model'
import { provisionLocalCanonicalOwner } from '../helpers/local-canonical'

const url=process.env.LOCAL_SUPABASE_URL,anonKey=process.env.LOCAL_SUPABASE_ANON_KEY,serviceKey=process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY
const enabled=process.env.RUN_LOCAL_SUPABASE_INTEGRATION==='1'&&Boolean(url&&anonKey&&serviceKey)
const suite=enabled?describe.sequential:describe.skip

async function records(owner:Awaited<ReturnType<typeof provisionLocalCanonicalOwner>>){
 const{data}=await owner.customer.from('bookkeeping_records').select('id').eq('business_id',owner.businessId).order('occurred_on');return data??[]
}
async function resolveExpense(owner:Awaited<ReturnType<typeof provisionLocalCanonicalOwner>>,recordId:string,provenance:'user'|'system'='user',admin?:SupabaseClient){
 const{data:decision}=await owner.customer.from('bookkeeping_decisions').select('id').eq('bookkeeping_record_id',recordId).single()
 const writer=provenance==='system'?admin!:owner.customer
 const{data,error}=await writer.rpc('append_bookkeeping_decision',{p_business_id:owner.businessId,p_bookkeeping_record_id:recordId,
  p_expected_current_decision_id:decision!.id,p_bookkeeping_nature:'expense',p_treatment:'business',p_review_status:'resolved',
  p_provenance:provenance,p_confidence:null,p_reason:provenance==='user'?'Customer confirmed business expense.':'Trusted existing business expense.',p_business_purpose:'Business communications',
  p_allocations:[{kind:'business',amount_cents:(await owner.customer.from('bookkeeping_records').select('amount_cents').eq('id',recordId).single()).data!.amount_cents}]})
 expect(error).toBeNull();return data
}

suite('deduction intelligence against local PostgreSQL',()=>{
 it('reuses and corrects one customer phone percentage across recurring records',async()=>{
  const admin=createClient(url!,serviceKey!,{auth:{persistSession:false}})
  const owner=await provisionLocalCanonicalOwner({admin,url:url!,anonKey:anonKey!,label:'verizon-wireless',amounts:[-14000,-14000]})
  const [first,second]=await records(owner);await resolveExpense(owner,first.id);await resolveExpense(owner,second.id,'system',admin)
  const firstSnapshot=await loadBookkeepingEvaluationSnapshot({admin,businessId:owner.businessId,recordId:first.id})
  expect((await runDeductionIntelligenceForRecord({admin,snapshot:firstSnapshot})).outcome).toBe('missing_fact')
  const{data:attention}=await owner.customer.from('current_deduction_attentions').select('*').eq('business_id',owner.businessId).single()
  const answered=await owner.customer.rpc('answer_deduction_attention',{p_attention_id:attention!.attention_id,
   p_expected_event_id:attention!.id,p_value:70,p_request_key:crypto.randomUUID()});expect(answered.error).toBeNull()
  await runDeductionIntelligenceForRecord({admin,writer:owner.customer,customerAnsweredFact:true,
   snapshot:await loadBookkeepingEvaluationSnapshot({admin,businessId:owner.businessId,recordId:first.id})})
  await runDeductionIntelligenceForRecord({admin,snapshot:await loadBookkeepingEvaluationSnapshot({admin,businessId:owner.businessId,recordId:second.id})})
  for(const record of [first,second]){const{data:allocations}=await owner.customer.from('bookkeeping_allocations').select('allocation_kind,amount_cents,bookkeeping_decision_id').eq('bookkeeping_record_id',record.id)
   const latest=(await owner.customer.from('bookkeeping_decisions').select('id,supersedes_decision_id').eq('bookkeeping_record_id',record.id)).data!;const superseded=new Set(latest.map(row=>row.supersedes_decision_id));const leaf=latest.find(row=>!superseded.has(row.id))!;
   expect(allocations?.filter(row=>row.bookkeeping_decision_id===leaf.id).map(row=>[row.allocation_kind,row.amount_cents])).toEqual(expect.arrayContaining([['business',-9800],['personal',-4200]]))}
  const{data:fact}=await owner.customer.from('current_deduction_business_facts').select('*').eq('business_id',owner.businessId).single()
  const corrected=await owner.customer.rpc('record_deduction_business_fact',{p_fact_type:fact!.fact_type,p_scope_kind:fact!.scope_kind,p_scope_key:fact!.scope_key,
   p_value:50,p_effective_on:'2026-08-24',p_expected_current_event_id:fact!.id,p_source:'correction',p_reason:'Customer corrected phone use.',p_request_key:crypto.randomUUID()})
  expect(corrected.error).toBeNull()
  for(let pass=0;pass<20;pass+=1){const drained=await drainBookkeepingProcessingJobs({admin,batchSize:100});if(drained.claimed===0)break}
  const{data:current}=await owner.customer.from('current_deduction_business_facts').select('fact_value').eq('business_id',owner.businessId).single();expect(current!.fact_value).toBe(50)
  for(const record of [first,second]){const{data:decisions}=await owner.customer.from('bookkeeping_decisions').select('id,treatment,provenance,supersedes_decision_id').eq('bookkeeping_record_id',record.id)
   const superseded=new Set(decisions!.map(row=>row.supersedes_decision_id));const leaf=decisions!.find(row=>!superseded.has(row.id))!;expect(leaf.treatment).toBe('mixed_use');expect(leaf.treatment).not.toBe('personal')
   const{data:allocations}=await owner.customer.from('bookkeeping_allocations').select('allocation_kind,amount_cents').eq('bookkeeping_decision_id',leaf.id)
   expect(allocations?.map(row=>[row.allocation_kind,row.amount_cents])).toEqual(expect.arrayContaining([['business',-7000],['personal',-7000]]))}
 })
 it('preserves an incomplete home-office profile without creating a deduction',async()=>{
  const admin=createClient(url!,serviceKey!,{auth:{persistSession:false}}),owner=await provisionLocalCanonicalOwner({admin,url:url!,anonKey:anonKey!,label:'home-profile',amounts:[]})
  const result=await owner.customer.rpc('record_deduction_business_fact',{p_fact_type:'home_office_regular_use',p_scope_kind:'business',p_scope_key:'business',p_value:true,
   p_effective_on:'2026-08-24',p_expected_current_event_id:null,p_source:'deduction_profile',p_reason:'Customer described home work.',p_request_key:crypto.randomUUID()})
  expect(result.error).toBeNull();expect((await admin.from('bookkeeping_tax_treatments').select('id').eq('business_id',owner.businessId)).data).toEqual([])
 })
 it('flags possible equipment without fabricating tax treatment or changing reporting totals',async()=>{
  const admin=createClient(url!,serviceKey!,{auth:{persistSession:false}}),owner=await provisionLocalCanonicalOwner({admin,url:url!,anonKey:anonKey!,label:'commercial-mower',amounts:[-480000]})
  const [record]=await records(owner);await resolveExpense(owner,record.id)
  const result=await runDeductionIntelligenceForRecord({admin,snapshot:await loadBookkeepingEvaluationSnapshot({admin,businessId:owner.businessId,recordId:record.id})})
  expect(result.outcome).toBe('special_treatment');expect((await owner.customer.from('bookkeeping_special_treatment_signals').select('id').eq('business_id',owner.businessId)).data).toHaveLength(1)
  expect((await admin.from('bookkeeping_tax_treatments').select('id').eq('business_id',owner.businessId)).data).toEqual([])
  const loaded=await new SupabaseCanonicalFinancialSummaryRepository(owner.customer).loadRecords({businessId:owner.businessId,periodStart:'2026-01-01',periodEnd:'2026-12-31'})
  const report=buildCanonicalReport({canonicalRecords:loaded.records,legacyRecords:[],periodStart:'2026-01-01',periodEnd:'2026-12-31',currency:'USD'})
  expect(report.businessExpensesCents).toBe(480000);expect(report.estimatedDeductionsCents).toBeNull();expect(report.rows[0].specialTreatmentReason).toBe('POSSIBLE_DURABLE_EQUIPMENT')
 })
})

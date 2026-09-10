import { createClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { drainBookkeepingProcessingJobs } from '../../app/lib/bookkeeping/processing'
import { getAuthenticatedCanonicalReport } from '../../app/lib/bookkeeping/reporting-service'
import { correctCanonicalTransactionUse } from '../../app/lib/bookkeeping/transaction-corrections'
import { provisionLocalCanonicalOwner } from '../helpers/local-canonical'

const url=process.env.LOCAL_SUPABASE_URL,anon=process.env.LOCAL_SUPABASE_ANON_KEY,service=process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY
const enabled=process.env.RUN_LOCAL_SUPABASE_INTEGRATION==='1'&&Boolean(url&&anon&&service)
const suite=enabled?describe.sequential:describe.skip

suite('Schedule C operating expenses against local PostgreSQL',()=>{
  it('classifies, treats, reports, and preserves a later customer correction',async()=>{
    const admin=createClient(url!,service!,{auth:{persistSession:false}})
    const owner=await provisionLocalCanonicalOwner({admin,url:url!,anonKey:anon!,label:'software-subscription',amounts:[-12000]})
    const{data:transaction}=await owner.customer.from('financial_transactions')
      .select('id,financial_account_id').eq('id',owner.transactionIds[0]).single()
    expect((await owner.customer.rpc('set_financial_account_use',{p_financial_account_id:transaction!.financial_account_id,
      p_designation:'business_only',p_effective_at:'2026-01-01T00:00:00Z',p_request_id:crypto.randomUUID()})).error).toBeNull()
    for(let pass=0;pass<20;pass+=1){
      await drainBookkeepingProcessingJobs({admin,batchSize:25})
      const{count}=await admin.from('bookkeeping_processing_jobs').select('id',{count:'exact',head:true})
        .eq('business_id',owner.businessId).in('state',['pending','retryable','processing'])
      if(!count)break
    }
    const{data:source}=await admin.from('bookkeeping_financial_sources').select('bookkeeping_record_id')
      .eq('financial_transaction_id',transaction!.id).is('revoked_at',null).single()
    const recordId=String(source!.bookkeeping_record_id)
    const{data:decisions}=await admin.from('bookkeeping_decisions').select('id,supersedes_decision_id,treatment,provenance')
      .eq('business_id',owner.businessId).eq('bookkeeping_record_id',recordId)
    const superseded=new Set((decisions??[]).map(row=>row.supersedes_decision_id).filter(Boolean))
    const current=(decisions??[]).find(row=>!superseded.has(row.id))!
    const{data:allocation}=await admin.from('bookkeeping_allocations').select('id,tax_category_key')
      .eq('bookkeeping_decision_id',current.id).eq('allocation_kind','business').single()
    expect(allocation?.tax_category_key).toBe('software')
    const{data:treatments}=await admin.from('bookkeeping_tax_treatments').select('treatment_status,deductible_amount_cents,rule_key')
      .eq('bookkeeping_allocation_id',allocation!.id)
    expect(treatments).toContainEqual(expect.objectContaining({treatment_status:'deductible',
      deductible_amount_cents:-12000,rule_key:'tax.software-subscriptions'}))
    const{data:assessment}=await owner.customer.from('current_schedule_c_expense_assessments')
      .select('assessment_status,schedule_c_category_key').eq('bookkeeping_record_id',recordId).single()
    expect(assessment).toEqual({assessment_status:'ordinary',schedule_c_category_key:'software'})
    const report=await getAuthenticatedCanonicalReport({supabase:owner.customer,periodStart:'2026-01-01',periodEnd:'2026-12-31'})
    expect(report.categoryTotals).toContainEqual(expect.objectContaining({categoryKey:'software',amountCents:12000}))
    expect(report.estimatedDeductionsCents).toBe(12000)

    const treatmentCount=treatments?.length??0
    const replay=await admin.rpc('request_bookkeeping_processing',{p_business_id:owner.businessId,
      p_bookkeeping_record_id:recordId,p_processing_reason:'deterministic_evaluation',
      p_target_fingerprint:`bookkeeping-evaluator:v2:record:${recordId}:replay:${crypto.randomUUID()}`})
    expect(replay.error).toBeNull()
    expect(await drainBookkeepingProcessingJobs({admin,batchSize:1})).toMatchObject({completed:1,retried:0})
    const{count:replayedTreatmentCount}=await admin.from('bookkeeping_tax_treatments')
      .select('id',{count:'exact',head:true}).eq('bookkeeping_allocation_id',allocation!.id)
    expect(replayedTreatmentCount).toBe(treatmentCount)

    await correctCanonicalTransactionUse({supabase:owner.customer,financialTransactionId:transaction!.id,
      expectedCurrentDecisionId:current.id,correctionRequestId:crypto.randomUUID(),
      answer:{schemaVersion:1,use:'personal'}})
    await drainBookkeepingProcessingJobs({admin,batchSize:25})
    const corrected=await getAuthenticatedCanonicalReport({supabase:owner.customer,periodStart:'2026-01-01',periodEnd:'2026-12-31'})
    expect(corrected.businessExpensesCents).toBe(0)
  })
})

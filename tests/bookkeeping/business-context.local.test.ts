import { createClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { drainBookkeepingProcessingJobs } from '../../app/lib/bookkeeping/processing'
import { getCurrentAskableQuestionQueue } from '../../app/lib/bookkeeping/customer-questions'
import { provisionLocalCanonicalOwner } from '../helpers/local-canonical'

const url=process.env.LOCAL_SUPABASE_URL,anon=process.env.LOCAL_SUPABASE_ANON_KEY,service=process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY
const enabled=process.env.RUN_LOCAL_SUPABASE_INTEGRATION==='1'&&Boolean(url&&anon&&service)
const suite=enabled?describe.sequential:describe.skip

suite('business context against local PostgreSQL',()=>{
  it('stores tenant-safe account history, reprocesses an expense, and removes redundant business-use work',async()=>{
    const admin=createClient(url!,service!,{auth:{persistSession:false}})
    const owner=await provisionLocalCanonicalOwner({admin,url:url!,anonKey:anon!,label:'business-context',amounts:[-12345]})
    const other=await provisionLocalCanonicalOwner({admin,url:url!,anonKey:anon!,label:'business-context-other',amounts:[]})
    const{data:transaction}=await owner.customer.from('financial_transactions').select('financial_account_id').single()
    const accountId=String(transaction!.financial_account_id),firstRequest=crypto.randomUUID()
    const{data:records}=await admin.from('bookkeeping_financial_sources').select('bookkeeping_record_id')
      .eq('business_id',owner.businessId).eq('financial_transaction_id',owner.transactionIds[0]).is('revoked_at',null)
    const recordId=String(records![0].bookkeeping_record_id)
    const{data:initialRows}=await admin.from('bookkeeping_decisions').select('id,supersedes_decision_id')
      .eq('business_id',owner.businessId).eq('bookkeeping_record_id',recordId)
    const initialSuperseded=new Set((initialRows??[]).map(row=>row.supersedes_decision_id).filter(Boolean))
    const initial=(initialRows??[]).find(row=>!initialSuperseded.has(row.id))!
    expect((await admin.rpc('append_bookkeeping_decision',{p_business_id:owner.businessId,
      p_bookkeeping_record_id:recordId,p_expected_current_decision_id:initial.id,p_bookkeeping_nature:'expense',
      p_treatment:'unresolved',p_review_status:'needs_review',p_provenance:'automation',p_confidence:0.9,
      p_reason:'Purchase context established for test.',p_business_purpose:null,p_allocations:[]})).error).toBeNull()
    const first=await owner.customer.rpc('set_financial_account_use',{p_financial_account_id:accountId,
      p_designation:'business_only',p_effective_at:'2026-01-01T00:00:00Z',p_request_id:firstRequest})
    expect(first.error).toBeNull()
    expect((await owner.customer.rpc('set_financial_account_use',{p_financial_account_id:accountId,
      p_designation:'business_only',p_effective_at:'2026-01-01T00:00:00Z',p_request_id:firstRequest})).data).toBe(first.data)
    expect((await other.customer.rpc('set_financial_account_use',{p_financial_account_id:accountId,
      p_designation:'business_and_personal',p_effective_at:'2026-01-01T00:00:00Z',p_request_id:crypto.randomUUID()})).error).not.toBeNull()
    await drainBookkeepingProcessingJobs({admin,batchSize:25})
    const{data:decision}=await admin.from('bookkeeping_decisions').select('treatment,provenance,reason')
      .eq('business_id',owner.businessId).eq('bookkeeping_record_id',recordId)
      .is('supersedes_decision_id',null).order('created_at',{ascending:false}).limit(1).maybeSingle()
    // Select the actual current leaf rather than relying on the root-only predicate.
    const{data:all}=await admin.from('bookkeeping_decisions').select('id,supersedes_decision_id,treatment,provenance,reason')
      .eq('business_id',owner.businessId).eq('bookkeeping_record_id',recordId)
    const superseded=new Set((all??[]).map(row=>row.supersedes_decision_id).filter(Boolean))
    const leaf=(all??[]).find(row=>!superseded.has(row.id))
    expect(leaf).toMatchObject({treatment:'business',provenance:'automation'})
    expect(String(leaf?.reason)).toMatch(/Business only/)
    const queue=await getCurrentAskableQuestionQueue({supabase:owner.customer,scope:'expenses'})
    expect(queue.questions.some(question=>question.recordId===recordId&&question.kind==='business_use')).toBe(false)
    expect(decision).toBeTruthy()
    const changed=await owner.customer.rpc('set_financial_account_use',{p_financial_account_id:accountId,
      p_designation:'business_and_personal',p_effective_at:'2026-01-01T00:00:00Z',p_request_id:crypto.randomUUID()})
    expect(changed.error).toBeNull()
    const{data:history}=await owner.customer.from('financial_account_use_events').select('id,supersedes_event_id,designation')
      .eq('financial_account_id',accountId)
    expect(history).toHaveLength(2)
    await drainBookkeepingProcessingJobs({admin,batchSize:25})
    const afterChange=await getCurrentAskableQuestionQueue({supabase:owner.customer,scope:'expenses'})
    expect(afterChange.questions.some(question=>question.recordId===recordId&&question.kind==='business_use')).toBe(true)
    const restored=await owner.customer.rpc('set_financial_account_use',{p_financial_account_id:accountId,
      p_designation:'business_only',p_effective_at:'2026-01-01T00:00:00Z',p_request_id:crypto.randomUUID()})
    expect(restored.error).toBeNull()
    await drainBookkeepingProcessingJobs({admin,batchSize:25})
    const afterRestore=await getCurrentAskableQuestionQueue({supabase:owner.customer,scope:'expenses'})
    expect(afterRestore.questions.some(question=>question.recordId===recordId&&question.kind==='business_use')).toBe(false)
    const{data:completeHistory}=await owner.customer.from('financial_account_use_events')
      .select('id,supersedes_event_id,designation').eq('financial_account_id',accountId)
    expect(completeHistory).toHaveLength(3)
    await owner.customer.from('financial_account_use_events').update({designation:'business_and_personal'}).eq('id',restored.data)
    const{data:unchanged}=await owner.customer.from('financial_account_use_events').select('designation').eq('id',restored.data).single()
    expect(unchanged?.designation).toBe('business_only')
  })
})

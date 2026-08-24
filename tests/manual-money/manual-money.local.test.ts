import { createClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { SupabaseCanonicalFinancialSummaryRepository } from '../../app/lib/bookkeeping/financial-summary-repository'
import { aggregateCanonicalFinancialSummary } from '../../app/lib/bookkeeping/financial-summary'
import { listTransactionReadModel } from '../../app/lib/bookkeeping/transaction-read-model'
import { provisionLocalCanonicalOwner } from '../helpers/local-canonical'

const url=process.env.LOCAL_SUPABASE_URL;const anonKey=process.env.LOCAL_SUPABASE_ANON_KEY;const serviceKey=process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY
const enabled=process.env.RUN_LOCAL_SUPABASE_INTEGRATION==='1'&&Boolean(url&&anonKey&&serviceKey)
const suite=enabled?describe.sequential:describe.skip
async function record(owner:Awaited<ReturnType<typeof provisionLocalCanonicalOwner>>, direction:'received'|'spent',amount:number,method:string,key=crypto.randomUUID()){
  return owner.customer.rpc('record_manual_financial_activity',{p_direction:direction,p_amount_cents:amount,p_currency:'USD',p_occurred_on:'2026-08-01',p_payment_method:method,p_counterparty_name:direction==='received'?'Smith':'Tool Shop',p_description:direction==='received'?'Landscaping job':'Business tools',p_job_label:'Project A',p_location:null,p_note:null,p_request_key:key})
}
suite('manual financial activity against local PostgreSQL',()=>{
  it('records income and owner-paid expense once with customer provenance and reporting',async()=>{
    const admin=createClient(url!,serviceKey!,{auth:{persistSession:false}})
    const owner=await provisionLocalCanonicalOwner({admin,url:url!,anonKey:anonKey!,label:'manual-core',amounts:[]})
    const key=crypto.randomUUID();const income=await record(owner,'received',60000,'cash',key);const repeat=await record(owner,'received',60000,'cash',key)
    expect(income).toMatchObject({error:null});expect(repeat.data).toBe(income.data)
    const expense=await record(owner,'spent',70000,'personal_card_account');expect(expense.error).toBeNull()
    const {data:events}=await owner.customer.from('current_manual_financial_activity').select('*').eq('business_id',owner.businessId)
    expect(events).toHaveLength(2);expect(events?.every((row)=>row.provenance==='user'&&row.actor_user_id===owner.userId)).toBe(true)
    const repository=new SupabaseCanonicalFinancialSummaryRepository(owner.customer);const loaded=await repository.loadRecords({businessId:owner.businessId,periodStart:'2026-01-01',periodEnd:'2026-12-31'})
    const summary=aggregateCanonicalFinancialSummary({records:loaded.records,periodStart:'2026-01-01',periodEnd:'2026-12-31',currency:'USD',unresolvedCustomerQuestionCount:0})
    expect(summary.businessIncomeCents).toBe(60000);expect(summary.businessExpensesCents).toBe(70000)
    const rows=await listTransactionReadModel({supabase:owner.customer,userId:owner.userId})
    expect(rows.map((row)=>row.sourceLabel)).toEqual(expect.arrayContaining(['Recorded · Cash','Recorded · Personal card/account']))
  })
  it('corrects and removes with immutable history, stale protection, isolation, and current-record resolution',async()=>{
    const admin=createClient(url!,serviceKey!,{auth:{persistSession:false}})
    const owner=await provisionLocalCanonicalOwner({admin,url:url!,anonKey:anonKey!,label:'manual-correct',amounts:[]})
    const other=await provisionLocalCanonicalOwner({admin,url:url!,anonKey:anonKey!,label:'manual-other',amounts:[]})
    const created=await record(owner,'spent',18600,'cash');expect(created.error).toBeNull()
    const {data:before}=await owner.customer.from('current_manual_financial_activity').select('*').eq('manual_financial_source_id',created.data).single()
    const correctionKey=crypto.randomUUID();const correctionArgs={p_manual_financial_source_id:created.data,p_expected_current_event_id:before!.id,p_amount_cents:18650,p_currency:'USD',p_occurred_on:'2026-08-01',p_payment_method:'cash',p_counterparty_name:'Materials',p_description:'Job materials',p_job_label:null,p_location:null,p_note:null,p_request_key:correctionKey}
    const corrected=await owner.customer.rpc('correct_manual_financial_activity',correctionArgs)
    expect(corrected.error).toBeNull()
    const correctionRetry=await owner.customer.rpc('correct_manual_financial_activity',correctionArgs);expect(correctionRetry.error).toBeNull()
    const stale=await owner.customer.rpc('remove_manual_financial_activity',{p_manual_financial_source_id:created.data,p_expected_current_event_id:before!.id,p_request_key:crypto.randomUUID(),p_reason:'Stale removal'})
    expect(stale.error).toBeTruthy()
    const cross=await other.customer.rpc('remove_manual_financial_activity',{p_manual_financial_source_id:created.data,p_expected_current_event_id:before!.id,p_request_key:crypto.randomUUID(),p_reason:'Not allowed'})
    expect(cross.error).toBeTruthy()
    const {data:current}=await owner.customer.from('current_manual_financial_activity').select('*').eq('manual_financial_source_id',created.data).single()
    expect(current!.amount_cents).toBe(-18650)
    const removed=await owner.customer.rpc('remove_manual_financial_activity',{p_manual_financial_source_id:created.data,p_expected_current_event_id:current!.id,p_request_key:crypto.randomUUID(),p_reason:'Duplicate entry'})
    expect(removed.error).toBeNull()
    const {count}=await owner.customer.from('current_manual_financial_activity').select('*',{count:'exact',head:true}).eq('manual_financial_source_id',created.data);expect(count).toBe(0)
    const {data:history}=await owner.customer.from('manual_financial_source_events').select('event_type,bookkeeping_record_id').eq('manual_financial_source_id',created.data)
    expect(history?.map((row)=>row.event_type)).toEqual(expect.arrayContaining(['recorded','corrected','removed']))
    expect(history?.filter((row)=>row.bookkeeping_record_id)).toHaveLength(2)
  })
  it('matches one exact later bank observation through compound resolution and fails closed on ambiguity',async()=>{
    const admin=createClient(url!,serviceKey!,{auth:{persistSession:false}})
    const owner=await provisionLocalCanonicalOwner({admin,url:url!,anonKey:anonKey!,label:'manual-match',amounts:[12500]})
    const manual=await record(owner,'received',12500,'check');expect(manual.error).toBeNull()
    const {data:event}=await owner.customer.from('current_manual_financial_activity').select('*').eq('manual_financial_source_id',manual.data).single()
    const matched=await owner.customer.rpc('match_manual_financial_activity_to_bank_transaction',{p_manual_financial_source_id:manual.data,p_expected_current_event_id:event!.id,p_financial_transaction_id:owner.transactionIds[0],p_request_key:crypto.randomUUID()})
    expect(matched.error).toBeNull()
    const loaded=await new SupabaseCanonicalFinancialSummaryRepository(owner.customer).loadRecords({businessId:owner.businessId,periodStart:'2026-01-01',periodEnd:'2026-12-31'})
    expect(loaded.records.map((row)=>row.id)).toContain(event!.bookkeeping_record_id)
    expect(loaded.records).toHaveLength(1)
    const ambiguous=await provisionLocalCanonicalOwner({admin,url:url!,anonKey:anonKey!,label:'manual-ambiguous',amounts:[90000]})
    const a=await record(ambiguous,'received',90000,'zelle_ach');await record(ambiguous,'received',90000,'cash')
    const {data:aEvent}=await ambiguous.customer.from('current_manual_financial_activity').select('*').eq('manual_financial_source_id',a.data).single()
    const failed=await ambiguous.customer.rpc('match_manual_financial_activity_to_bank_transaction',{p_manual_financial_source_id:a.data,p_expected_current_event_id:aEvent!.id,p_financial_transaction_id:ambiguous.transactionIds[0],p_request_key:crypto.randomUUID()})
    expect(failed.error?.message).toContain('ambiguous')
  })
})

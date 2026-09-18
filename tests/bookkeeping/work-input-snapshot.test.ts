import {it,expect} from 'vitest'
import {workSnapshotReader,WORK_INPUT_TABLES,type WorkInputSnapshot} from '../../app/lib/bookkeeping/work-input-snapshot'
import {guidedWorkProjection} from '../../app/lib/bookkeeping/guided-work-projection'
import {homeCommand} from '../../app/lib/home/command-center'
import {homeStates,homeWorkFixture} from '../fixtures/home-command'
const asOf='2026-09-18T12:00:00.000Z'
function fixture():WorkInputSnapshot{return{version:1,businessId:'a',asOf,
 context:{business:{id:'a'},records:[],links:[],questionVersions:[]} as unknown as WorkInputSnapshot['context'],
 reviews:[],askable:[],tables:Object.fromEntries(WORK_INPUT_TABLES.map(name=>[name,[]])) as unknown as WorkInputSnapshot['tables'],timings:{}}}
it.each(homeStates)('narrow and full selection/counts/readiness/presentation agree: %s',state=>{
 const full=homeWorkFixture(state),narrow=guidedWorkProjection(full)
 expect(narrow.nextAction).toEqual(full.nextAction)
 expect(narrow.customer.actionableCount).toBe(full.customer.actionableCount)
 expect(narrow.customer.deferredCount).toBe(full.customer.deferredCount)
 expect(narrow.readiness).toEqual(full.readiness)
 expect(homeCommand(narrow,'statement_uploads')).toEqual(homeCommand(full,'statement_uploads'))
 expect(narrow.customer).not.toHaveProperty('actionable')
 expect(narrow.betti).not.toHaveProperty('jobs')
 expect(narrow.scope).not.toHaveProperty('coverageGaps')
})
it('uses a fixed snapshot with no mutation API or network fallback',async()=>{
 const s=fixture();s.tables.bookkeeping_records=[{id:'1',business_id:'a',amount_cents:-100,currency:'USD',occurred_on:'2026-09-01'}]
 const reader=workSnapshotReader(s,'a',asOf)
 expect((await reader.from('bookkeeping_records').select('id,amount_cents').eq('business_id','a').in('id',['1'])).data).toEqual([{id:'1',amount_cents:-100}])
 expect((await reader.from('bookkeeping_records').select('id').eq('business_id','foreign')).data).toEqual([])
 expect(()=>reader.from('bookkeeping_records').insert({})).toThrow()
 expect(()=>reader.from('unknown')).toThrow()
 await expect(reader.rpc('answer_bookkeeping_question',{})).rejects.toThrow()
})
it('rejects missing inputs and foreign data rather than constructing false zero work',()=>{
 const s=fixture();s.tables.receipts=[{id:'r',business_id:'foreign'}]
 expect(()=>workSnapshotReader(s,'a',asOf)).toThrow()
 const missing=fixture();delete (missing.tables as Partial<typeof missing.tables>).receipts
 expect(()=>workSnapshotReader(missing,'a',asOf)).toThrow()
 expect(()=>workSnapshotReader(fixture(),'foreign',asOf)).toThrow()
})
it('enforces snapshot time and capacity for context, histories and questions',async()=>{
 expect(()=>workSnapshotReader(fixture(),'a','2026-09-19T12:00:00Z')).toThrow()
 const s=fixture();s.tables.bookkeeping_receipt_events=Array.from({length:1000},()=>({business_id:'a'}))
 expect(()=>workSnapshotReader(s,'a',asOf)).toThrow()
 const reader=workSnapshotReader(fixture(),'a',asOf)
 await expect(reader.rpc('list_current_bookkeeping_review_issues',{p_business_id:'foreign',p_as_of:asOf})).rejects.toThrow()
 await expect(reader.rpc('list_current_askable_bookkeeping_question_event_ids',{p_as_of:'2026-09-19'})).rejects.toThrow()
})
it('preserves null filters, ordering and timestamp comparisons without lexicographic timezone mistakes',async()=>{
 const s=fixture();s.tables.contractor_question_deferral_events=[
  {business_id:'a',id:'old',deferred_until:'2026-09-18T04:00:00-07:00',question_source:null},
  {business_id:'a',id:'new',deferred_until:'2026-09-18T06:00:00-07:00',question_source:null},
 ]
 const reader=workSnapshotReader(s,'a',asOf)
 const r=await reader.from('contractor_question_deferral_events').select('id').is('question_source',null).gt('deferred_until',asOf).order('deferred_until')
 expect(r.data).toEqual([{id:'new'}])
})

it('preserves the full Plaid version chain when the original canonical source was removed or replaced',async()=>{
 const {currentPlaidFinancialState,plaidFinancialTransactionIsCurrent}=await import('../../app/lib/plaid/current-sources')
 const s=fixture();s.tables.plaid_transaction_versions=[
  {business_id:'a',id:'v1',plaid_transaction_id:'provider-1',supersedes_version_id:null,canonical_financial_transaction_id:'old',event_type:'added'},
  {business_id:'a',id:'v2',plaid_transaction_id:'provider-1',supersedes_version_id:'v1',canonical_financial_transaction_id:'replacement',event_type:'modified'},
  {business_id:'a',id:'v3',plaid_transaction_id:'provider-1',supersedes_version_id:'v2',canonical_financial_transaction_id:null,event_type:'removed'},
 ]
 const state=await currentPlaidFinancialState({supabase:workSnapshotReader(s,'a',asOf),businessId:'a',candidateFinancialTransactionIds:['old','replacement']})
 expect(plaidFinancialTransactionIsCurrent({id:'old',state})).toBe(false)
 expect(plaidFinancialTransactionIsCurrent({id:'replacement',state})).toBe(false)
 expect(plaidFinancialTransactionIsCurrent({id:'statement',state})).toBe(true)
})

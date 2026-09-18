import {it,expect} from 'vitest'
import {SupabaseBookkeepingRepository} from '../../app/lib/bookkeeping/supabase-repository'
import type {SupabaseClient} from '@supabase/supabase-js'
function fixture(count:number,missingSource=false){
 const events=Array.from({length:count},(_,i)=>({id:`event-${i}`,business_id:'a',bookkeeping_record_id:`record-${i}`,review_issue_id:`issue-${i}`,based_on_decision_id:`decision-${i}`,sequence_number:1,event_type:'opened',reason:'BUSINESS_USE_UNCLEAR',issue_key:`issue-${i}`,context_fingerprint:'context',provenance:'system',created_at:'2026-09-18'}))
 const tables:Record<string,Record<string,unknown>[]>= {
  bookkeeping_records:events.map((_,i)=>({id:`record-${i}`,business_id:'a',amount_cents:1,currency:'USD'})),
  bookkeeping_financial_sources:events.map((_,i)=>({business_id:'a',bookkeeping_record_id:`record-${i}`,financial_transaction_id:`financial-${i}`,revoked_at:null})),
  financial_transactions:missingSource?[]:events.map((_,i)=>({id:`financial-${i}`,business_id:'a',amount_cents:-10000,currency:'USD'})),
  bookkeeping_decisions:events.map((_,i)=>({id:`decision-${i}`,business_id:'a',bookkeeping_record_id:`record-${i}`,treatment:'mixed_use',review_status:'needs_review',provenance:'user',created_at:'2026-09-18'})),
  bookkeeping_allocations:events.flatMap((_,i)=>[{business_id:'a',bookkeeping_decision_id:`decision-${i}`,allocation_kind:'business',amount_cents:6000,tax_category_key:'office_expenses'}, {business_id:'a',bookkeeping_decision_id:`decision-${i}`,allocation_kind:'personal',amount_cents:4000,tax_category_key:null}]),
  plaid_transaction_versions:[],
 }
 const reads:Array<{table:string;filters:Array<[string,unknown]>}>=[]
 const db={rpc:async()=>({data:events,error:null}),from:(table:string)=>{
  let rows=tables[table]??[];const read={table,filters:[] as Array<[string,unknown]>};reads.push(read)
  const query={select:()=>query,eq:(key:string,value:unknown)=>{read.filters.push([key,value]);rows=rows.filter(r=>r[key]===value);return query},in:(key:string,values:unknown[])=>{rows=rows.filter(r=>values.includes(r[key]));return query},is:(key:string,value:unknown)=>{rows=rows.filter(r=>r[key]===value);return query},then:(resolve:(value:unknown)=>unknown)=>Promise.resolve({data:rows,error:null}).then(resolve)}
  return query
 }} as unknown as SupabaseClient
 return{db,reads}
}
it('loads 24 questions with six bounded tenant-scoped reads, preserving financial authority and all allocations',async()=>{
 const{db,reads}=fixture(24);const rows=await new SupabaseBookkeepingRepository(db).listCurrentWeeklyReviewItems('a','2026-09-18')
 expect(rows).toHaveLength(24);expect(reads).toHaveLength(6)
 for(const read of reads)expect(read.filters).toContainEqual(['business_id','a'])
 expect(rows[0].record.authoritativeAmountCents).toBe(-10000)
 expect(rows[0].decision.allocations.map(a=>a.amountCents)).toEqual([6000,4000])
})
it('hydrates only the requested issue during an answer',async()=>{
 const{db}=fixture(24);const rows=await new SupabaseBookkeepingRepository(db).listCurrentWeeklyReviewItems('a','2026-09-18','issue-7')
 expect(rows).toHaveLength(1);expect(rows[0].event.reviewIssueId).toBe('issue-7')
})
it('fails closed for missing financial evidence rather than making up record amounts',async()=>{
 const{db}=fixture(1,true);await expect(new SupabaseBookkeepingRepository(db).listCurrentWeeklyReviewItems('a','2026-09-18')).rejects.toThrow()
})
it('isolates another business even when an upstream adapter returns an unowned event',async()=>{
 const{db}=fixture(1);await expect(new SupabaseBookkeepingRepository(db).listCurrentWeeklyReviewItems('b','2026-09-18')).rejects.toThrow()
})
it('bounds larger queues into batches rather than issuing one query per item',async()=>{
 const{db,reads}=fixture(205);expect(await new SupabaseBookkeepingRepository(db).listCurrentWeeklyReviewItems('a','2026-09-18')).toHaveLength(205)
 expect(reads).toHaveLength(18)
})

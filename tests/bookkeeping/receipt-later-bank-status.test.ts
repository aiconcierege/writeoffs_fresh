import {describe,it,expect,vi} from 'vitest'
import type {SupabaseClient} from '@supabase/supabase-js'
import {listCanonicalReceipts} from '../../app/lib/bookkeeping/receipt-workflow'
function db(associated:boolean){
 const sourceReads:unknown[][]=[]
 const tables:Record<string,unknown>={businesses:{id:'business'},receipts:[{id:'receipt',business_id:'business',created_at:'2026-05-01'}],
  bookkeeping_receipt_events:[{id:'event',receipt_id:'receipt',bookkeeping_record_id:'record',event_type:'kept'}],
  bookkeeping_financial_sources:associated?[{bookkeeping_record_id:'record'}]:[]}
 const client={auth:{getUser:async()=>({data:{user:{id:'owner'}}})},from:vi.fn((table:string)=>{
  const result={data:tables[table]??[],error:null}
  const q={select:()=>q,eq:(...args:unknown[])=>{if(table==='bookkeeping_financial_sources')sourceReads.push(args);return q},in:()=>q,is:()=>q,order:()=>q,limit:()=>q,single:()=>Promise.resolve(result),then:(resolve:(r:unknown)=>unknown)=>Promise.resolve(result).then(resolve)}
  return q
 })}
 return{client:client as unknown as SupabaseClient,sourceReads}
}
describe('receipt status after later bank association',()=>{
 it.each([false,true])('describes actual financial evidence while preserving immutable lifecycle history (%s)',async associated=>{
  const{client,sourceReads}=db(associated);const [receipt]=await listCanonicalReceipts({supabase:client})
  expect(receipt.state).toBe('kept');expect(receipt.displayStatus).toBe(associated?'matched':'receipt_only')
  expect(sourceReads).toContainEqual(['business_id','business'])
 })
})

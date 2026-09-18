import 'server-only'
import type {SupabaseClient} from '@supabase/supabase-js'
import type {WorkContext} from './betti-work'

export const WORK_INPUT_TABLES = [
 'current_bookkeeping_record_convergences','bookkeeping_receipt_events','current_bookkeeping_compound_components',
 'manual_financial_source_events','current_bookkeeping_source_convergences','current_deduction_attentions',
 'current_contractor_payments','current_canonical_contractors','current_contractor_w9_status',
 'contractor_question_deferral_events','business_vehicles','bookkeeping_records','bookkeeping_financial_sources',
 'bookkeeping_decisions','bookkeeping_allocations','bookkeeping_document_links','financial_transactions',
 'plaid_transaction_versions','receipts','current_bookkeeping_receipt_extractions',
] as const
export type WorkInputRow = Record<string,unknown>
export type WorkInputSnapshot = {
 version:1;businessId:string;asOf:string;context:WorkContext;reviews:WorkInputRow[];
 askable:{event_id:string}[];tables:Record<typeof WORK_INPUT_TABLES[number],WorkInputRow[]>;
 timings?:Record<string,number>
}

/** A bounded, immutable read-repository adapter, not another eligibility engine.
 * Existing canonical readers execute unchanged against one database snapshot.
 * Only the exact read operators used by those readers exist. There is no network
 * fallback, auth impersonation, mutation method or cross-request cache. Unsupported
 * queries fail closed, so a new dependency cannot silently become an empty table. */
export function workSnapshotReader(snapshot:WorkInputSnapshot,businessId:string,asOf:string):SupabaseClient {
 if(snapshot.version!==1||snapshot.businessId!==businessId||snapshot.context.business.id!==businessId
  ||Date.parse(snapshot.asOf)!==Date.parse(asOf))throw new Error('Invalid work input snapshot')
 if(snapshot.context.records.length>=1000||snapshot.context.links.length>=1000||(snapshot.context.questionVersions?.length??0)>=1000)
  throw new Error('Work input capacity exceeded')
 for(const name of WORK_INPUT_TABLES){
  const rows=snapshot.tables[name]
  if(!Array.isArray(rows)||rows.length>=1000||rows.some(row=>row.business_id!==businessId))
   throw new Error('Invalid or unowned work input table')
 }
 if(!Array.isArray(snapshot.reviews)||snapshot.reviews.length>=1000
  ||snapshot.reviews.some(row=>row.business_id!==businessId)||!Array.isArray(snapshot.askable)||snapshot.askable.length>=1000)
  throw new Error('Invalid work input questions')
 const sameTime=(value:unknown)=>typeof value==='string'&&Date.parse(value)===Date.parse(asOf)
 const compare=(key:string,a:unknown,b:unknown)=>{
  if(a==null)return b==null?0:1
  if(b==null)return -1
  if(key.endsWith('_at')||key==='deferred_until')return Date.parse(String(a))-Date.parse(String(b))
  return a===b?0:String(a)<String(b)?-1:1
 }
 const reader={
  rpc:async(name:string,args:Record<string,unknown>)=>{
   if(name==='list_current_bookkeeping_review_issues'&&args.p_business_id===businessId&&sameTime(args.p_as_of))
    return{data:snapshot.reviews,error:null}
   if(name==='list_current_askable_bookkeeping_question_event_ids'&&sameTime(args.p_as_of))
    return{data:snapshot.askable,error:null}
   throw new Error('Unsupported work snapshot RPC')
  },
  from:(table:string)=>{
   if(!WORK_INPUT_TABLES.includes(table as typeof WORK_INPUT_TABLES[number]))throw new Error('Unsupported work snapshot table')
   let rows=[...snapshot.tables[table as typeof WORK_INPUT_TABLES[number]]],columns:string[]|null=null
   const query={
    select:(selection:string)=>{
     if(selection!=='*'&&!/^[a-z_]+(?:,[a-z_]+)*$/.test(selection))throw new Error('Unsupported work snapshot selection')
     columns=selection==='*'?null:selection.split(',');return query
    },
    eq:(key:string,value:unknown)=>{rows=rows.filter(row=>row[key]===value);return query},
    is:(key:string,value:unknown)=>{rows=rows.filter(row=>row[key]===value);return query},
    in:(key:string,values:unknown[])=>{rows=rows.filter(row=>values.includes(row[key]));return query},
    gt:(key:string,value:unknown)=>{rows=rows.filter(row=>row[key]!=null&&compare(key,row[key],value)>0);return query},
    order:(key:string,options?:{ascending?:boolean})=>{
     rows.sort((a,b)=>compare(key,a[key],b[key])*(options?.ascending===false?-1:1));return query
    },
    then:<T>(resolve:(value:{data:WorkInputRow[];error:null})=>T)=>Promise.resolve({
     data:rows.map(row=>columns?Object.fromEntries(columns.map(key=>{
      if(!(key in row))throw new Error('Work input column missing');return[key,row[key]]
     })):{...row}),error:null,
    }).then(resolve),
   }
   return query
  },
 }
 return reader as unknown as SupabaseClient
}

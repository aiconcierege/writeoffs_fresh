import type { SupabaseClient } from '@supabase/supabase-js'
import { listTransactionReadModel } from './transaction-read-model'

export const WORK_VIEWS = ['all', 'receipts', 'receipt-only', 'review'] as const
export type WorkView = typeof WORK_VIEWS[number]
export type WorkIndex = {
  merchant:string; amount_cents:number|null; currency:string; description:string;
  record_id: string; transaction_id: string; decision_id: string; activity_date: string
  category_key: string | null; account_id: string | null; has_receipt: boolean
  receipt_unavailable: boolean; needs_fact: boolean; historical_documentation: boolean
  historical: boolean; sweep_reviewed: boolean; source_kind: string; treatment: string; bookkeeping_nature: string
}
export type ReviewSelection = { recordId: string; decisionId: string }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
export function validateGuidedReview(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid review.')
  const body = value as Record<string, unknown>
  if (Object.keys(body).sort().join(',') !== 'action,items,requestId,scope'
    || !UUID.test(String(body.requestId)) || !['remove_business','receipt_unavailable','reviewed'].includes(String(body.action))
    || !['all','receipts','historical','review'].includes(String(body.scope)) || !Array.isArray(body.items)
    || body.items.length < 1 || body.items.length > 100) throw new Error('Select up to 100 purchases on this page.')
  const items = body.items.map(item => {
    if (!item || typeof item !== 'object' || Object.keys(item).sort().join(',') !== 'decisionId,recordId'
      || !UUID.test(item.recordId) || !UUID.test(item.decisionId)) throw new Error('Invalid purchase selection.')
    return { recordId: item.recordId as string, decisionId: item.decisionId as string }
  })
  if (new Set(items.map(item => item.recordId)).size !== items.length) throw new Error('Duplicate purchase selection.')
  return { requestId: String(body.requestId), action: String(body.action), scope: String(body.scope), items }
}
export async function loadTransactionWork(input: {supabase:SupabaseClient; userId:string; view:WorkView; historical?:boolean; offset?:number; query?:string; start?:string; end?:string; category?:string; account?:string}) {
  const {data,error}=await input.supabase.rpc('list_customer_transaction_work',{
    p_view:input.view,p_historical:input.historical??false,p_offset:input.offset??0,
    p_query:input.query??'',p_start:input.start??null,p_end:input.end??null,
    p_category:input.category||null,p_account:input.account||null,
  })
  if(error) throw new Error('Your transaction review could not be loaded.')
  const index=(data??[]) as WorkIndex[]
  const page=index.slice(0,50)
  const rows=page.length?await listTransactionReadModel({supabase:input.supabase,userId:input.userId,recordIds:page.filter(row=>!['legacy','receipt_evidence'].includes(row.source_kind)).map(row=>row.record_id),legacyIds:page.filter(row=>row.source_kind==='legacy').map(row=>row.record_id),limit:100}):[]
  for(const receipt of page.filter(row=>row.source_kind==='receipt_evidence')) rows.push({id:receipt.transaction_id,sourceModel:'canonical',date:receipt.activity_date,vendor:receipt.merchant,description:receipt.description,amount:(receipt.amount_cents??0)/100,amountCents:receipt.amount_cents??0,currency:receipt.currency,category_key:null,has_receipt:true,receipt_waived:false,treatmentLabel:'Receipt waiting to be matched',decisionReason:null,decisionProvenance:null,correctionCount:0,recordId:receipt.record_id,currentDecisionId:null,bookkeepingNature:null,treatment:null,history:[],evidenceLinks:[],receiptLost:false,sourceLabel:'Receipt only',sourceKind:'receipt_evidence',contractorName:null})
  return {hasMore:index.length>50,rows:rows.map(row=>({ ...row,work:page.find(item=>item.record_id===(row.recordId??row.id))! }))}
}
export async function loadGuidedWorkSummary(supabase:SupabaseClient) {
  const {data,error}=await supabase.rpc('customer_guided_work_summary')
  if(error) throw new Error('Guided review could not be loaded.')
  return data as {missingReceipts:boolean;historicalReview:boolean;documentationLimitations:boolean}
}

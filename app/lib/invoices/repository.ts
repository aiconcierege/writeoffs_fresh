import type { SupabaseClient } from '@supabase/supabase-js'
import { SupabaseCanonicalFinancialSummaryRepository } from '../bookkeeping/financial-summary-repository'

export async function invoiceContext(supabase:SupabaseClient){
 const {data:{user}}=await supabase.auth.getUser();if(!user)throw new Error('AUTH_REQUIRED')
 const {data:business,error}=await supabase.from('businesses').select('id,name,owner_name,contact_email,address_line1,address_line2,city,state,postal_code').eq('owner_user_id',user.id).single()
 if(error||!business)throw new Error('BUSINESS_UNAVAILABLE')
 const {data:invoices,error:invoiceError}=await supabase.from('current_canonical_invoices').select('*').eq('business_id',business.id).order('issue_date',{ascending:false})
 if(invoiceError)throw new Error('INVOICES_UNAVAILABLE')
 return{user,business,invoices:invoices??[]}
}

export async function invoiceDetail(supabase:SupabaseClient,id:string){
 const context=await invoiceContext(supabase);const invoice=context.invoices.find(row=>row.id===id)
 if(!invoice)throw new Error('INVOICE_UNAVAILABLE')
 const loaded=await new SupabaseCanonicalFinancialSummaryRepository(supabase).loadRecords({businessId:String(context.business.id),periodStart:String(invoice.issue_date),periodEnd:'9999-12-31'})
 const candidateIds=loaded.records.map((record)=>record.id)
 const {data:used,error:usedError}=candidateIds.length?await supabase.from('invoice_income_links')
  .select('bookkeeping_record_id').eq('business_id',context.business.id).in('bookkeeping_record_id',candidateIds):{data:[],error:null}
 if(usedError)throw new Error('INVOICE_PAYMENT_CONTEXT_UNAVAILABLE')
 const usedRecordIds=new Set((used??[]).map((row)=>row.bookkeeping_record_id))
 const candidates=loaded.records.filter(record=>!usedRecordIds.has(record.id)&&record.amountCents===Number(invoice.amount_cents)&&record.currency===invoice.currency&&record.occurredOn&&record.occurredOn>=invoice.issue_date&&record.decisions.some(decision=>{
   const superseded=new Set(record.decisions.map(item=>item.supersedesDecisionId).filter(Boolean));return !superseded.has(decision.id)&&decision.bookkeepingNature==='business_income'&&decision.treatment==='business'
 })).map(record=>({recordId:record.id,date:record.occurredOn,merchant:record.merchant??'Business income',description:record.description}))
 return{...context,invoice,paymentCandidates:candidates}
}

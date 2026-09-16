import type { SupabaseClient } from '@supabase/supabase-js'
export type RefundCandidate={recordId:string;merchant:string;date:string;amountCents:number;treatment:string;crossYear:boolean}
export type SpecialWork={recordId:string;decisionId:string;nature:string|null;treatment:string;amountCents:number;kind:'refund'|'loan'|'movement'|null;lastAction:string|null;candidates:RefundCandidate[];linked:boolean}
export function refundMerchant(value:string){return value.toLowerCase().replace(/\b(refund|return|credit|purchase|pos)\b/g,'').replace(/#\d+|\b\d{3,}\b/g,'').replace(/[^a-z0-9]/g,'')}
export async function loadSpecialWork(db:SupabaseClient,recordId:string):Promise<SpecialWork|null>{
 const {data:w,error}=await db.from('customer_transaction_work').select('*').eq('record_id',recordId).maybeSingle()
 if(error)throw new Error('Unable to load this activity.')
 if(!w||w.source_kind!=='financial_transaction')return null
 const {data:events,error:eventError}=await db.from('bookkeeping_special_events').select('action,decision_id').eq('bookkeeping_record_id',recordId).order('created_at',{ascending:false}).limit(1)
 if(eventError)throw new Error('Unable to load supporting facts.')
 const lastAction=events?.[0]?.action??null
 const kind=w.bookkeeping_nature==='refund'?'refund':w.bookkeeping_nature==='loan_principal_payment'?'loan':w.treatment==='unresolved'&&((w.amount_cents<0&&/loan|payment|transfer/i.test(w.description??w.merchant??''))||(w.amount_cents>0&&/payment received.*thank you|credit.card payment/i.test(w.description??w.merchant??'')))?'movement':null
 const candidates:RefundCandidate[]=[]
 if(kind==='refund'&&w.treatment==='unresolved'){
  const start=new Date(`${w.activity_date}T00:00:00Z`);start.setUTCDate(start.getUTCDate()-180)
  const result=await db.from('customer_transaction_work').select('record_id,merchant,activity_date,amount_cents,treatment,account_id').eq('bookkeeping_nature','expense').in('treatment',['business','mixed_use','personal']).lte('amount_cents',-w.amount_cents).gte('activity_date',start.toISOString().slice(0,10)).lte('activity_date',w.activity_date).order('activity_date',{ascending:false}).limit(200)
  if(result.error)throw new Error('Earlier purchases could not be loaded.')
  for(const row of result.data??[])if(row.account_id===w.account_id&&refundMerchant(row.merchant)===refundMerchant(w.merchant))candidates.push({recordId:row.record_id,merchant:row.merchant,date:row.activity_date,amountCents:row.amount_cents,treatment:row.treatment,crossYear:row.activity_date.slice(0,4)!==w.activity_date.slice(0,4)})
 }
 return {recordId,decisionId:w.decision_id,nature:w.bookkeeping_nature,treatment:w.treatment,amountCents:w.amount_cents,kind,lastAction,candidates:candidates.slice(0,20),linked:kind==='refund'&&w.treatment!=='unresolved'}
}
export function specialNatureLabel(nature:string|null,treatment:string|null){
 if(treatment==='personal')return 'Owner/personal use'
 return ({refund:'Refund',credit_card_payment:'Credit card payment',transfer:'Transfer',owner_contribution:'Money you added',loan_proceeds:'Loan proceeds',loan_principal_payment:'Loan payment',business_income:'Customer payment'} as Record<string,string>)[nature??'']??null
}

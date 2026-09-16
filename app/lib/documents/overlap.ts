import type {SupabaseClient} from '@supabase/supabase-js'
type Activity={transactionDate:string;amountCents:number;rawDescription:string}
const normalize=(s:string)=>s.toLowerCase().replace(/[^a-z0-9]/g,'')
// Matching amount alone is never authority to merge. If evidence suggests a
// cross-source overlap, hold the document for review rather than double-counting.
export async function documentMayOverlap(db:SupabaseClient,businessId:string,rows:Activity[],source:'statement'|'csv',account?:{institutionName:string;maskedAccount:string|null;accountType:string}){
 if(!rows.length)return false
 const dates=rows.map(r=>r.transactionDate).sort(),start=new Date(dates[0]+'T00:00:00Z'),end=new Date(dates.at(-1)+'T00:00:00Z');start.setUTCDate(start.getUTCDate()-3);end.setUTCDate(end.getUTCDate()+3)
 const existing=await db.from('financial_transactions').select('id,financial_account_id,import_method,transaction_date,amount_cents,original_description').eq('business_id',businessId).gte('transaction_date',start.toISOString().slice(0,10)).lte('transaction_date',end.toISOString().slice(0,10)).limit(5000)
 if(existing.error)throw new Error('DOCUMENT_OVERLAP_CHECK_FAILED');if(existing.data.length===5000)return true
 let sameAccounts:string[]=[]
 if(source==='statement'&&account?.maskedAccount){const a=await db.from('financial_accounts').select('id,institution_name').eq('business_id',businessId).eq('provider','statement').eq('account_type',account.accountType).eq('mask_last_four',account.maskedAccount)
  if(a.error)throw new Error('DOCUMENT_OVERLAP_CHECK_FAILED');sameAccounts=a.data.filter(a=>normalize(a.institution_name??'')===normalize(account.institutionName)).map(a=>a.id)}
 return existing.data.some(t=>{
  if(source==='csv'&&t.import_method==='csv')return false // existing occurrence-aware CSV identity remains authoritative
  if(source==='statement'&&t.import_method==='statement'&&sameAccounts.includes(t.financial_account_id))return false
  return rows.some(r=>r.amountCents===t.amount_cents&&Math.abs(Date.parse(r.transactionDate)-Date.parse(t.transaction_date))<=3*86400000&&normalize(r.rawDescription)===normalize(t.original_description??''))
 })
}

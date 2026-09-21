import type{SupabaseClient}from'@supabase/supabase-js'
import{listTransactionReadModel,type TransactionReadRow}from'../bookkeeping/transaction-read-model'

export type HomeRecentTransaction={id:string;merchant:string;date:string;amountCents:number;status:string;href:string}
export type HomeRecentReceiptMatch={id:string;merchant:string;date:string;amountCents:number;href:string}
export type HomeRecentActivity={transactions:HomeRecentTransaction[];receiptMatches:HomeRecentReceiptMatch[]}

function transactionStatus(row:TransactionReadRow){
 if(row.treatment==='personal')return'Personal'
 if(row.treatment==='excluded')return row.treatmentLabel||'Outside income and expenses'
 if(row.bookkeepingNature==='income')return'Income'
 if(row.treatment==='mixed_use')return'Business + personal'
 if(row.treatment==='business')return'Business'
 return'Not yet organized'
}

export function deriveHomeRecentActivity(rows:TransactionReadRow[]):HomeRecentActivity{
 // The read model enforces authorized date scope. A personal exception or
 // non-P&L movement is still recent financial activity, not a missing row.
 const relevant=rows.filter(row=>row.sourceModel==='canonical')
  .sort((a,b)=>b.date.localeCompare(a.date)||b.id.localeCompare(a.id))
 const transactions=relevant.slice(0,5).map(row=>({id:row.id,merchant:row.vendor,date:row.date,amountCents:row.amountCents,
  status:transactionStatus(row),href:`/transactions/${row.id}?returnTo=%2Fhome`}))
 const receiptMatches=relevant.filter(row=>row.sourceKind==='financial_transaction').flatMap(row=>row.evidenceLinks.map(link=>({id:link.id,merchant:row.vendor,date:link.attachedAt.slice(0,10),
  amountCents:row.amountCents,href:`/transactions/${row.id}?returnTo=%2Fhome`,attachedAt:link.attachedAt})))
  .sort((a,b)=>b.attachedAt.localeCompare(a.attachedAt)||b.id.localeCompare(a.id)).slice(0,3)
  .map(match=>({id:match.id,merchant:match.merchant,date:match.date,amountCents:match.amountCents,href:match.href}))
 return{transactions,receiptMatches}
}

export async function getHomeRecentActivity(supabase:SupabaseClient,userId:string,start:string,end:string){
 // Resolve bounded groups through the same canonical read model. Passing every
 // historical record ID in one PostgREST URL exceeds request limits for multiple
 // 730-day bank connections. Keep the existing 250-row recent-activity window.
 const rows:TransactionReadRow[]=[]
 const business=await supabase.from('businesses').select('id').eq('owner_user_id',userId).single()
 if(business.error||!business.data)throw new Error('Could not load recent activity.')
 for(let offset=0;rows.length<250;offset+=100){
  const candidates=await supabase.from('active_bookkeeping_records').select('id')
   .eq('business_id',business.data.id).gte('occurred_on',start).lte('occurred_on',end)
   .order('occurred_on',{ascending:false}).order('id',{ascending:false}).range(offset,offset+99)
  if(candidates.error)throw new Error('Could not load recent activity.')
  if(!candidates.data?.length)break
  rows.push(...await listTransactionReadModel({supabase,userId,start,end,limit:100,
   recordIds:candidates.data.map(row=>row.id),legacyIds:[]}))
  if(candidates.data.length<100)break
 }
 return deriveHomeRecentActivity(rows.slice(0,250))
}

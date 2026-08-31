import type{SupabaseClient}from'@supabase/supabase-js'
import{listTransactionReadModel,type TransactionReadRow}from'../bookkeeping/transaction-read-model'

export type HomeRecentTransaction={id:string;merchant:string;date:string;amountCents:number;status:string;href:string}
export type HomeRecentReceiptMatch={id:string;merchant:string;date:string;amountCents:number;href:string}
export type HomeRecentActivity={transactions:HomeRecentTransaction[];receiptMatches:HomeRecentReceiptMatch[]}

function transactionStatus(row:TransactionReadRow){
 if(row.bookkeepingNature==='income')return'Income'
 if(row.treatment==='mixed_use')return'Business + personal'
 if(row.treatment==='business')return'Business'
 return'Still working on it'
}

export function deriveHomeRecentActivity(rows:TransactionReadRow[]):HomeRecentActivity{
 const relevant=rows.filter(row=>row.sourceModel==='canonical'&&!['personal','excluded'].includes(row.treatment??''))
  .sort((a,b)=>b.date.localeCompare(a.date)||b.id.localeCompare(a.id))
 const transactions=relevant.slice(0,5).map(row=>({id:row.id,merchant:row.vendor,date:row.date,amountCents:row.amountCents,
  status:transactionStatus(row),href:`/transactions/${row.id}`}))
 const receiptMatches=relevant.flatMap(row=>row.evidenceLinks.map(link=>({id:link.id,merchant:row.vendor,date:link.attachedAt.slice(0,10),
  amountCents:row.amountCents,href:`/transactions/${row.id}`,attachedAt:link.attachedAt})))
  .sort((a,b)=>b.attachedAt.localeCompare(a.attachedAt)||b.id.localeCompare(a.id)).slice(0,5)
  .map(match=>({id:match.id,merchant:match.merchant,date:match.date,amountCents:match.amountCents,href:match.href}))
 return{transactions,receiptMatches}
}

export async function getHomeRecentActivity(supabase:SupabaseClient,userId:string,start:string,end:string){
 const rows=await listTransactionReadModel({supabase,userId,start,end,limit:250})
 return deriveHomeRecentActivity(rows)
}

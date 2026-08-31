import type{SupabaseClient}from'@supabase/supabase-js'
import{listTransactionReadModel,type TransactionReadRow}from'../bookkeeping/transaction-read-model'

export type RecentlyHandledItem={id:string;merchant:string;outcome:string;handledAt:string;href:string}

export function deriveRecentlyHandled(rows:TransactionReadRow[]):RecentlyHandledItem[]{
  return rows.flatMap(row=>{
    if(row.sourceModel!=='canonical'||!['business','mixed_use'].includes(row.treatment??''))return[]
    const decisionAt=row.history[0]?.createdAt??`${row.date}T00:00:00.000Z`
    const receiptAt=row.evidenceLinks.map(link=>link.attachedAt).sort().at(-1)??null
    let outcome:string,handledAt=decisionAt
    if(receiptAt&&receiptAt>=decisionAt){outcome='Receipt matched';handledAt=receiptAt}
    else if(row.correctionCount>0)outcome='Customer correction applied'
    else if(row.bookkeepingNature==='income')outcome='Income recorded'
    else if(row.bookkeepingNature==='expense')outcome=row.treatment==='mixed_use'?'Business and personal expense handled':'Business expense handled'
    else return[]
    return[{id:`${row.sourceModel}:${row.id}`,merchant:row.vendor,outcome,handledAt,href:`/transactions/${row.id}`}]
  }).sort((a,b)=>b.handledAt.localeCompare(a.handledAt)).slice(0,5)
}

export async function getRecentlyHandled(supabase:SupabaseClient,userId:string,start:string,end:string){
  const rows=await listTransactionReadModel({supabase,userId,start,end,limit:250})
  return deriveRecentlyHandled(rows)
}

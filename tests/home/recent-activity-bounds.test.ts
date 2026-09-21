import { expect, it, vi } from 'vitest'
const read=vi.hoisted(()=>vi.fn())
vi.mock('../../app/lib/bookkeeping/transaction-read-model',()=>({listTransactionReadModel:read}))
import {getHomeRecentActivity} from '../../app/lib/home/recently-handled'
it('bounds canonical record lookups while continuing past excluded records',async()=>{
 const ids=Array.from({length:301},(_,i)=>`record-${i}`),range=vi.fn(async(from:number,to:number)=>({data:ids.slice(from,to+1).map(id=>({id})),error:null}))
 const query={select:vi.fn().mockReturnThis(),eq:vi.fn().mockReturnThis(),gte:vi.fn().mockReturnThis(),lte:vi.fn().mockReturnThis(),order:vi.fn().mockReturnThis(),range,
 single:async()=>({data:{id:'owned-business'},error:null})}
 read.mockImplementation(async({recordIds})=>recordIds.filter((id:string)=>id!=='record-0').map((id:string)=>({id,sourceModel:'canonical',sourceKind:'financial_transaction',date:'2026-05-01',vendor:id,amountCents:100,treatment:'business',evidenceLinks:[]})))
 const result=await getHomeRecentActivity({from:()=>query} as never,'owner','2026-01-01','2026-12-31')
 expect(read).toHaveBeenCalledTimes(3)
 expect(read.mock.calls.every(([input])=>input.recordIds.length<=100&&input.legacyIds.length===0)).toBe(true)
 expect(query.eq).toHaveBeenCalledWith('business_id','owned-business')
 expect(result.transactions).toHaveLength(5)
 expect(result.transactions.every(row=>row.id!=='record-0')).toBe(true)
})

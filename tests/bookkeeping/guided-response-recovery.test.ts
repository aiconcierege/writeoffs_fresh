import * as React from 'react'
import {describe,it,expect,vi,afterEach} from 'vitest'
import {QuestionFlow} from '../../app/questions/QuestionFlow'
import type {CustomerQuestion} from '../../app/lib/bookkeeping/customer-questions'
vi.mock('next/navigation',()=>({useRouter:()=>({refresh:vi.fn()})}))
vi.mock('react',async importOriginal=>({
 ...await importOriginal<typeof import('react')>(),
 useEffect:vi.fn(),
 useRef:(value:unknown)=>({current:value}),
 useState:(value:unknown)=>[typeof value==='function'?value():value,vi.fn()],
}))
vi.stubGlobal('React',React)
afterEach(()=>vi.unstubAllGlobals())
const question:CustomerQuestion={id:'issue',version:'current-version',recordId:'record',source:'bookkeeping',kind:'transaction_type',prompt:'What was this money for?',transaction:{merchant:'Synthetic deposit',date:'2026-09-18',amountCents:97500,currency:'USD'},options:[{id:'earned_money',label:'Payment from a customer'}]}
function findAnswer(node:React.ReactNode):(()=>Promise<void>)|undefined{
 if(!React.isValidElement(node))return
 const element=node as React.ReactElement<{children?:React.ReactNode;onClick?:()=>Promise<void>}>
 if(element.props.children==='Payment from a customer')return element.props.onClick
 for(const child of React.Children.toArray(element.props.children)){const found=findAnswer(child);if(found)return found}
}
async function answer(fetcher:ReturnType<typeof vi.fn>){
 vi.stubGlobal('React',React);vi.stubGlobal('fetch',fetcher)
 const confirmed=vi.fn(async()=>{}),refresh=vi.fn(async()=>{})
 const button=findAnswer(QuestionFlow({initialQuestions:[question],guided:true,onGuidedAnswer:confirmed,onGuidedRefresh:refresh}))
 expect(button).toBeTypeOf('function');await button!()
 return{confirmed,refresh}
}
describe('guided answer recovery never resends an uncertain write',()=>{
 it.each(['TimeoutError','TypeError','SyntaxError'])('delegates %s recovery to the authoritative work projection',async name=>{
  const error=new Error('Response unavailable');error.name=name
  const fetcher=vi.fn().mockRejectedValue(error),result=await answer(fetcher)
  expect(result.refresh).toHaveBeenCalledOnce();expect(result.confirmed).not.toHaveBeenCalled()
  expect(fetcher).toHaveBeenCalledOnce()
  expect(fetcher.mock.calls[0][1].headers['if-match']).toBe(question.version)
 })
 it('uses parent projection recovery for a stale version, without rebuilding a child queue',async()=>{
  const fetcher=vi.fn().mockResolvedValue({ok:false,status:409,json:async()=>({error:'Stale version'})})
  const result=await answer(fetcher)
  expect(result.refresh).toHaveBeenCalledOnce();expect(result.confirmed).not.toHaveBeenCalled();expect(fetcher).toHaveBeenCalledOnce()
 })
 it('counts only a confirmed response as an answer',async()=>{
  const fetcher=vi.fn().mockResolvedValue({ok:true,status:200,json:async()=>({ok:true})})
  const result=await answer(fetcher)
  expect(result.confirmed).toHaveBeenCalledWith(false,undefined,undefined);expect(result.refresh).not.toHaveBeenCalled();expect(fetcher).toHaveBeenCalledOnce()
 })
})

it('uses the server-confirmed continuation without another answer or queue request',async()=>{
 const work={businessId:'owned-business',nextAction:{id:'independent-ready-action'}}
 const fetcher=vi.fn().mockResolvedValue({ok:true,status:200,json:async()=>({ok:true,work})})
 const result=await answer(fetcher)
 expect(fetcher).toHaveBeenCalledOnce()
 expect(fetcher.mock.calls[0][1].headers['x-betti-guided']).toBe('1')
 expect(result.confirmed).toHaveBeenCalledWith(false,undefined,work)
 expect(result.refresh).not.toHaveBeenCalled()
})

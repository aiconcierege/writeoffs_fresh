import {it,expect} from 'vitest'
import {actionPresentation} from '../../app/lib/bookkeeping/action-presentation'
import {homeWorkFixture} from '../fixtures/home-command'

it('retains the exact visible eligible action even when canonical priority changes',()=>{
 const work=homeWorkFixture('concurrent'),first=work.nextAction!
 work.nextAction=work.customer.actionable.find(a=>a.id!==first.id)!
 expect(actionPresentation(work,first)).toEqual({status:'retained',action:first})
})
it('does not infer resolution from a dirty index',()=>{
 const work=homeWorkFixture('processing')
 const indexed={...work,index:{version:1 as const,revision:2,publishedRevision:1,summaryCurrent:false,summaryAsOf:work.asOf,state:'queued' as const}}
 expect(actionPresentation(indexed,{id:'old',version:'1'}).status).toBe('settling')
})
it('waits for pending evidence rather than briefly rendering a replacement',()=>{
 const work=homeWorkFixture('processing')
 expect(actionPresentation(work,{id:'old',version:'1'}).status).toBe('settling')
})
it('reports a changed version explicitly, never silently substituting it',()=>{
 const work=homeWorkFixture('concurrent'),first=work.nextAction!
 expect(actionPresentation(work,{id:first.id,version:'previous'})).toEqual({status:'updated',action:first})
})
it('only reports resolution after a settled canonical read',()=>{
 expect(actionPresentation(homeWorkFixture('organized'),{id:'old',version:'1'})).toEqual({status:'resolved',action:null})
})

it('does not claim a missing batch or superseded question was resolved when ready work remains',()=>{
 const work=homeWorkFixture('concurrent')
 expect(actionPresentation(work,{id:'guided:receipt_upload_sweep:previous-membership',version:'old'})).toEqual({status:'updated',action:work.nextAction})
})

it('continues with a proven independent action while an affected visible item is being checked',()=>{
 const work=homeWorkFixture('concurrent')
 const indexed={...work,index:{version:1 as const,revision:2,publishedRevision:1,summaryCurrent:false,summaryAsOf:work.asOf,state:'queued' as const}}
 expect(actionPresentation(indexed,{id:'invalidated-affected-action',version:'old'})).toEqual({status:'rechecking',action:work.nextAction})
 expect(work.customer.actionableCount).toBe(2)
})

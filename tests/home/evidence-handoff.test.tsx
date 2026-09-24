import React from 'react'
import {createRequire} from 'node:module'
import {describe,it,expect,vi} from 'vitest'
import {HomeEvidenceOpportunity} from '../../app/home/HomeEvidenceOpportunity'
import {homeCommand} from '../../app/lib/home/command-center'
import {homeWorkFixture} from '../fixtures/home-command'
import {projectSourceCoverage,type CoverageInput} from '../../app/lib/bookkeeping/source-coverage'
import type {WorkAction} from '../../app/lib/bookkeeping/betti-work'
const {renderToStaticMarkup}=createRequire(import.meta.url)('react-dom/server') as {renderToStaticMarkup:(node:React.ReactNode)=>string}
vi.mock('next/navigation',()=>({useRouter:()=>({refresh:vi.fn()})}))
vi.mock('../../app/documents/DocumentIntake',()=>({DocumentIntake:({buttonLabel}:{buttonLabel:string})=><button>{buttonLabel}</button>}))
const action={id:'evidence:account:2026-05',version:'v1',type:'evidence_opportunity',workstream:'catch_up',items:[{recordId:'printing',date:'2026-05-09'}],account:{name:'Synthetic checking',mask:'0000'}} as WorkAction
const account:CoverageInput['accounts'][number]={id:'account',name:'Synthetic checking',mask:'0000',provider:null,connected:false,bankFrom:null,bankThrough:null,quarantined:0,statements:[{from:'2026-05-01',through:'2026-05-31',validated:true}]}
const coverage=(a=account,start='2026-01-01')=>projectSourceCoverage({authorizedStart:start,requestedStart:start,through:'2026-09-24',accounts:[a]})
const view=(c=coverage())=>renderToStaticMarkup(<HomeEvidenceOpportunity action={action} coverage={c}/> )
describe('Home evidence handoff',()=>{
 it('directly offers all three receipt choices without linking through a generic utility',()=>{
  const html=view()
  for(const label of ['Send receipts','I don’t have any','I’ll do this later','May 2026'])expect(html).toContain(label)
  expect(html).not.toContain('What was this purchase for?')
  expect(html).not.toContain('Review with Betti')
 })
 it('offers missing statements without gating the available month’s receipts',()=>{
  const html=view()
  expect(html).toContain('Send statements')
  expect(html).toContain('Jan 1, 2026 – Apr 30, 2026')
  expect(html).toContain('Jun 1, 2026 – Sep 24, 2026')
  expect(html).toContain('or we can keep working on the months I already have')
  expect(html).not.toContain('disabled')
 })
 it.each(['statements','connected'] as const)('does not invent a missing-statement step when %s cover the period',source=>{
  const a=source==='connected'?{...account,provider:'plaid',connected:true,bankFrom:'2026-01-01',bankThrough:'2026-09-24'}:{...account,statements:[{from:'2026-01-01',through:'2026-09-24',validated:true}]}
  const html=view(coverage(a));expect(html).not.toContain('Send statements');expect(html).toContain('Send receipts')
 })
 it('does not ask a current-only customer for unauthorized older periods',()=>{
  const html=view(coverage({...account,statements:[]},'2026-08-01'))
  expect(html).toContain('Aug 1, 2026 – Sep 24, 2026');expect(html).not.toContain('Jan 1')
 })
 it('hands queued processing to the next persisted evidence opportunity without a customer action',()=>{
  const queued=homeWorkFixture('waiting')
  expect(homeCommand(queued,null).supporting).toContain('Your totals may change')
  const ready={...queued,nextAction:action}
  expect(homeCommand(ready,null).heading).toBe('Before I ask you anything, do you have receipts?')
  expect(homeCommand(ready,null).action?.label).toBe('Send receipts')
 })
})

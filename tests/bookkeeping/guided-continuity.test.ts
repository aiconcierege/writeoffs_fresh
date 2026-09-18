import * as React from 'react'
import {createRequire} from 'node:module'
import {describe,it,expect,vi} from 'vitest'
import {GuidedWork} from '../../app/components/guided/GuidedWork'
import {homeWorkFixture} from '../fixtures/home-command'
const {renderToStaticMarkup}=createRequire(import.meta.url)('react-dom/server') as {renderToStaticMarkup:(node:React.ReactNode)=>string}
vi.stubGlobal('React',React)
vi.mock('../../app/questions/QuestionFlow',()=>({QuestionFlow:()=>React.createElement('h1',null,'Next material question')}))
vi.mock('../../app/documents/DocumentIntake',()=>({DocumentIntake:()=>null}))
vi.mock('next/navigation',()=>({useRouter:()=>({refresh:vi.fn()})}))
const render=(work:ReturnType<typeof homeWorkFixture>,recordId='finished-loan')=>renderToStaticMarkup(React.createElement(GuidedWork,{initialWork:work,recordId}))
describe('guided conversation follows canonical ready work across entry boundaries',()=>{
 it.each(['catch-up','current','concurrent'] as const)('continues %s work after the entry transaction is finished or deferred',state=>{
  const work=homeWorkFixture(state);work.customer.deferredCount=1
  const html=render(work)
  expect(html).toContain('Next material question')
  expect(html).not.toContain('You’re all set for now')
  expect(html).toContain(`data-customer-action-count="${work.customer.actionableCount}"`)
 })
 it('does not replace canonical priority with an entry-record filter',()=>{
  const work=homeWorkFixture('concurrent')
  expect(render(work,'record-not-in-projection')).toContain('Next material question')
 })
 it('stops truthfully only when all remaining customer work is deferred',()=>{
  const html=render(homeWorkFixture('deferred'))
  expect(html).toContain('I’ve saved the things you want to come back to.')
  expect(html).not.toContain('Next material question')
 })
 it('does not describe a system hold as deferred-only completion',()=>{
  const work=homeWorkFixture('held');work.customer.deferredCount=1
  const html=render(work)
  expect(html).toContain('Your records are safe.')
  expect(html).not.toContain('You’re all set for now')
 })
 it('reports real processing without claiming deferred work is the only remaining work',()=>{
  const work=homeWorkFixture('processing');work.customer.deferredCount=1
  const html=render(work)
  expect(html).toContain('I’m updating your books.')
  expect(html).not.toContain('You’re all set for now')
 })
})

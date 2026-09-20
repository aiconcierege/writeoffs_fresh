import {describe,it,expect} from 'vitest'
import {conversationStatus,savedAcknowledgment} from '../../app/components/guided/conversation-status'
import type {GuidedWorkProjection} from '../../app/lib/bookkeeping/guided-work-projection'
import {homeWorkFixture} from '../fixtures/home-command'

describe('guided deferral and processing language',()=>{
 it('acknowledges receipt Later without claiming an answer or unavailable receipts',()=>{
  expect(savedAcknowledgment('receipts-deferred')).toBe('No problem. I saved those receipts for later.')
  const work:GuidedWorkProjection=homeWorkFixture('deferred')
  const before=structuredClone(work)
  const result=conversationStatus(work,'receipts-deferred')
  expect(result.heading).toBe('You’re all set for now.')
  expect(result.supporting).toContain('send those receipts whenever you’re ready')
  expect(result.waiting).toBe(false)
  expect(work).toEqual(before)
 })
 it('does not turn unrelated queued work into a receipt deferral updating screen',()=>{
  const work:GuidedWorkProjection=homeWorkFixture('waiting');work.customer.deferredCount=1
  const result=conversationStatus(work,'receipts-deferred')
  expect(result.heading).toBe('You’re all set for now.')
  expect(result.waiting).toBe(true) // polling still resumes any newly ready work
 })
 it('does not hide a genuine processing failure behind successful deferral',()=>{
  const work:GuidedWorkProjection=homeWorkFixture('recovery');work.customer.deferredCount=1
  const result=conversationStatus(work,'receipts-deferred')
  expect(result.heading).toBe('You’re all set for now.')
  expect(result.operationalNote).toContain('couldn’t finish processing')
 })
 it('distinguishes an answer from first-entry processing and queued work',()=>{
  expect(conversationStatus(homeWorkFixture('processing'),'answered').heading).toBe('Got it. I’m updating your books.')
  expect(conversationStatus(homeWorkFixture('processing'),null).heading).toBe('I’m working on your books.')
  expect(conversationStatus(homeWorkFixture('waiting'),null).heading).toBe('I have more to review.')
 })
 it('does not keep the deferral acknowledgment as the completion message after a subsequent answer',()=>{
  const work:GuidedWorkProjection=homeWorkFixture('processing');work.customer.deferredCount=1
  expect(conversationStatus(work,'answered').heading).toBe('Got it. I’m updating your books.')
 })
 it('does not label unresolved system-held records as a failed import',()=>{
  const work=homeWorkFixture('held');work.customer.deferredCount=1
  const result=conversationStatus(work,'receipts-deferred')
  expect(result.operationalNote).toBeUndefined()
  expect(result.heading).toBe('You’re all set for now.')
 })
 it('preserves supported coverage and out-of-scope messages',()=>{
  const organized=homeWorkFixture('organized')
  const work={...organized,readiness:{...organized.readiness,booksCurrentThrough:'2026-09-18'}} as unknown as GuidedWorkProjection
  expect(conversationStatus(work,null).heading).toContain('September 18, 2026')
  work.readiness.phase='outside_scope'
  expect(conversationStatus(work,null).heading).toBe('These records are from before your books begin.')
 })
})

import { describe, expect, it } from 'vitest'
import { activityWorkstream, projectBettiWork, sourceCoverageGaps, type WorkContext, type WorkRecord } from '../../app/lib/bookkeeping/betti-work'
import {homeCommand} from '../../app/lib/home/command-center'
import type { CustomerQuestion } from '../../app/lib/bookkeeping/customer-questions'

const now = '2026-09-17T12:00:00Z'
function context(): WorkContext {
  return { business: { id: 'a', start: '2026-01-01', activation: '2026-09-01', activationEvidence: '2026-09-01T12:00:00Z',
    timezone: 'America/Phoenix', coverageStart: '2026-01-01', authorizedScope: { businessId: 'a', selectedStart: '2026-01-01', authorizedStart: '2026-01-01', includedStart: '2026-08-01', activation: '2026-09-01', historicalAuthorized: true, currentFrom: '2026-09-01', catchUp: {from:'2026-01-01',through:'2026-08-31'} } }, records: [], accounts: [], jobs: [], documents: [], links: [], coverage: [], deferred: [] }
}
function record(id = 'old', date = '2026-05-03'): WorkRecord {
  return { business_id: 'a', record_id: id, activity_date: date, account_id: 'account', decision_id: 'decision-' + id,
    treatment: 'unresolved', bookkeeping_nature: 'expense', amount_cents: -2299, source_kind: 'financial_transaction',
    has_receipt: false, receipt_unavailable: false, allocations: [] }
}
function question(r: WorkRecord): CustomerQuestion {
  return { id: 'q-' + r.record_id, version: 'v1', source: 'bookkeeping', kind: 'business_use', recordId: r.record_id,
    prompt: 'Was this for your business?', openedAt: now, contextFingerprint: 'evidence1',
    transaction: { merchant: 'Example', amountCents: r.amount_cents, currency: 'USD', date: r.activity_date } }
}
function job(recordId: string | null = 'old') {
  return { business_id: 'a', id: 'job', record_id: recordId, document_id: recordId ? null : 'document', receipt_id: null,
    state: 'processing', kind: recordId ? 'bookkeeping' : 'document', available_at: now,
    lease_expires_at: '2026-09-17T12:05:00Z', updated_at: now }
}
function organized(r: WorkRecord) {
  r.treatment = 'business'; r.allocations = [{ kind: 'business', amountCents: r.amount_cents, category: 'software' }]
  return r
}
function project(c: WorkContext, questions: CustomerQuestion[] = []) {
  return projectBettiWork({ businessId: 'a', context: c, questions, asOf: now })
}
describe('read-only Betti work projection', () => {
  it('1: new customer needs records; empty is not caught up', () => {
    const p = project(context())
    expect(p.nextAction?.type).toBe('provide_records')
    expect(p.readiness.booksCurrentThrough).toBeNull()
    expect(p.readiness.catchUp).toBe('coverage_unconfirmed')
  })
  it('2: catch-up processing creates no customer task', () => {
    const c = context(); c.records = [record()]; c.jobs = [job()]
    const p = project(c)
    expect(p.betti.genuinelyProcessing).toBe(1)
    expect(p.customer.actionableCount).toBe(0)
    expect(p.progress.catchUp.processing).toBe(1)
  })
  it.each([['3: catch-up', '2026-05-03', 'catch_up'], ['4: current', '2026-09-01', 'current']])('%s question', (_, date, stream) => {
    const c = context(); c.records = [record('r', date)]
    expect(project(c, [question(c.records[0])]).nextAction?.workstream).toBe(stream)
  })
  it('5: concurrent streams share one ledger and favor useful current action, not quotas', () => {
    const c = context(); c.records = [record(), record('new', '2026-09-15')]
    const p = project(c, c.records.map(question))
    expect(p.customer.actionableCount).toBe(2)
    expect(p.nextAction?.workstream).toBe('current')
    expect(p.nextAction?.priority.reasons).toContain('keep_current_fresh')
  })
  it('6: account prerequisite is one shared action, not two stream tasks', () => {
    const c = context(); c.records = [record(), record('new', '2026-09-15')]
    c.accounts = [{ business_id: 'a', id: 'account', designation: null, use_version: null }]
    const p = project(c, c.records.map(question))
    expect(p.customer.actionableCount).toBe(1)
    expect(p.customer.sharedCount).toBe(1)
    expect(p.nextAction?.affects).toEqual(['catch_up', 'current'])
    expect(p.nextAction?.priority.unlocks).toBe(2)
  })
  it('7: a slow catch-up document cannot block unrelated current work', () => {
    const c = context(); c.records = [record(), record('new', '2026-09-15')]; c.jobs = [job()]
    const p = project(c, c.records.map(question))
    expect(p.customer.actionableCount).toBe(1)
    expect(p.betti.waiting).toHaveLength(1)
    expect(p.nextAction?.recordIds).toEqual(['new'])
  })
  it('8: deferred catch-up stays distinct from actionable current', () => {
    const c = context(); c.records = [record(), record('new', '2026-09-15')]
    c.deferred = [{ business_id: 'a', id: 'skip', issue_id: 'q-old', record_id: 'old', deferred_until: '2026-10-01', created_at: now }]
    const p = project(c, [question(c.records[1])])
    expect(p.customer.deferredCount).toBe(1)
    expect(p.customer.actionableCount).toBe(1)
    expect(p.nextAction?.workstream).toBe('current')
  })
  it('9: missing/unavailable receipt does not unorganize supported working expense', () => {
    const c = context(); c.records = [organized(record())]; c.records[0].receipt_unavailable = true
    const p = project(c)
    expect(p.progress.catchUp.organized).toBe(1)
    expect(p.progress.catchUp.documentationLimitations).toBe(1)
    expect(p.betti.systemHeld).toHaveLength(0)
    expect(p.customer.actionableCount).toBe(0)
    expect(c.records[0].allocations[0].amountCents).toBe(-2299)
  })
  it('10: late uploads classify by activity date, without copying records', () => {
    const c = context(); c.records = [record()]
    c.documents = [{ business_id: 'a', id: 'd', receipt_id: null, created_at: now }]
    expect(project(c).progress.catchUp.activity).toBe(1)
    expect(project(c).progress.current.activity).toBe(0)
  })
  it('11: new current work coexists with incomplete catch-up and never ages into it', () => {
    const c = context(); c.records = [record(), record('new', '2026-09-15')]
    const p = projectBettiWork({ businessId: 'a', context: c, questions: c.records.map(question), asOf: '2027-01-01T00:00:00Z' })
    expect(p.progress.current.activity).toBe(1)
    expect(p.progress.catchUp.activity).toBe(1)
  })
  it('12: no customer actions can coexist with real document processing', () => {
    const c = context(); c.jobs = [job(null)]
    const p = project(c)
    expect(p.readiness.doneForNow).toBe(false)
    expect(p.betti.genuinelyProcessing).toBe(1)
    expect(p.betti.jobs[0].workstream).toBe('unscoped')
  })
  it('13: unresolved with no question/job is a hold, not processing or a customer task', () => {
    const c = context(); c.records = [record()]
    const p = project(c)
    expect(p.betti.genuinelyProcessing).toBe(0)
    expect(p.betti.systemHeld).toHaveLength(1)
    expect(p.customer.actionableCount).toBe(0)
  })
  it('14: expired lease and terminal failure are not described as active processing', () => {
    const c = context(); c.jobs = [{ ...job(), lease_expires_at: '2026-09-16T00:00:00Z' }, { ...job(null), id: 'failed', state: 'dead_letter' }]
    const p = project(c)
    expect(p.betti.genuinelyProcessing).toBe(0)
    expect(p.betti.failures.map(j => j.status)).toEqual(['stale_lease', 'failed_recoverable'])
  })
  it('15: organized within known coverage does not invent whole-business current-through', () => {
    const c = context(); c.records = [organized(record('new', '2026-09-15'))]
    c.coverage = [{ business_id: 'a', id: 'period', account_id: 'account', document_id: 'document', period_start: '2026-09-01',
      period_end: '2026-09-16', validation_status: 'validated', ambiguous_row_count: 0 }]
    const p = project(c)
    expect(p.progress.current.organized).toBe(1)
    expect(p.scope.knownSourceCoverage[0].through).toBe('2026-09-16')
    expect(p.readiness.doneForNow).toBe(true)
    expect(p.readiness.booksCurrentThrough).toBeNull()
  })
  it('16: scope expansion includes only newly in-scope work, preserving established decisions', () => {
    const c = context(); c.business.start = c.business.authorizedScope.authorizedStart = '2026-05-01'
    c.records = [organized(record()), record('earlier', '2026-02-01')]
    const before = project(c, [question(c.records[1])])
    c.business.start = c.business.authorizedScope.authorizedStart = '2026-01-01'
    const after = project(c, [question(c.records[1])])
    expect(before.customer.actionableCount).toBe(0)
    expect(after.customer.actionableCount).toBe(1)
    expect(after.progress.catchUp.organized).toBe(1)
    expect(after.scopeVersion).not.toBe(before.scopeVersion)
    expect(after.readiness.catchUpReviewedThrough).toBeNull()
  })
  it('17: fails closed on another tenant in any source collection', () => {
    for (const key of ['records', 'accounts', 'jobs', 'documents', 'links', 'coverage', 'deferred'] as const) {
      const c = context(); (c[key] as { business_id: string }[]).push({ business_id: 'b' })
      expect(() => project(c)).toThrow('tenant mismatch')
    }
    const c = context(); c.business.id = 'b'; expect(() => project(c)).toThrow('business mismatch')
    expect(() => project(context(), [question(record('foreign'))])).toThrow('Question record unavailable')
  })
  it('18: version identity stable across reads but changes with canonical evidence', () => {
    const c = context(); c.records = [record()]; const q = question(c.records[0])
    const before = project(c, [q]).nextAction!
    expect(project(c, [q]).nextAction?.version).toBe(before.version)
    q.contextFingerprint = 'new-evidence'
    expect(project(c, [q]).nextAction?.version).not.toBe(before.version)
    expect(project(c, [q]).nextAction?.id).toBe(before.id)
    const evidenceVersion = project(c, [q]).nextAction?.version
    c.links = [{ business_id: 'a', record_id: 'old', receipt_id: 'receipt', extraction_version: 'extraction-v2' }]
    expect(project(c, [q]).nextAction?.version).not.toBe(evidenceVersion)
  })
  it('does not mutate its inputs; multiple category allocations remain intact', () => {
    const c = context(); c.records = [organized(record())]
    c.records[0].allocations = [{ kind: 'business', amountCents: -1000, category: 'software' }, { kind: 'business', amountCents: -1299, category: 'supplies' }]
    const saved = JSON.stringify(c); project(c); expect(JSON.stringify(c)).toBe(saved)
    expect(project(c).progress.catchUp.organized).toBe(1)
  })
  it('unknown activation and pre-start records do not invent stream membership', () => {
    const c = context(); expect(activityWorkstream('2025-12-31', c.business)).toBe('outside_scope')
    c.business.activation = null; c.business.authorizedScope.activation = null; c.business.authorizedScope.catchUp = null; c.business.authorizedScope.currentFrom = null; expect(activityWorkstream('2026-05-01', c.business)).toBe('unscoped')
  })
  it('account leverage and age can outweigh current preference', () => {
    const c = context(); c.records = [record(), record('new', '2026-09-15')]
    const qs = c.records.map(question); qs[0].openedAt = '2026-01-01T00:00:00Z'
    expect(project(c, qs).nextAction?.workstream).toBe('catch_up')
  })
  it('coverage exposes gaps, including between uploaded periods', () => {
    expect(sourceCoverageGaps('2026-01-01', '2026-09-17', [
      { from: '2026-05-01', through: '2026-05-31', validated: true },
      { from: '2026-07-01', through: '2026-08-31', validated: true },
    ])).toEqual([{ from: '2026-01-01', through: '2026-04-30' },
      { from: '2026-06-01', through: '2026-06-30' }, { from: '2026-09-01', through: '2026-09-17' }])
  })
  it('can certify organized activity through a date within known accounts only', () => {
    const c = context(); c.business.start = c.business.authorizedScope.authorizedStart = '2026-09-01'
    c.accounts = [{ business_id: 'a', id: 'account', use_version: 'use', designation: 'business_only' }]
    c.records = [organized(record('new', '2026-09-15'))]
    c.coverage = [{ business_id: 'a', id: 'p', account_id: 'account', document_id: 'd', period_start: '2026-09-01',
      period_end: '2026-09-16', validation_status: 'validated', ambiguous_row_count: 0 }]
    expect(project(c).readiness.knownAccountsOrganizedThrough).toBe('2026-09-16')
    expect(project(c).readiness.booksCurrentThrough).toBeNull()
  })
  it('actual retry/paused/orphan states do not claim active processing', () => {
    const c = context(); c.jobs = [{ ...job(null), state: 'retryable' }]
    c.documents = [{ business_id: 'a', id: 'orphan', receipt_id: null, created_at: now, has_job: false }]
    const p = projectBettiWork({ businessId: 'a', context: c, questions: [], asOf: now, processingEnabled: false })
    expect(p.betti.genuinelyProcessing).toBe(0)
    expect(p.betti.jobs[0].status).toBe('paused')
    expect(p.betti.missingJobs).toHaveLength(1)
  })
  it('answered questions never reappear merely because projection is read again', () => {
    const c = context(); c.records = [record()]
    const q = question(c.records[0]); expect(project(c, [q]).customer.actionableCount).toBe(1)
    expect(project(c, []).customer.actionableCount).toBe(0)
    c.records[0] = organized(c.records[0])
    expect(project(c, []).customer.actionableCount).toBe(0)
  })
  it('no catch-up authorization: older evidence, jobs and questions stay outside active books',()=>{
    const c=context();c.business.authorizedScope={businessId:'a',selectedStart:'2026-08-01',authorizedStart:'2026-08-01',includedStart:'2026-08-01',activation:'2026-09-17',historicalAuthorized:false,currentFrom:'2026-08-01',catchUp:null}
    c.records=[record()];c.jobs=[job()];c.accounts=[{business_id:'a',id:'account',designation:null,use_version:null}]
    const p=project(c,c.records.map(question))
    expect(p.scope.catchUp).toBeNull();expect(p.progress.catchUp.activity).toBe(0)
    expect(p.progress.outsideScopeActivity).toBe(1);expect(p.customer.actionableCount).toBe(0)
    expect(p.betti.jobs).toHaveLength(0);expect(p.readiness.phase).toBe('outside_scope')
    expect(homeCommand(p,'statement_uploads').heading).toContain('before your books begin')
  })
  it('mixed-date source is partitioned per activity; August is Current without purchased Catch-up',()=>{
    const c=context();c.business.authorizedScope={businessId:'a',selectedStart:'2026-08-01',authorizedStart:'2026-08-01',includedStart:'2026-08-01',activation:'2026-09-17',historicalAuthorized:false,currentFrom:'2026-08-01',catchUp:null}
    c.records=[record('july','2026-07-31'),record('august','2026-08-01')]
    const p=project(c,c.records.map(question));expect(p.customer.actionableCount).toBe(1)
    expect(p.nextAction?.recordIds).toEqual(['august']);expect(p.nextAction?.workstream).toBe('current')
    expect(p.progress.catchUp.activity).toBe(0)
  })
  it('account prerequisite consumes all related questions once and saved evidence removes it',()=>{
    const c=context();c.records=[record(),record('recent','2026-09-15')];c.accounts=[{business_id:'a',id:'account',designation:null,use_version:null}]
    const qs=c.records.map(r=>({...question(r),kind:'factual_choice' as const}))
    const before=project(c,qs);expect(before.customer.actionableCount).toBe(1)
    c.accounts[0].designation='business_only';c.accounts[0].use_version='saved-event';c.records=c.records.map(organized)
    const after=project(c);expect(after.customer.actionableCount).toBe(0)
    expect(after.progress.catchUp.organized).toBe(1);expect(after.progress.current.organized).toBe(1)
  })
  it('received and unassessed cannot be projected as settled',()=>{
    const c=context();c.records=[record()];c.jobs=[{...job(),state:'pending'}]
    const p=project(c);expect(p.readiness.doneForNow).toBe(false);expect(p.readiness.phase).toBe('received')
    expect(homeCommand(p,'statement_uploads').supporting).not.toContain('done for now')
  })

})

describe('guided work from the same canonical projection',()=>{
 function guided(designation='business_only'){
  const c=context();c.accounts=[{business_id:'a',id:'account',use_version:'use1',designation,display_name:'Checking'}]
  c.records=[{...organized(record()),merchant:'Software service',transaction_id:'financial1',review_version:'evidence1',customer_authored:false}]
  c.guidedReviews=[];return c
 }
 function reviewed(c:WorkContext,action:'personal_exception_sweep'|'mixed_use_sweep'|'receipt_upload_sweep'){
  c.guidedReviews!.push({business_id:'a',id:action,action,disposition:'completed',created_at:now,deferred_until:null,items:c.records.map(r=>({recordId:r.record_id,accountUseVersion:'use1'}))})
 }
 it('replaces repeated questions with one visible business-only exception group',()=>{
  const c=guided();const p=project(c,[question(c.records[0])])
  expect(p.customer.actionableCount).toBe(1);expect(p.nextAction?.type).toBe('personal_exception_sweep')
  expect(p.nextAction?.items?.[0].merchant).toBe('Software service');expect(p.nextAction?.question).toBeUndefined()
 })
 it('advances personal then mixed exceptions then receipts without inventing decisions',()=>{
  const c=guided(),original=JSON.stringify(c.records)
  reviewed(c,'personal_exception_sweep');expect(project(c).nextAction?.type).toBe('mixed_use_sweep')
  reviewed(c,'mixed_use_sweep');expect(project(c).nextAction?.type).toBe('receipt_upload_sweep')
  reviewed(c,'receipt_upload_sweep');expect(project(c).nextAction?.type).toBe('receipt_availability')
  expect(JSON.stringify(c.records)).toBe(original)
 })
 it('does not re-review customer-authored facts',()=>{
  const c=guided();c.records[0].customer_authored=true;c.records[0].has_receipt=true
  expect(project(c).customer.actionableCount).toBe(0)
 })
 it('groups unresolved mixed-account purchases without establishing business use',()=>{
  const c=guided('business_and_personal');c.records[0].treatment='unresolved';c.records[0].allocations=[]
  const p=project(c,[question(c.records[0])]);expect(p.nextAction?.type).toBe('mixed_use_sweep')
  expect(p.progress.catchUp.organized).toBe(0);expect(c.records[0].treatment).toBe('unresolved')
 })
 it('never puts transfers, loans, incoming funds or personal records in purchase sweeps',()=>{
  for(const [nature,amount,treatment] of [['transfer',-100,'unresolved'],['loan_principal_payment',-100,'unresolved'],['expense',100,'business'],['expense',-100,'personal']] as const){
   const c=guided();Object.assign(c.records[0],{bookkeeping_nature:nature,amount_cents:amount,treatment})
   expect(project(c).customer.actionable.every(a=>a.type==='special_transaction')).toBe(true)
   expect(project(c).customer.actionableCount).toBe(nature==='loan_principal_payment'?1:0)
  }
 })
 it('excludes old evidence outside authorized scope even with prior review events',()=>{
  const c=guided();c.business.authorizedScope.authorizedStart='2026-08-01';c.business.authorizedScope.catchUp=null;c.business.authorizedScope.historicalAuthorized=false
  expect(project(c).customer.actionableCount).toBe(0);expect(project(c).readiness.catchUp).toBe('not_requested')
 })
 it('bounds each visible group and does not include future/unseen purchases in its snapshot',()=>{
  const c=guided();c.records=Array.from({length:10},(_,i)=>({...c.records[0],record_id:`r${i}`,decision_id:`d${i}`}))
  const p=project(c);expect(p.customer.actionableCount).toBe(2);expect(p.customer.actionable.map(a=>a.items!.length).sort()).toEqual([2,8])
  const first=p.nextAction!;c.records.push({...c.records[0],record_id:'later'})
  expect(first.items).toHaveLength(first.recordIds.length);expect(first.recordIds).not.toContain('later')
 })
 it('a processing record waits without blocking another ready purchase in the same account',()=>{
  const c=guided();c.records.push({...c.records[0],record_id:'ready'});c.jobs=[job()]
  const p=project(c);expect(p.nextAction?.recordIds).toEqual(['ready']);expect(p.betti.waiting[0].recordIds).toEqual(['old'])
 })
 it('waits for unmatched document processing before receipt-unavailable confirmation',()=>{
  const c=guided();reviewed(c,'personal_exception_sweep');reviewed(c,'mixed_use_sweep');reviewed(c,'receipt_upload_sweep');c.jobs=[job(null)]
  const p=project(c);expect(p.customer.actionableCount).toBe(0);expect(p.betti.waiting[0].type).toBe('receipt_availability');expect(p.readiness.doneForNow).toBe(false)
 })
 it('receipt Later preserves the opportunity and working amount without asserting unavailable',()=>{
  const c=guided();reviewed(c,'personal_exception_sweep');reviewed(c,'mixed_use_sweep')
  const original=JSON.stringify(c.records)
  c.guidedReviews!.push({business_id:'a',id:'later',action:'receipt_upload_sweep',disposition:'deferred',created_at:now,deferred_until:'2026-09-18T12:00:00Z',items:[{recordId:'old',accountUseVersion:'use1'}]})
  const p=project(c);expect(p.customer.actionableCount).toBe(0);expect(p.customer.deferredCount).toBe(1)
  expect(JSON.stringify(c.records)).toBe(original);expect(c.records[0].receipt_unavailable).toBeFalsy()
  expect(projectBettiWork({businessId:'a',context:c,questions:[],asOf:'2026-09-19T12:00:00Z'}).nextAction?.type).toBe('receipt_upload_sweep')
 })
 it('receipt availability Later is not a completed assertion; new purchases are outside its snapshot',()=>{
  const c=guided();reviewed(c,'personal_exception_sweep');reviewed(c,'mixed_use_sweep');reviewed(c,'receipt_upload_sweep')
  c.guidedReviews!.push({business_id:'a',id:'later',action:'receipt_availability',disposition:'deferred',created_at:now,deferred_until:'2026-09-18T12:00:00Z',items:[{recordId:'old',accountUseVersion:'use1'}]})
  c.records.push({...c.records[0],record_id:'new',transaction_id:'new-source',activity_date:'2026-09-16'})
  const p=project(c);expect(p.customer.deferredCount).toBe(1);expect(p.customer.actionableCount).toBe(1)
  expect(p.nextAction?.recordIds).toEqual(['new']);expect(c.records.every(r=>!r.receipt_unavailable)).toBe(true)
 })
 it('keeps deferred review distinct from completed assertions',()=>{
  const c=guided();c.guidedReviews=[{business_id:'a',id:'defer',action:'personal_exception_sweep',disposition:'deferred',created_at:now,deferred_until:'2026-09-18T12:00:00Z',items:[{recordId:'old',accountUseVersion:'use1'}]}]
  const p=project(c);expect(p.customer.actionableCount).toBe(0);expect(p.customer.deferredCount).toBe(1)
 })
 it('invalidates snapshot identity on evidence changes and rejects foreign review facts',()=>{
  const c=guided(),before=project(c).nextAction!.version;c.records[0].review_version='evidence2'
  expect(project(c).nextAction!.version).not.toBe(before)
  reviewed(c,'personal_exception_sweep');c.guidedReviews![0].business_id='foreign';expect(()=>project(c)).toThrow('tenant')
 })
 it('preserves multiple established categories rather than flattening a split in a sweep',()=>{
  const c=guided();c.records[0].allocations=[{kind:'business',amountCents:-1000,category:'supplies'},{kind:'business',amountCents:-1299,category:'software'}];c.records[0].has_receipt=true
  expect(project(c).customer.actionableCount).toBe(0);expect(c.records[0].allocations).toHaveLength(2)
 })
 it('does not turn a failed upload into a receipt-unavailable assertion or active processing',()=>{
  const c=guided();reviewed(c,'personal_exception_sweep');reviewed(c,'mixed_use_sweep');reviewed(c,'receipt_upload_sweep');c.jobs=[{...job(null),state:'dead_letter'}]
  const p=project(c);expect(p.nextAction?.type).toBe('recover_ingestion');expect(p.betti.genuinelyProcessing).toBe(0);expect(p.betti.waiting[0].type).toBe('receipt_availability')
 })
 it('preserves an existing canonical deferral when presenting the new guided workflow',()=>{
  const c=guided();c.deferred=[{business_id:'a',id:'skip',issue_id:'q-old',record_id:'old',created_at:now,deferred_until:'2026-09-19T00:00:00Z'}]
  const p=project(c);expect(p.customer.actionableCount).toBe(0);expect(p.customer.deferredCount).toBe(1)
 })
 it('does not ask again for an established mixed allocation',()=>{
  const c=guided();c.records[0].treatment='mixed_use';c.records[0].has_receipt=true
  c.records[0].allocations=[{kind:'business',amountCents:-1000,category:'software'},{kind:'personal',amountCents:-1299,category:null}]
  expect(project(c).customer.actionableCount).toBe(0)
 })

})

describe('existing special evidence workflows are not limited to question rows',()=>{
 function special(nature='loan_principal_payment') {const c=context();c.records=[{...record(),bookkeeping_nature:nature,merchant:'Existing payment'}];return c}
 it.each(['loan_principal_payment','refund'])('projects the existing %s evidence action without inventing a question or treatment',nature=>{
  const c=special(nature),before=JSON.stringify(c),p=project(c)
  expect(p.customer.actionableCount).toBe(1);expect(p.nextAction?.type).toBe('special_transaction');expect(p.nextAction?.question).toBeUndefined()
  expect(p.nextAction?.transaction?.merchant).toBe('Existing payment');expect(p.betti.systemHeld).toHaveLength(0);expect(JSON.stringify(c)).toBe(before)
  expect(project(c,[question(c.records[0])]).customer.actionableCount).toBe(1)
 })
 it('preserves the existing seven-day defer semantics and does not count it as answered',()=>{
  const c=special();c.specialDeferrals=[{business_id:'a',id:'defer',record_id:'old',decision_id:'decision-old',created_at:now}]
  expect(project(c).customer.deferredCount).toBe(1);expect(project(c).customer.actionableCount).toBe(0)
  expect(projectBettiWork({businessId:'a',context:c,questions:[],asOf:'2026-09-25T12:00:00Z'}).customer.actionableCount).toBe(1)
 })
 it('waits on real processing and uses one account prerequisite',()=>{
  const c=special();c.jobs=[job()];expect(project(c).customer.actionableCount).toBe(0);expect(project(c).betti.waiting).toHaveLength(1)
  c.accounts=[{business_id:'a',id:'account',designation:null,use_version:null}]
  expect(project(c).customer.actionableCount).toBe(1);expect(project(c).nextAction?.type).toBe('account_use')
 })
 it('excludes out-of-scope and resolved special activity',()=>{
  const c=special();c.records[0].activity_date='2025-12-01';expect(project(c).customer.actionableCount).toBe(0)
  c.records[0]=record();c.records[0].bookkeeping_nature='credit_card_payment';c.records[0].treatment='excluded'
  expect(project(c).customer.actionableCount).toBe(0)
 })
 it('rejects foreign deferrals and ignores superseded decision deferrals',()=>{
  const c=special();c.specialDeferrals=[{business_id:'foreign',id:'defer',record_id:'old',decision_id:'decision-old',created_at:now}]
  expect(()=>project(c)).toThrow('tenant');c.specialDeferrals[0].business_id='a';c.specialDeferrals[0].decision_id='superseded'
  expect(project(c).customer.actionableCount).toBe(1)
 })
})

it('projects an existing special deferral before payment nature is known',()=>{const c=context();c.records=[record()];c.records[0].bookkeeping_nature=null;c.specialDeferrals=[{business_id:'a',id:'saved',record_id:'old',decision_id:'decision-old',created_at:now}];const p=project(c);expect(p.customer.actionableCount).toBe(0);expect(p.customer.deferredCount).toBe(1);expect(p.betti.systemHeld).toHaveLength(0)})
it('does not bypass an existing special deferral through a purchase sweep',()=>{
 const c=context();c.records=[{...record(),review_version:'review',transaction_id:'tx'}]
 c.accounts=[{business_id:'a',id:'account',designation:'business_only',use_version:'use'}]
 c.specialDeferrals=[{business_id:'a',id:'saved',record_id:'old',decision_id:'decision-old',created_at:now}]
 const p=project(c);expect(p.customer.actionableCount).toBe(0);expect(p.customer.deferredCount).toBe(1)
})


describe('render-ready evidence dependencies',()=>{
 it('holds all material candidates until an unassigned document has been assessed/matched',()=>{
  const c=context();c.records=[record(),record('current','2026-09-15')];c.jobs=[job(null)]
  const p=project(c,c.records.map(question))
  expect(p.nextAction).toBeNull();expect(p.customer.actionableCount).toBe(0)
  expect(p.betti.waiting).toHaveLength(2)
  expect(p.betti.waiting.every(a=>a.dependencies.includes('job'))).toBe(true)
 })
 it('holds received-but-unassessed evidence without claiming a worker is processing',()=>{
  const c=context();c.records=[record()];c.documents=[{business_id:'a',id:'new-doc',receipt_id:null,created_at:now,has_job:false}]
  const p=project(c,c.records.map(question));expect(p.nextAction).toBeNull()
  expect(p.betti.genuinelyProcessing).toBe(0);expect(p.betti.missingJobs).toHaveLength(1)
 })
 it('does not hold a durable account-use fact for document extraction',()=>{
  const c=context();c.records=[record()];c.jobs=[job(null)]
  c.accounts=[{business_id:'a',id:'account',designation:null,use_version:null}]
  expect(project(c,c.records.map(question)).nextAction?.type).toBe('account_use')
 })
 it('releases independent work once the document relationship is known, without any timer',()=>{
  const c=context();c.records=[record(),record('current','2026-09-15')];c.jobs=[job(null)]
  c.documentRecords=[{business_id:'a',document_id:'document',record_id:'old'}]
  const p=project(c,c.records.map(question));expect(p.nextAction?.recordIds).toEqual(['current'])
  expect(p.betti.waiting[0].recordIds).toEqual(['old'])
 })
 it('does not publish an eliminated candidate between extraction and final reassessment',()=>{
  const c=context();c.records=[record()];c.jobs=[job(null)]
  expect(project(c,c.records.map(question)).nextAction).toBeNull()
  c.jobs=[job()];expect(project(c,c.records.map(question)).nextAction).toBeNull()
  c.jobs=[];c.records[0]=organized(c.records[0]);expect(project(c,[]).nextAction).toBeNull()
 })
})

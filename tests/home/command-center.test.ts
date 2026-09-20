import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { homeCommand, unavailableHomeCommand } from '../../app/lib/home/command-center'
import { homeWorkFixture } from '../fixtures/home-command'

describe('Home uses the shared work projection', () => {
  it.each([['statement_uploads', '/import'], ['receipts', '/import'], ['connected_financial_accounts', '/get-started']])('respects %s as the initial preference, with an alternative', (method, href) => {
    const p = homeCommand(homeWorkFixture('new'), method)
    expect(p.action?.href).toBe(href); expect(p.alternative?.href).not.toBe(href)
    expect(p.education).toContain('ask only when I need a fact')
  })
  it.each(['processing', 'waiting', 'held', 'deferred', 'organized'] as const)('%s never invents a customer CTA', state => {
    expect(homeCommand(homeWorkFixture(state), null).action).toBeNull()
  })
  it('only actual leased processing gets active processing language', () => {
    expect(homeCommand(homeWorkFixture('processing'), null).heading).toBe('I’m updating your books.')
    expect(homeCommand(homeWorkFixture('waiting'), null).heading).toBe('I have what I need for the next step.')
    expect(homeCommand(homeWorkFixture('held'), null).heading).toBe('I still have some records to review.')
  })
  it('shows concurrent streams without adding system work to the customer count', () => {
    const work = homeWorkFixture('concurrent'), p = homeCommand(work, null)
    expect(p.context).toEqual(['2 things need you'])
    expect(work.customer.actionableCount).toBe(2)
    expect(p.heading).not.toMatch(/\d|tasks|unresolved/)
    expect(p.action?.href).toBe(`${work.nextAction?.href}&returnTo=%2Fhome`)
  })
  it('does not label incomplete coverage as current or make missing receipts dominate', () => {
    const work = homeWorkFixture('organized'), p = homeCommand(work, null)
    expect(work.progress.catchUp.documentationLimitations).toBe(1)
    expect(p.heading).toBe('You’re all set for now.')
    expect(JSON.stringify(p)).not.toMatch(/missing receipts|books are current/)
  })
  it('routes recoverable problems to the projection document destination', () => {
    const work = homeWorkFixture('recovery'), p = homeCommand(work, null)
    expect(p.action).toEqual({ href: work.nextAction!.href, label: 'View document' })
    expect(p.action?.href).not.toContain('/check-in')
  })
  it('does not manufacture a zero-work result on projection failure', () => {
    expect(unavailableHomeCommand.state).toBe('unavailable')
    expect(unavailableHomeCommand.heading).not.toContain('current')
    expect(unavailableHomeCommand.action).toBeNull()
  })
  it('derives refresh/re-login presentation from persisted projection, not session flags', () => {
    const first = homeCommand(homeWorkFixture('concurrent'), 'statement_uploads')
    expect(homeCommand(JSON.parse(JSON.stringify(homeWorkFixture('concurrent'))), 'statement_uploads')).toEqual(first)
  })
  it('keeps canonical totals and performs no GET/render bookkeeping mutation', () => {
    const source = readFileSync('app/home/page.tsx', 'utf8')
    expect(source).toContain('getAuthenticatedCanonicalReport')
    expect(source).toContain('income={summary.businessIncomeCents} expenses={summary.businessExpensesCents} profit={summary.businessProfitCents}')
    expect(source).toContain('loadBettiWork')
    expect(source).not.toMatch(/getCurrentAskableQuestionQueue|summarizeReceiptDocumentation|loadGuidedWorkSummary|loadStatementAccountUse|\.rpc\(|\.update\(|\.insert\(/)
    expect(source.indexOf('<HomeQuickActions')).toBeLessThan(source.indexOf('<HomeRecentActivity'))
  })
})

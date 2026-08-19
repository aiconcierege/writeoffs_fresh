import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const home = readFileSync('app/home/page.tsx', 'utf8')
const greeting = readFileSync('app/home/HomeGreeting.tsx', 'utf8')
const financialSummary = readFileSync('app/home/home-financial-summary.ts', 'utf8')
const dashboard = readFileSync('app/dashboard/page.tsx', 'utf8')
const header = readFileSync('app/components/Header.tsx', 'utf8')

describe('WriteOffs Home v2', () => {
  it('uses customer-facing Home language without legacy dashboard concepts', () => {
    expect(home).toContain('Your books are up to date.')
    expect(home).toContain('WriteOffs is working.')
    expect(home).toContain('WriteOffs will keep working in the background.')
    expect(home).not.toContain('Nothing needs your attention')
    expect(home).not.toMatch(/>Dashboard<|Pending OCR|Needs review|Review all|Category|Pack|Approve|Uncategorized/i)
  })

  it('uses a browser-local time greeting and never invents a name', () => {
    expect(home).toContain('<HomeGreeting firstName={firstName} />')
    expect(greeting).toContain("hour < 12")
    expect(greeting).toContain("hour < 17")
    expect(greeting).toContain('firstName ?')
    expect(greeting).toContain('Good ${dayPart')
  })

  it('uses only canonical actionable questions for customer attention', () => {
    expect(home).toContain('getAuthenticatedCanonicalReport({')
    expect(home).toContain('summary.completeness.unresolvedCustomerQuestionCount')
    expect(home).toContain('customerQuestionHeadline(questionCount)')
    expect(home).toContain('href="/questions"')
    expect(home).toContain('Answer questions')
    expect(home).not.toContain(".from('transactions')")
    expect(home).not.toContain(".from('receipts')")
  })

  it('does not claim books are current while canonical activity is incomplete', () => {
    expect(home).toContain('const processingComplete = summary.completeness.isComplete')
    expect(home).toMatch(/attentionCount > 0[\s\S]*processingComplete[\s\S]*Your books are up to date/)
    expect(home).toMatch(/processingComplete[\s\S]*WriteOffs will keep working in the background/)
    expect(home).toContain('Some activity is still being processed.')
  })

  it('requires authentication before loading tenant-scoped Home data', () => {
    const authCheck = home.indexOf('supabase.auth.getUser()')
    const redirectCheck = home.indexOf("if (!user) redirect('/login')")
    const questionQuery = home.indexOf('getAuthenticatedCanonicalReport({')
    expect(authCheck).toBeGreaterThan(-1)
    expect(redirectCheck).toBeGreaterThan(authCheck)
    expect(questionQuery).toBeGreaterThan(redirectCheck)
  })

  it('renders only the safe canonical financial summary metrics', () => {
    for (const label of ['Business income', 'Business expenses', 'Business profit']) {
      expect(home).toContain(label)
      expect(financialSummary).toContain(label)
    }
    expect(home).toContain('getAuthenticatedCanonicalReport')
    expect(home).toContain('<dl')
    expect(home).toContain('Some activity is still being processed.')
    expect(home).not.toContain('Estimated deductions')
    expect(home).not.toContain('Estimated taxable income')
    expect(home).not.toContain('Not yet available')
    expect(home).not.toMatch(/writeoffs_month_total|monthTotal/)
  })

  it('limits primary navigation to Home, Transactions, and Reports', () => {
    expect(header).toContain('{ name: "Home", href: "/home" }')
    expect(header).toContain('{ name: "Transactions", href: "/transactions" }')
    expect(header).toContain('{ name: "Reports", href: "/reports/summary" }')
    expect(header).not.toContain('{ name: "Review"')
    expect(header).not.toContain('{ name: "Import"')
    expect(header).not.toContain('{ name: "Dashboard"')
    expect(header).toContain('aria-label="Primary"')
    expect(header).toContain('aria-current={active ? "page" : undefined}')
  })

  it('makes /home canonical and keeps /dashboard only as a compatibility redirect', () => {
    expect(home).toContain('export default async function HomePage()')
    expect(dashboard).toContain("redirect('/home')")
    expect(dashboard).not.toContain('listCustomerQuestions')
    expect(header).toContain('<BrandLogo href="/home"')
  })

  it('uses one understated account menu for settings and sign out', () => {
    expect(header).toContain('<details className="group relative">')
    expect(header).toContain('Account / Settings')
    expect(header).toContain('<SignOutButton className=')
  })
})

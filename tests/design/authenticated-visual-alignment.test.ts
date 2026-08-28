import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = (path: string) => readFileSync(path, 'utf8')

describe('authenticated visual alignment', () => {
  it('gives the authenticated shell stronger brand and navigation presence', () => {
    const header = source('app/components/Header.tsx')
    expect(header).toContain('href="/home" heightPx={36}')
    expect(header).toContain('min-h-12')
    expect(header).toContain('text-base font-semibold')
    expect(header).toContain("event.key !== 'Escape'")
    expect(header).toContain('onClick={closeMenu}')
  })

  it('keeps required authenticated copy readable and tightens shell rhythm', () => {
    const css = source('app/globals.css')
    expect(css).toContain('.app-page :where(.text-xs,.text-sm) { font-size: 1rem')
    expect(css).toContain('padding: 1.25rem 1rem 4rem')
    expect(css).toContain('.home-shell { width: 100%; max-width: 80rem; margin-inline: auto; padding: 2rem 1rem 4.5rem; }')
  })

  it('uses canonical Betti only for purposeful customer orientation', () => {
    const ui = source('app/components/ui.tsx')
    expect(ui).toContain('export function BettiPageIntro')
    expect(source('app/questions/QuestionFlow.tsx')).toContain('state="question"')
    expect(source('app/questions/QuestionFlow.tsx')).toContain('state="caught-up"')
    expect(source('app/receipts/page_inner.tsx')).toContain('state="working"')
    expect(source('app/mileage/MileageClient.tsx')).toContain('state="welcome"')
    expect(source('app/get-started/GetStartedFlow.tsx')).toContain('state="welcome"')
    for (const path of ['app/reports/ReportsSummary.tsx', 'app/invoices/InvoicesClient.tsx', 'app/settings/page.tsx']) {
      expect(source(path)).not.toContain('BettiIllustration')
    }
  })

  it('keeps transactions record-first and receipt state visible', () => {
    const transactions = source('app/transactions/page.tsx')
    expect(transactions).toContain('transaction-record-row')
    expect(transactions).toContain("row.has_receipt ? 'Receipt attached'")
    expect(transactions).toContain('text-lg font-semibold')
  })
})

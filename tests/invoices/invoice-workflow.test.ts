import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { validateInvoice } from '../../app/lib/invoices/validation'

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

describe('invoice workflow contracts', () => {
  it('validates exact customer-facing invoice facts without accounting fields', () => {
    expect(validateInvoice({ customerName: 'Smith', amount: '2000.00',
      issueDate: '2026-08-01', description: 'Backyard cleanup', dueDate: '2026-08-15',
      jobLabel: 'Smith backyard', location: '1842 W Elm St', note: 'Thank you.' }, '2026-08-24'))
      .toMatchObject({ ok: true, value: { amountCents: 200000, currency: 'USD' } })
    expect(validateInvoice({ customerName: 'Smith', amount: '-1', issueDate: '2026-08-01',
      description: 'Work' }, '2026-08-24')).toMatchObject({ ok: false })
    expect(validateInvoice({ customerName: 'Smith', amount: '10', issueDate: '2026-08-10',
      dueDate: '2026-08-01', description: 'Work' }, '2026-08-24')).toMatchObject({ ok: false })
  })

  it('provides a mobile-first optional invoice flow and safe share artifact', () => {
    const list = read('app/invoices/InvoicesClient.tsx')
    const detail = read('app/invoices/[id]/InvoiceActions.tsx')
    const printable = read('app/invoices/[id]/print/page.tsx')
    expect(list).toContain('Income is recorded only when you actually receive payment.')
    expect(list).toContain('sm:grid-cols-2')
    expect(detail).toContain('Correct invoice details')
    expect(detail).toContain('More than one payment could fit')
    expect(detail).toContain('View and download')
    expect(printable).toContain('Amount due')
    expect(`${list}${detail}${printable}`).not.toMatch(/accounts receivable|debit|credit|journal entry/i)
  })

  it('protects invoice routes and makes invoices available from the Home/menu record areas', () => {
    expect(read('app/lib/route-policy.ts')).toContain("'/invoices'")
    expect(read('app/home/page.tsx')).toContain("['/invoices', 'Invoices'")
    const header = read('app/components/Header.tsx')
    expect(header).toContain('["Invoices", "/invoices"]')
  })

  it('projects linked invoice context without adding invoice amounts to summaries', () => {
    const repository = read('app/lib/bookkeeping/financial-summary-repository.ts')
    const transactions = read('app/lib/bookkeeping/transaction-read-model.ts')
    expect(repository).toContain("from('invoice_income_links')")
    expect(transactions).toContain('Invoice ${text(invoice, \'invoice_number\')}')
    expect(repository).not.toContain('invoice.amount_cents')
  })
})

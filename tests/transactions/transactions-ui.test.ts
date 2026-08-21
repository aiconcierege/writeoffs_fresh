import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
const source = (file: string) => readFileSync(join(process.cwd(), file), 'utf8')
describe('customer Transactions experience', () => {
  it('uses the canonical route and plain-language history UI', () => {
    expect(source('app/components/Header.tsx')).toContain('{ name: "Transactions", href: "/transactions", section: "transactions" }')
    const page = source('app/transactions/page.tsx')
    expect(page).toContain('listTransactionReadModel')
    expect(page).toContain('Search merchant or description')
    expect(page).not.toMatch(/allocation|provenance|canonical|reconciliation/i)
    expect(source('app/review/page.tsx')).toContain("redirect('/transactions')")
  })
  it('shows source facts, treatment, explanation, evidence, and history in detail', () => {
    const detail = source('app/transactions/[id]/page.tsx')
    for (const text of ['What WriteOffs knows', 'Receipt and documentation', 'CorrectionForm', 'History']) {
      expect(detail).toContain(text)
    }
    expect(detail).not.toMatch(/category selector|journal entry|reconciliation/i)
  })
  it('routes unresolved activity to factual questions and never exposes canonical deletion', () => {
    const detail = source('app/transactions/[id]/page.tsx')
    expect(detail).toContain('href="/questions"')
    expect(detail).not.toMatch(/Delete transaction|Remove transaction/)
  })
  it('uses canonical receipt endpoints only for canonical rows', () => {
    const attach = source('app/review/AttachReceipt.tsx')
    expect(attach).toContain('/api/bookkeeping/financial-transactions/${transactionId}/receipts')
    expect(source('app/transactions/ReceiptActions.tsx')).toContain('/api/bookkeeping/transactions/${transactionId}/receipt-lost')
  })
})

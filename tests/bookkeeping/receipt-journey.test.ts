import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = (file: string) => readFileSync(resolve(process.cwd(), file), 'utf8')

describe('customer receipt journey', () => {
  it('uses canonical registration and plain Keep or Discard actions', () => {
    const page = source('app/receipts/page_inner.tsx')
    expect(page).toContain("uploadFingerprint")
    expect(page).toContain('Keep receipt')
    expect(page).toContain('Discard receipt')
    expect(page).not.toContain('category')
    expect(page).not.toContain('OCR confidence')
    expect(page).not.toContain('transaction_id')
  })

  it('keeps OCR at the extracted-fact boundary', () => {
    const route = source('app/api/receipts/ocr/route.ts')
    expect(route).toContain('recordReceiptExtraction')
    expect(route).not.toContain(".from('transactions')")
    expect(route).not.toContain('category_key')
    expect(route).not.toContain('receipt_waived')
  })

  it('shows receipt-only provenance through the unified Transactions model', () => {
    const model = source('app/lib/bookkeeping/transaction-read-model.ts')
    expect(model).toContain("sourceKind !== 'receipt'")
    expect(model).toContain("compoundComponent ? 'Part of bank activity' : financial ? null : 'Receipt only'")
  })
})

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { dollarsToCents, validateReceiptFacts } from '../../app/receipts/receipt-form'

const source = (file: string) => readFileSync(file, 'utf8')
const page = source('app/receipts/page_inner.tsx')
const upload = source('app/receipts/ReceiptUploadAction.tsx')
const home = source('app/home/page.tsx')
const header = source('app/components/Header.tsx')
const routePolicy = source('app/lib/route-policy.ts')

describe('autonomous Receipt UX v1', () => {
  it('starts an immediate receipt upload from Home without primary navigation', () => {
    expect(home).toContain('<ReceiptUploadAction />')
    expect(home).toContain('View receipts')
    expect(upload).toContain('onChange={(event) => void select(event.target.files?.[0])}')
    expect(upload).not.toContain('Upload selected')
    expect(header).not.toMatch(/name: ["']Receipts["']/)
  })

  it('uses device-appropriate labels and a standard file chooser', () => {
    expect(routePolicy).toContain("'/receipts'")
    expect(upload).toContain('Upload receipt</span>')
    expect(upload).toContain('Add receipt</span>')
    expect(upload).toContain('accept="image/*,application/pdf"')
    expect(upload).not.toContain('capture="environment"')
  })

  it('finishes the normal journey without confirmation or Keep', () => {
    expect(upload).toContain('Receipt added. WriteOffs is organizing it.')
    expect(page).not.toContain('Keep receipt')
    expect(page).not.toContain('Check the receipt details before keeping it.')
    expect(page).not.toContain('/keep-with-facts')
    expect(page).toContain('Edit details')
    expect(page).toContain("receipt.displayStatus === 'details_unavailable'")
  })

  it('projects calm canonical receipt states including convergence', () => {
    for (const copy of ['Still organizing', 'Matched', 'Receipt only', 'Receipt added', 'Removed']) {
      expect(page).toContain(copy)
    }
    expect(page).toContain('Safely retained. Some details are unavailable.')
    expect(page).not.toContain('Needs your attention')
  })

  it('keeps customer copy free from tax and implementation claims', () => {
    const customerSource = `${page}\n${upload}`
    expect(customerSource).not.toMatch(/deductible|substantiat|audit[- ]ready|IRS ready|documentation sufficient/i)
    expect(customerSource).not.toMatch(/canonical|extraction provider|OCR event|bookkeeping record|processing fingerprint/i)
  })

  it('uses accessible, touch-sized responsive cards instead of a table', () => {
    expect(page).toContain('min-h-11')
    expect(page).toContain('grid gap-4 sm:grid-cols-2')
    expect(upload).toContain('aria-live="polite"')
    expect(page).not.toContain('<table')
  })
})

describe('exception-only receipt fact validation', () => {
  it('converts customer-entered dollars to exact cents', () => {
    expect(dollarsToCents('12.34')).toBe(1234)
    expect(dollarsToCents('$12.34')).toBe(1234)
    expect(dollarsToCents('12.345')).toBeNull()
  })

  it('accepts a valid optional correction', () => {
    expect(validateReceiptFacts({ merchant: ' Receipt Match Test ', occurredOn: '2025-05-20', total: '12.34' }).facts)
      .toEqual({ merchant: 'Receipt Match Test', occurredOn: '2025-05-20', totalAmountCents: 1234 })
  })

  it('rejects impossible correction facts', () => {
    expect(validateReceiptFacts({ merchant: ' ', occurredOn: '2025-02-30', total: '-1.00' }).facts).toBeNull()
  })
})

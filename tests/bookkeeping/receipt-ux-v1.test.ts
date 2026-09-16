import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { dollarsToCents, validateReceiptFacts } from '../../app/receipts/receipt-form'

const source = (file: string) => readFileSync(file, 'utf8')
const page = source('app/receipts/page_inner.tsx')
const upload = source('app/receipts/ReceiptUploadAction.tsx')
const home = source('app/home/page.tsx')
const homeActions = source('app/home/HomeQuickActions.tsx')
const header = source('app/components/Header.tsx')
const routePolicy = source('app/lib/route-policy.ts')

describe('autonomous Receipt UX v1', () => {
  it('keeps receipt intake easy to reach without making it routine bookkeeping work', () => {
    expect(home).toContain('<HomeQuickActions business={isBusiness}/>')
    expect(homeActions).toContain('<DocumentIntake compact')
    expect(source('app/get-started/GetStartedFlow.tsx')).toContain('Upload receipts')
    expect(upload).toContain('onChange={(event) => void select(Array.from(event.target.files ?? []))}')
    expect(upload).toContain('multiple')
    expect(upload).not.toContain('Upload selected')
    expect(header).toContain('["Receipts", "/receipts"]')
  })

  it('uses device-appropriate labels and a standard file chooser', () => {
    expect(routePolicy).toContain("'/receipts'")
    expect(upload).toContain("label='Upload receipt'")
    expect(upload).toContain("mobileLabel='Add receipt'")
    expect(upload).toContain('accept="image/jpeg,image/png,image/webp,application/pdf"')
    expect(homeActions).toContain('Send Betti documents')
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
    for (const copy of ['Organizing', 'Matched', 'Receipt-only expense', 'Needs attention', 'Removed']) {
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

  it('uses accessible, touch-sized disclosure rows instead of cards or a table', () => {
    expect(page).toContain('min-h-11')
    expect(page).toContain('<summary className="receipt-record-summary min-h-14')
    expect(page).toContain('View receipt')
    expect(page).toContain('receipt-record-detail')
    expect(upload).toContain('aria-live="polite"')
    expect(page).not.toContain('<table')
    const css=source('app/globals.css')
    expect(css).toContain('receipt-record-summary > span:first-child > strong { font-size:1.0625rem; font-weight:650')
    expect(css).toContain('padding:.3rem .5rem .3rem .75rem')
  })

  it('loads a bounded inbox and offers lightweight organization',()=>{
    expect(page).toContain('const PAGE_SIZE = 50')
    expect(page).toContain('Load more receipts')
    expect(page).toContain('Search receipts')
    expect(page).toContain('Without a match')
    expect(page).not.toContain('limit=500')
    expect(source('app/lib/bookkeeping/receipt-workflow.ts')).not.toContain('createSignedUrl')
    expect(page).toContain('/api/receipts/${receipt.id}/view')
  })

  it('uses extracted identity instead of exposing source filenames',()=>{
    expect(page).toContain('if(receipt.merchant?.trim())return receipt.merchant.trim()')
    expect(page).toContain("return'Receipt'")
    expect(page).not.toContain('receipt.originalName')
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

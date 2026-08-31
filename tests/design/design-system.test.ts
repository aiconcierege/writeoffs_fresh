import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (file: string) => readFileSync(file, 'utf8')

describe('WriteOffs product design system', () => {
  it('centralizes the landing-page palette, type hierarchy, focus, and reduced motion', () => {
    const css = read('app/globals.css')
    expect(css).toContain('--canvas: #fbfaf7')
    expect(css).toContain('--ink: #17211d')
    expect(css).toContain('--brand-navy: #243186')
    expect(css).toContain('--brand-green: #178368')
    expect(css).toContain('.page-title')
    expect(css).toContain(':focus-visible')
    expect(css).toContain('prefers-reduced-motion')
  })

  it('provides bounded reusable composition instead of dashboard-only cards', () => {
    const ui = read('app/components/ui.tsx')
    for (const name of ['PageContainer','PageHeader','SectionHeader','Surface','StatusBadge','EmptyState','MoneyDisplay']) {
      expect(ui).toContain(`function ${name}`)
    }
    expect(read('docs/DESIGN_SYSTEM.md')).toMatch(/typography and whitespace establish hierarchy/i)
  })

  it('keeps canonical navigation and mobile receipt language', () => {
    const header = read('app/components/Header.tsx')
    expect(header).toContain('Home')
    expect(header).not.toContain('Dashboard')
    const receipt = read('app/receipts/ReceiptUploadAction.tsx')
    expect(receipt).toContain('Upload receipt')
    expect(receipt).toContain('Add receipt')
    expect(receipt).toContain('onChange={(event) => void select')
  })

  it('uses intentional empty, loading, error, and success states', () => {
    expect(read('app/transactions/page.tsx')).toContain('No activity yet')
    expect(read('app/receipts/page_inner.tsx')).toContain('Upload one and WriteOffs will take it from there.')
    expect(read('app/invoices/InvoicesClient.tsx')).toContain('Create one when you need to bill a customer.')
    expect(read('app/questions/QuestionFlow.tsx')).toContain('You’re all caught up.')
    expect(read('app/error.tsx')).not.toContain('style={{')
    expect(read('app/questions/loading.tsx')).toContain('skeleton')
  })

  it('keeps mobile rows and actions usable without desktop-only tables', () => {
    expect(read('app/transactions/page.tsx')).toContain("grid-cols-[1fr_auto]")
    expect(read('app/questions/QuestionFlow.tsx')).toContain('min-h-14')
    expect(read('app/money/ManualMoneyClient.tsx')).toContain('w-full sm:w-auto')
    expect(read('app/mileage/MileageClient.tsx')).toContain('w-full sm:w-auto')
  })

  it('treats the printable invoice as a professional brand artifact', () => {
    const invoice = read('app/invoices/[id]/print/page.tsx')
    expect(invoice).toContain('Amount due')
    expect(invoice).toContain('Prepared with WriteOffs')
    expect(invoice).toContain('print:shadow-none')
    expect(invoice).not.toMatch(/accounts receivable|debit|credit/i)
  })

  it('does not introduce tax or bookkeeping authority in presentation files', () => {
    const files = ['app/components/ui.tsx','app/globals.css','docs/DESIGN_SYSTEM.md']
    const text = files.map(read).join('\n')
    expect(text).not.toMatch(/append_bookkeeping_decision|create allocation|guaranteed deduction|IRS compliant/i)
  })

  it('uses clear current-page semantics while retaining a focus indicator', () => {
    const header = read('app/components/Header.tsx')
    expect(header).toContain('aria-current=')
    expect(header).toContain('focus-visible:outline')
  })

  it('distinguishes standard, form, and data page widths', () => {
    const css = read('app/globals.css')
    expect(css).toContain('.page-container {')
    expect(css).toContain('.page-container-narrow')
    expect(css).toContain('.page-container-wide')
  })

  it('keeps R2 empty states and first-use setup actionable', () => {
    const transactions = read('app/transactions/page.tsx')
    expect(transactions).toContain('Connect an account')
    expect(transactions).toContain('Import a CSV')
    expect(read('app/receipts/ReceiptUploadAction.tsx')).toContain("'btn btn-primary min-h-12'")
    expect(read('app/receipts/ReceiptUploadAction.tsx')).toContain("variant==='guided'?'btn btn-secondary min-h-12'")
    const mileage = read('app/mileage/MileageClient.tsx')
    expect(mileage).toContain('First, tell us which vehicle you use for business')
    expect(mileage).toContain('You only need to do this once')
  })

  it('separates Settings profile, appearance, setup, and connections', () => {
    const form = read('app/settings/profile/SettingsForm.tsx')
    const settings = read('app/settings/page.tsx')
    expect(form).toContain('Profile &amp; Business')
    expect(form).toContain('Appearance')
    expect(settings).toContain('Business setup')
    expect(settings).toContain('Bank connections')
  })
})

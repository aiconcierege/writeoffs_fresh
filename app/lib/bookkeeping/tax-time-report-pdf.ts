import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { PDFDocument, StandardFonts, rgb, type PDFPage, type PDFFont } from 'pdf-lib'
import type { getAuthenticatedTaxYearReadiness } from './tax-year-readiness-service'

type TaxTimeReadiness = Awaited<ReturnType<typeof getAuthenticatedTaxYearReadiness>>
const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
const date = new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' })

function pdfSafe(text: string, font: PDFFont) {
  return [...text].map(character => { try { font.encodeText(character); return character } catch { return '?' } }).join('')
}

function wrap(text: string, font: PDFFont, size: number, width: number) {
  const words = pdfSafe(text, font).split(/\s+/); const lines: string[] = []; let line = ''
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word
    if (font.widthOfTextAtSize(candidate, size) <= width) line = candidate
    else {
      if (line) lines.push(line)
      line = ''
      for (const character of word) {
        if (line && font.widthOfTextAtSize(line + character, size) > width) { lines.push(line); line = '' }
        line += character
      }
    }
  }
  if (line) lines.push(line)
  return lines
}

export async function createTaxTimeReportPdf(input: { readiness: TaxTimeReadiness; generatedAt?: Date }) {
  const { readiness } = input
  const pdf = await PDFDocument.create()
  const logo = await pdf.embedPng(await readFile(path.join(process.cwd(), 'public/writeoffs-logo-tight.png')))
  const regular = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const navy = rgb(0.14, 0.19, 0.53), ink = rgb(0.08, 0.12, 0.18), muted = rgb(0.35, 0.40, 0.46)
  const margin = 54, width = 504
  let page: PDFPage, y = 738
  const addPage = () => { page = pdf.addPage([612, 792]); y = 738; return page }
  const ensure = (height: number) => { if (y - height < 48) addPage() }
  const line = (text: string, options: { size?: number; font?: PDFFont; color?: ReturnType<typeof rgb>; gap?: number } = {}) => {
    const size = options.size ?? 10, font = options.font ?? regular
    const lines = wrap(text, font, size, width)
    ensure(Math.min(lines.length * (size + 4) + (options.gap ?? 0), 650))
    for (const value of lines) { ensure(size + 4); page.drawText(value, { x: margin, y, size, font, color: options.color ?? ink }); y -= size + 4 }
    y -= options.gap ?? 0
  }
  const heading = (text: string) => { ensure(80); y -= 10; line(text, { size: 15, font: bold, color: navy, gap: 8 }) }
  const row = (label: string, value: string, indent = 0) => {
    const safeValue = pdfSafe(value, bold)
    const lines = wrap(label, regular, 10, width - indent - bold.widthOfTextAtSize(safeValue, 10) - 22)
    ensure(lines.length * 14 + 8)
    page.drawText(safeValue, { x: 558 - bold.widthOfTextAtSize(safeValue, 10), y, size: 10, font: bold, color: ink })
    for (const text of lines) { page.drawText(text, { x: margin + indent, y, size: 10, font: regular, color: ink }); y -= 14 }
    y -= 6
  }

  addPage()
  const logoSize = logo.scale(112 / logo.width)
  page!.drawImage(logo, { x: margin, y: y - logoSize.height, ...logoSize })
  y -= logoSize.height + 24
  line(`${readiness.taxYear} Tax-Time Report`, { size: 25, font: bold, color: ink, gap: 7 })
  line(readiness.businessName, { size: 13, font: bold, gap: 2 })
  line(`Generated ${(input.generatedAt ?? new Date()).toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, ' UTC')}`, { size: 9, color: muted, gap: 14 })
  line(readiness.status === 'ready' ? 'Your books are ready for tax preparation.' : 'Your books still need attention.', { size: 16, font: bold, color: navy, gap: 4 })
  line(readiness.scope === 'business' ? 'This report brings together the business income, expenses, mileage, and tax-time review items WriteOffs organized for the year.' : 'This report brings together the business expenses, mileage, and tax-time review items WriteOffs organized for the year.', { color: muted, gap: 8 })

  heading('Annual business summary')
  const metrics = readiness.scope === 'business'
    ? [['Business income', readiness.totals.businessIncomeCents], ['Business expenses', readiness.totals.businessExpensesCents],
      ['Estimated business profit', readiness.totals.businessProfitCents]] as const
    : [['Business expenses', readiness.totals.businessExpensesCents]] as const
  ensure(85)
  const columnWidth = width / metrics.length
  for (const [index, [label, cents]] of metrics.entries()) {
    const x = margin + index * columnWidth
    page!.drawText(label, { x, y, size: 9, font: regular, color: muted })
    const amount = money.format(cents / 100)
    const size = Math.min(18, (columnWidth - 14) / bold.widthOfTextAtSize(amount, 1))
    page!.drawText(amount, { x, y: y - 27, size, font: bold, color: ink })
  }
  y -= 48
  if (readiness.scope === 'business') {
    line('Estimated business profit is income minus business bookkeeping expenses. Tax-return choices may change the amount used on your return.', { size: 8, color: muted, gap: 4 })
  } else line('Income is not tracked as part of this membership.', { size: 8, color: muted })

  heading('Schedule C expense summary')
  line('Supported deductions from your current books. Purchases needing a tax-return decision are listed separately below.', { size: 9, color: muted, gap: 6 })
  const categories = readiness.scheduleCCategories
  if (!categories.length) line('No supported Schedule C deduction categories were recorded for this year.', { color: muted })
  for (const category of categories) row(category.categoryLabel, money.format(category.amountCents / 100))
  if (readiness.totals.estimatedDeductionsCents != null) row('Estimated supported deductions', money.format(readiness.totals.estimatedDeductionsCents / 100))

  const vehicles = readiness.vehicleReports.filter(vehicle => vehicle.businessMilesMilli > 0 || vehicle.actualExpenseCents > 0)
  if (vehicles.length) {
    heading('Vehicle and mileage')
    for (const vehicle of vehicles) {
      ensure(100)
      line(vehicle.displayName, { size: 11, font: bold, gap: 2 })
      line(`Bookkeeping method: ${vehicle.method === 'standard_mileage' ? 'Standard mileage' : vehicle.method === 'actual_expenses' ? 'Actual expenses' : 'Tax-preparer review'}`, { size: 9, color: muted })
      row('Business miles', `${(vehicle.businessMilesMilli / 1000).toLocaleString('en-US')} miles`, 10)
      if (vehicle.method === 'standard_mileage' && vehicle.mileageDeductionCents != null) row('Standard mileage deduction', money.format(vehicle.mileageDeductionCents / 100), 10)
      for (const expense of vehicle.expenses ?? []) {
        if (['parking', 'tolls'].includes(expense.kind) && expense.deductibleCents != null) {
          row(expense.kind === 'parking' ? 'Business parking' : 'Business tolls', money.format(expense.deductibleCents / 100), 10)
        }
      }
      if (vehicle.method === 'actual_expenses') {
        if (vehicle.allocationBasisPoints != null) row('Business use', `${(vehicle.allocationBasisPoints / 100).toFixed(2)}%`, 10)
        row('Recorded vehicle expenses', money.format(vehicle.actualExpenseCents / 100), 10)
        if (vehicle.deductibleActualExpenseCents != null) row('Business-use vehicle deduction', money.format(vehicle.deductibleActualExpenseCents / 100), 10)
      }
    }
  }

  if (readiness.reviewItems.length) heading('Items for you or your tax preparer to review')
  for (const item of readiness.reviewItems) {
    ensure(110)
    line(item.title, { size: 11, font: bold, gap: 1 })
    if (item.occurredOn || item.amountCents != null) line([item.occurredOn ? date.format(new Date(`${item.occurredOn}T00:00:00Z`)) : '', item.amountCents != null ? money.format(item.amountCents / 100) : ''].filter(Boolean).join(' · '), { size: 9, color: muted })
    if (item.description) line(item.description, { size: 10 })
    if (item.businessAmountCents != null) line(`Business-use amount: ${money.format(item.businessAmountCents / 100)}`, { size: 9 })
    if (item.currentHandling) line(`WriteOffs handling: ${item.currentHandling}.`, { size: 9 })
    line(item.detail, { size: 9, color: muted, gap: 7 })
  }

  ensure(75); y -= 14
  line('About this report', { size: 11, font: bold, gap: 3 })
  line('WriteOffs organized these records from connected financial information, documents, and facts you provided. Send this report to your tax preparer or use it while preparing your own return. Supporting receipts remain available in WriteOffs. WriteOffs does not prepare or file tax returns, or make final tax elections that require taxpayer or tax-professional judgment.', { size: 8, color: muted })
  for (const [index, sheet] of pdf.getPages().entries()) {
    sheet.drawText(`${readiness.taxYear} Tax-Time Report · ${index + 1} of ${pdf.getPageCount()}`, { x: margin, y: 28, size: 8, font: regular, color: muted })
  }
  pdf.setLanguage('en-US')
  pdf.setTitle(`${readiness.taxYear} Tax-Time Report`)
  pdf.setAuthor('WriteOffs')
  pdf.setSubject('Annual bookkeeping summary for tax preparation')
  return pdf.save()
}

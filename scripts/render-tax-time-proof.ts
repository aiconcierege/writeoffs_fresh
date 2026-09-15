import { mkdir, writeFile } from 'node:fs/promises'
import { createCanvas } from '@napi-rs/canvas'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { createTaxTimeReportPdf } from '../app/lib/bookkeeping/tax-time-report-pdf'

async function main() {
  const directory = '/private/tmp/writeoffs-tax-time-proof'
  await mkdir(directory, { recursive: true })
  for (const count of [0, 15]) {
    const readiness = {
      status: 'ready', taxYear: 2026, scope: 'business', businessName: 'Juniper Design & Consulting',
      totals: { businessIncomeCents: 12435000, businessExpensesCents: 3178425, businessProfitCents: 9256575, estimatedDeductionsCents: 2785000 },
      scheduleCCategories: ['Advertising', 'Contract labor', 'Insurance (other than health)', 'Legal and professional services', 'Office expense', 'Supplies', 'Travel', 'Meals', 'Utilities'].map((categoryLabel, index) => ({ categoryLabel, amountCents: 12000 + index * 17000 })),
      vehicleReports: count ? [{ displayName: '2023 Toyota RAV4', method: 'standard_mileage', businessMilesMilli: 4250125, actualExpenseCents: 12000, mileageDeductionCents: 310000, allocationBasisPoints: 6500 }] : [],
      ...(process.argv.includes('--phase2a')?{issues:[{code:'HISTORICAL_DOCUMENTATION_LIMITATION',detail:'21 older purchases still lack meal details. No missing facts were assumed. Keep any supporting records you find.'}]}:{}),
      reviewItems: Array.from({ length: count }, (_, index) => ({ title: `Purchase ${index + 1}: North Valley Equipment and Professional Office Furnishings`,
        description: 'Computer and display used for client design projects', occurredOn: '2026-02-14', amountCents: 185099, businessAmountCents: 148079,
        currentHandling: 'Business purchase; no current-year deduction assigned',
        detail: 'This purchase may be longer-term business property. You or your tax preparer may need to decide whether to deduct it this year, depreciate it, or use another applicable treatment.' })),
    }
    const bytes = await createTaxTimeReportPdf({ readiness: readiness as never, generatedAt: new Date('2026-09-14T18:00:00Z') })
    await writeFile(`${directory}/report-${count}.pdf`, bytes)
    const pdf = await getDocument({ data: bytes.slice(), useSystemFonts: true }).promise
    for (let index = 1; index <= pdf.numPages; index++) {
      const page = await pdf.getPage(index)
      const viewport = page.getViewport({ scale: 1.25 })
      const canvas = createCanvas(viewport.width, viewport.height)
      await page.render({ canvasContext: canvas.getContext('2d') as never, viewport, canvas: canvas as never }).promise
      await writeFile(`${directory}/report-${count}-page-${index}.png`, canvas.toBuffer('image/png'))
    }
    console.log(`Rendered ${count ? 'review' : 'ready'} fixture: ${pdf.numPages} pages`)
    await pdf.destroy()
  }
}
main().catch(() => { console.error('PDF proof rendering failed'); process.exitCode = 1 })

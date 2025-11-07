/* File: app/realtor/page.tsx
 * Version: v1
 * Date: 2025-10-13
 * SHA256: f03186dc05a87150ac20f7c2e282803971ef43a7243522e0b0c9530302594654
 * Notes: Initial Realtor landing page (Standard). Static hero + CTA, zero external deps.
 */

import Link from 'next/link';

export const metadata = {
  title: 'Realtors: Get Schedule C–Ready in Minutes | WriteOffs.io',
  description:
    'Upload CSVs & receipts, auto-map common Realtor expenses (MLS dues, Zillow, signs), attach receipts, and export a Schedule C summary + receipts ZIP—no bank link required.',
  openGraph: {
    title: 'Realtors: Get Schedule C–Ready in Minutes',
    description:
      'CSV import • Rules for MLS/Zillow/DocuSign • Mileage templates • Schedule C export',
    url: 'https://writeoffs.io/realtor',
    type: 'website'
  }
};

export default function RealtorLandingPage() {
  return (
    <main className="min-h-screen bg-white">
      <section className="mx-auto max-w-5xl px-6 py-16">
        <div className="mb-8 inline-flex items-center rounded-full border px-3 py-1 text-sm">
          <span className="mr-2">🎯</span> Realtor Specialization Pack
        </div>

        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          Realtors: get tax-ready in minutes.
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-neutral-700">
          Upload your transactions CSV and receipts. We auto-map MLS dues, Supra, Zillow ads,
          DocuSign, signs, and more—then hand you a Schedule C summary and a receipts ZIP your
          CPA will love. No bank connection required.
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/signup?vertical=realtor"
            className="rounded-xl btn btn-primary px-5 py-3"
          >
            Start free — Realtor Pack
          </Link>
          <Link
            href="/"
            className="rounded-xl border px-5 py-3"
            aria-label="Prefer a general setup? Use the General path"
          >
            Prefer General? Go here
          </Link>
        </div>

        <ul className="mt-10 grid gap-4 sm:grid-cols-2">
          <li className="rounded-2xl border p-5">
            <div className="text-base font-semibold">Preset rules</div>
            <div className="mt-1 text-sm text-neutral-700">
              Zillow, ARMLS/NAR/AAR, Supra, DocuSign, ShowingTime, Canva—pre-mapped to Schedule C.
            </div>
          </li>
          <li className="rounded-2xl border p-5">
            <div className="text-base font-semibold">Receipt OCR + match</div>
            <div className="mt-1 text-sm text-neutral-700">
              Extract date/vendor/total and suggest a transaction within ±7 days/±$2. Always editable.
            </div>
          </li>
          <li className="rounded-2xl border p-5">
            <div className="text-base font-semibold">Mileage templates</div>
            <div className="mt-1 text-sm text-neutral-700">
              Open House, Buyer Tour, Listing Prep—quick-add with IRS-friendly notes.
            </div>
          </li>
          <li className="rounded-2xl border p-5">
            <div className="text-base font-semibold">Exports your CPA will love</div>
            <div className="mt-1 text-sm text-neutral-700">
              Schedule C summary CSV + receipts ZIP (by category). Optional 1-page CPA cover sheet.
            </div>
          </li>
        </ul>

        <div className="mt-12 text-sm text-neutral-600">
          Beta note: This path enables OCR match & mileage templates by default. You can switch to
          General anytime in Settings.
        </div>
      </section>
    </main>
  );
}

// /app/press/page.tsx
import Link from "next/link";

export const metadata = {
  title: "Press Kit · WriteOffs.io",
  description: "Logos, colors, boilerplate, and media contact for WriteOffs.io.",
};

export default function PressPage() {
  return (
    <main className="mx-auto max-w-5xl px-5 py-16">
      <h1 className="text-3xl font-bold tracking-tight">Press Kit</h1>
      <p className="mt-2 text-neutral-700">
        Media inquiries and brand assets for WriteOffs.io.
      </p>

      <section className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* Logos */}
        <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-card">
          <h2 className="text-lg font-semibold">Logos</h2>
          <ul className="mt-3 space-y-2 text-sm">
            <li>
              <a className="text-[#1D4ED8] hover:underline" href="/media/writeoffs_logo_clean.png" download>
                Primary logo (PNG)
              </a>
            </li>
            <li>
              <a className="text-[#1D4ED8] hover:underline" href="/logo.svg" download>
                Primary logo (SVG)
              </a>
            </li>
            <li>
              <a className="text-[#1D4ED8] hover:underline" href="/og/og-default.png" download>
                App icon
              </a>
            </li>
          </ul>
        </div>

        {/* Colors */}
        <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-card">
          <h2 className="text-lg font-semibold">Colors</h2>
          <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
            <div className="rounded-xl border border-neutral-200 p-3">
              <div className="h-8 w-full rounded-md bg-[#2563EB]" />
              <div className="mt-2 font-medium">Primary Blue</div>
              <div className="text-neutral-700">#2563EB</div>
            </div>
            <div className="rounded-xl border border-neutral-200 p-3">
              <div className="h-8 w-full rounded-md bg-[#1D4ED8]" />
              <div className="mt-2 font-medium">Blue Hover</div>
              <div className="text-neutral-700">#1D4ED8</div>
            </div>
            <div className="rounded-xl border border-neutral-200 p-3">
              <div className="h-8 w-full rounded-md bg-[#10B981]" />
              <div className="mt-2 font-medium">Accent Green</div>
              <div className="text-neutral-700">#10B981</div>
            </div>
          </div>
        </div>

        {/* Boilerplate */}
        <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-card md:col-span-2">
          <h2 className="text-lg font-semibold">Company boilerplate</h2>
          <p className="mt-2 text-neutral-800">
            WriteOffs.io is a deduction-first tool for solopreneurs and gig workers. It helps people spot likely
            write-offs, attach receipts with OCR, track mileage, and export Schedule C-ready data. When users aren’t
            sure, they can ask, “Is it a write-off?” and get careful, hedged guidance. The product is currently in
            private beta in the U.S.
          </p>
        </div>

        {/* Contact */}
        <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-card md:col-span-2">
          <h2 className="text-lg font-semibold">Media contact</h2>
          <p className="mt-2 text-neutral-800">
            Email: <a href="mailto:press@writeoffs.io" className="text-[#1D4ED8] hover:underline">press@writeoffs.io</a>
          </p>
          <p className="text-neutral-700 text-sm mt-1">
            For embargoed briefings, please include your outlet and timeline.
          </p>
          <div className="mt-4">
            <Link href="/" className="inline-block rounded-xl border border-[#BFDBFE] px-4 py-2 text-sm font-semibold text-[#1D4ED8] hover:border-[#93C5FD]">
              Back to homepage
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}

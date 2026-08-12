import Image from "next/image"
import Link from "next/link"
import WaitlistForm from "./components/WaitlistForm"

const steps = [
  {
    number: "01",
    title: "Add your financial data",
    body: "Connect your accounts when available, or securely upload transaction files and statements.",
  },
  {
    number: "02",
    title: "Add your receipts",
    body: "Take a photo or choose a file. WriteOffs preserves the original, captures the details, and matches it to the right activity whenever possible.",
  },
  {
    number: "03",
    title: "Review what needs you",
    body: "Most bookkeeping is handled automatically. Once a week, spend a few minutes answering the questions only you can answer.",
  },
]

const values = [
  {
    eyebrow: "Always working",
    title: "Work completed before you arrive",
    body: "WriteOffs reviews new activity, identifies business expenses, and keeps your records moving without waiting for you to manage every transaction.",
  },
  {
    eyebrow: "Connected records",
    title: "Receipts and transactions, brought together",
    body: "Financial data shows what happened. Receipts provide the detail. WriteOffs connects the two and keeps the original evidence organized.",
  },
  {
    eyebrow: "Focused attention",
    title: "A shorter weekly review",
    body: "No endless transaction queue. When your judgment is needed, WriteOffs presents a focused set of clear questions in one place.",
  },
  {
    eyebrow: "Accurate treatment",
    title: "Categories handled for you",
    body: "Accurate tax categories matter. Routine categorization should not consume your time. WriteOffs handles the work while keeping every result open to review and correction.",
  },
  {
    eyebrow: "Clear history",
    title: "Records you can stand behind",
    body: "Source data, receipts, business context, and corrections remain organized in a clear, defensible record.",
  },
  {
    eyebrow: "Tax-ready",
    title: "Ready for your CPA",
    body: "When tax season arrives, your summaries, expense detail, documentation, and Schedule C records are already organized for a professional handoff.",
  },
]

const faqs = [
  {
    question: "Does WriteOffs do the bookkeeping for me?",
    answer: "Yes. WriteOffs handles routine bookkeeping when the available information supports a reliable decision. You step in only when your knowledge or judgment is needed.",
  },
  {
    question: "How much time will I need to spend each week?",
    answer: "The goal is a few minutes during a normal week. WriteOffs works in the background and collects necessary questions into one focused Weekly Review.",
  },
  {
    question: "Will I need to categorize every expense?",
    answer: "No. WriteOffs applies the appropriate categories and presents its work clearly. You can inspect or correct anything without maintaining the books transaction by transaction.",
  },
  {
    question: "How do I provide financial data?",
    answer: "WriteOffs is designed to support connected bank and credit-card accounts, CSV transaction files, and PDF statements. Availability may vary during early access.",
  },
  {
    question: "How are receipts handled?",
    answer: "Upload a photo, image, or PDF. WriteOffs preserves the original, extracts useful details, and attempts to match the receipt to the corresponding financial activity.",
  },
  {
    question: "What happens when WriteOffs needs more information?",
    answer: "The question is normally saved for your Weekly Review. You receive a short, clear prompt in business language—not an accounting task to figure out.",
  },
  {
    question: "Who is WriteOffs built for?",
    answer: "WriteOffs is launching first for independent Realtors. General support is intended for other qualifying US Schedule C businesses with straightforward bookkeeping needs.",
  },
  {
    question: "Do I remain in control of my books?",
    answer: "Always. WriteOffs performs the routine work, but you retain final authority over business or personal treatment, categories, splits, and corrections.",
  },
  {
    question: "Does WriteOffs prepare or file tax returns?",
    answer: "No. WriteOffs maintains organized bookkeeping records and prepares CPA handoff materials. Tax-return preparation and filing remain with you or your qualified tax professional.",
  },
]

export default function Page() {
  return (
    <div className="-mx-4 -mb-10 bg-[#fbfcfe] text-[#101828] sm:-mx-6 lg:-mx-8">
      <section className="relative overflow-hidden border-b border-slate-200/80 bg-white">
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          <div className="absolute left-1/2 top-[-28rem] h-[42rem] w-[72rem] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(36,49,134,0.08),rgba(36,49,134,0)_68%)]" />
        </div>

        <div className="relative mx-auto flex min-h-[calc(100vh-4rem)] max-w-7xl items-center px-6 py-24 sm:px-8 sm:py-32 lg:px-12 lg:py-36">
          <div className="mx-auto max-w-5xl text-center">
            <p className="mb-7 text-xs font-semibold uppercase tracking-[0.2em] text-[#243186] sm:text-sm">
              Bookkeeping for independent businesses
            </p>
            <h1 className="text-balance text-5xl font-semibold leading-[0.98] tracking-[-0.045em] text-[#0b1220] sm:text-6xl md:text-7xl lg:text-[5.5rem]">
              Bookkeeping handled.
              <span className="block text-[#243186]">More time for your business.</span>
            </h1>
            <p className="mx-auto mt-8 max-w-3xl text-balance text-lg leading-8 text-slate-600 sm:text-xl sm:leading-9">
              WriteOffs handles your day-to-day bookkeeping in the background—and brings you only the decisions that need your attention.
            </p>
            <p className="mt-5 text-base font-medium text-slate-900 sm:text-lg">
              A few minutes a week. Organized books all year.
            </p>
            <div className="mt-10 flex flex-col items-center gap-4">
              <a
                href="#waitlist"
                className="inline-flex min-h-12 items-center justify-center rounded-full bg-[#243186] px-7 py-3 text-sm font-semibold text-white shadow-[0_10px_30px_rgba(36,49,134,0.18)] transition duration-200 hover:-translate-y-0.5 hover:bg-[#1d2870] focus:outline-none focus:ring-2 focus:ring-[#243186] focus:ring-offset-2"
              >
                Join the Waitlist
              </a>
              <span className="text-sm text-slate-500">
                Launching first for Realtors and qualifying Schedule C businesses.
              </span>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-slate-200/80 bg-[#f6f8fc]">
        <div className="mx-auto max-w-6xl px-6 py-14 text-center sm:px-8 sm:py-[4.5rem] lg:px-12">
          <p className="mx-auto max-w-4xl text-balance text-xl font-medium leading-9 tracking-[-0.015em] text-slate-800 sm:text-2xl sm:leading-10">
            Your financial records deserve care, clarity, and control.
          </p>
          <p className="mx-auto mt-4 max-w-3xl text-base leading-7 text-slate-600 sm:text-lg sm:leading-8">
            WriteOffs preserves your original financial data and documentation, keeps its work transparent, and leaves every final decision with you.
          </p>
        </div>
      </section>

      <section id="how" className="border-b border-slate-200/80 bg-white">
        <div className="mx-auto max-w-7xl px-6 py-24 sm:px-8 sm:py-28 lg:px-12 lg:py-32">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#243186]">A simpler rhythm</p>
            <h2 className="mt-4 text-4xl font-semibold tracking-[-0.035em] text-slate-950 sm:text-5xl">
              How WriteOffs works
            </h2>
          </div>

          <div className="mt-14 grid border-t border-slate-200 md:grid-cols-3">
            {steps.map((step, index) => (
              <article
                key={step.number}
                className={`py-10 md:px-8 md:py-12 ${index > 0 ? "border-t border-slate-200 md:border-l md:border-t-0" : "md:pl-0"}`}
              >
                <span className="font-mono text-xs font-semibold tracking-widest text-[#243186]">{step.number}</span>
                <h3 className="mt-6 text-xl font-semibold tracking-[-0.02em] text-slate-950">{step.title}</h3>
                <p className="mt-4 max-w-sm text-base leading-7 text-slate-600">{step.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="features" className="border-b border-slate-200/80 bg-[#f8fafc]">
        <div className="mx-auto max-w-7xl px-6 py-24 sm:px-8 sm:py-28 lg:px-12 lg:py-32">
          <div className="grid gap-12 lg:grid-cols-[0.75fr_1.25fr] lg:gap-20">
            <div className="lg:sticky lg:top-28 lg:self-start">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#243186]">Built to do the work</p>
              <h2 className="mt-4 text-balance text-4xl font-semibold tracking-[-0.035em] text-slate-950 sm:text-5xl">
                The work gets done. You stay in control.
              </h2>
              <p className="mt-6 max-w-md text-lg leading-8 text-slate-600">
                WriteOffs gives a one-person business the support of a dedicated bookkeeping function—without adding another job to the owner’s week.
              </p>
            </div>

            <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.06)]">
              {values.map((value, index) => (
                <article
                  key={value.title}
                  className={`p-7 sm:p-9 ${index > 0 ? "border-t border-slate-200" : ""}`}
                >
                  <div className="grid gap-3 sm:grid-cols-[9rem_1fr] sm:gap-8">
                    <p className="pt-1 text-xs font-semibold uppercase tracking-[0.14em] text-[#243186]">{value.eyebrow}</p>
                    <div>
                      <h3 className="text-xl font-semibold tracking-[-0.02em] text-slate-950">{value.title}</h3>
                      <p className="mt-3 text-base leading-7 text-slate-600">{value.body}</p>
                    </div>
                  </div>
                </article>
              ))}
              <p className="border-t border-slate-200 bg-slate-50 px-7 py-5 text-sm leading-6 text-slate-500 sm:px-9">
                WriteOffs prepares your bookkeeping records. It does not prepare or file tax returns.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section id="faq" className="border-b border-slate-200/80 bg-white">
        <div className="mx-auto max-w-5xl px-6 py-24 sm:px-8 sm:py-28 lg:px-12 lg:py-32">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#243186]">Questions, answered</p>
            <h2 className="mt-4 text-4xl font-semibold tracking-[-0.035em] text-slate-950 sm:text-5xl">What to expect</h2>
          </div>

          <div className="mt-12 divide-y divide-slate-200 border-y border-slate-200">
            {faqs.map((faq) => (
              <details key={faq.question} className="group py-1">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-6 text-left text-lg font-medium tracking-[-0.015em] text-slate-950 marker:content-none sm:text-xl">
                  {faq.question}
                  <span className="relative h-5 w-5 shrink-0 text-slate-400" aria-hidden="true">
                    <span className="absolute left-0 top-1/2 h-px w-5 bg-current" />
                    <span className="absolute left-1/2 top-0 h-5 w-px bg-current transition-transform duration-200 group-open:rotate-90" />
                  </span>
                </summary>
                <p className="max-w-3xl pb-7 pr-10 text-base leading-7 text-slate-600">{faq.answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section id="about" className="border-b border-slate-200/80 bg-[#f6f8fc]">
        <div className="mx-auto grid max-w-7xl gap-12 px-6 py-24 sm:px-8 sm:py-28 lg:grid-cols-[0.8fr_1.2fr] lg:items-center lg:gap-20 lg:px-12 lg:py-32">
          <div className="relative mx-auto w-full max-w-md lg:mx-0">
            <div className="aspect-[1402/1122] overflow-hidden rounded-[2rem] bg-slate-200 shadow-[0_28px_80px_rgba(15,23,42,0.12)]">
              <Image
                src="/founder-photo.png"
                alt="Rick LaFave, founder of WriteOffs"
                width={720}
                height={900}
                unoptimized
                className="h-full w-full object-contain"
              />
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#243186]">Why WriteOffs</p>
            <h2 className="mt-4 text-balance text-4xl font-semibold tracking-[-0.035em] text-slate-950 sm:text-5xl">
              Built to take bookkeeping off your plate
            </h2>
            <div className="mt-7 space-y-5 text-base leading-7 text-slate-600 sm:text-lg sm:leading-8">
              <p>
                I spent years leading operations in the tax industry and saw firsthand how often business owners reach year-end with incomplete records, missing documentation, and too much cleanup.
              </p>
              <p>
                The problem is not a lack of bookkeeping software. It is that most software still expects the owner to do the bookkeeping.
              </p>
              <p>
                WriteOffs is built on a different premise: the work should already be handled. Your financial activity should be organized throughout the year, your documentation should remain connected to it, and your attention should be reserved for the few decisions that require your judgment.
              </p>
              <p>
                We are starting with independent Realtors—business owners with demanding schedules, recurring expenses, and little time for administrative work.
              </p>
              <p>
                Trust is fundamental. Your records remain yours. WriteOffs will never sell your financial information or use it for advertising.
              </p>
            </div>
            <div className="mt-8 border-t border-slate-300 pt-6">
              <p className="font-semibold text-slate-950">Rick LaFave</p>
              <p className="mt-1 text-sm text-slate-500">Founder, WriteOffs</p>
            </div>
          </div>
        </div>
      </section>

      <section id="waitlist" className="relative overflow-hidden bg-[#111b52] text-white">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(98,116,220,0.24),transparent_54%)]" aria-hidden="true" />
        <div className="relative mx-auto max-w-4xl px-6 py-24 text-center sm:px-8 sm:py-28 lg:px-12 lg:py-32">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-200">Early access</p>
          <h2 className="mt-5 text-balance text-4xl font-semibold tracking-[-0.04em] sm:text-5xl md:text-6xl">
            Put bookkeeping in the background.
          </h2>
          <p className="mx-auto mt-6 max-w-2xl text-balance text-lg leading-8 text-indigo-100">
            Spend a few minutes each week supervising the work—not hours doing it.
          </p>
          <div className="mx-auto mt-8 max-w-2xl rounded-2xl bg-white p-3 text-slate-900 shadow-[0_24px_70px_rgba(0,0,0,0.2)] sm:p-4">
            <WaitlistForm source="landing#waitlist" appearance="landing" />
          </div>
          <p className="mt-6 text-sm text-indigo-200">
            Launching first for Realtors and qualifying Schedule C businesses.
          </p>
        </div>
      </section>

      <footer className="bg-[#0b1238] text-indigo-100">
        <div className="mx-auto flex max-w-7xl flex-col gap-8 px-6 py-10 sm:px-8 md:flex-row md:items-center md:justify-between lg:px-12">
          <p className="text-sm text-indigo-200">© {new Date().getFullYear()} WriteOffs.io. All rights reserved.</p>
          <nav className="flex flex-wrap gap-x-6 gap-y-3 text-sm">
            <Link href="/privacy" className="transition hover:text-white">Privacy</Link>
            <Link href="/legal/terms" className="transition hover:text-white">Terms</Link>
            <Link href="/press" className="transition hover:text-white">Press</Link>
          </nav>
        </div>
      </footer>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-4 py-3 shadow-[0_-8px_30px_rgba(15,23,42,0.08)] backdrop-blur md:hidden">
        <div className="mx-auto flex max-w-md items-center justify-between gap-4">
          <span className="text-sm font-semibold text-slate-900">Bookkeeping handled.</span>
          <a href="#waitlist" className="rounded-full bg-[#243186] px-5 py-2.5 text-sm font-semibold text-white">
            Join the Waitlist
          </a>
        </div>
      </div>
    </div>
  )
}

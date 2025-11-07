// app/page.tsx
"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, type ComponentPropsWithoutRef, type FC, type ReactNode } from "react";
import { motion, type Variants, type MotionProps } from "framer-motion";
import WaitlistForm from "./components/WaitlistForm";
import BuyButton from "./components/BuyButton";

/* =======================
   Framer wrappers (TS-safe, includes className)
======================= */
type MotionDivProps = ComponentPropsWithoutRef<"div"> & MotionProps;
const MotionDiv: FC<MotionDivProps> = (props) => <motion.div {...props} />;

type MotionAProps = ComponentPropsWithoutRef<"a"> & MotionProps;
const MotionA: FC<MotionAProps> = (props) => <motion.a {...props} />;

/* =======================
   Motion Variants
======================= */
const fadeUp: Variants = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: "easeOut" } },
};

const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07 } },
};

/* =======================
   Tiny Accent Underline (static)
======================= */
const Underline = () => (
  <span
    className="mt-2 inline-block h-1 rounded-full"
    style={{ backgroundColor: "#243186" }}
  />
);

/* =======================
   FAQ data (allows JSX answers)
======================= */
type FaqItem = { q: string; a: ReactNode };

const faqs: FaqItem[] = [
  {
    q: "Do I need to connect my bank?",
    a:
      "No. Receipts + classification are enough to stay audit-ready. Bank links (Pro/Pro+) add convenience: we surface likely deductions and nudge you to attach receipts.",
  },
  {
    q: "How many accounts can I link?",
    a:
      "Pro includes up to 3 linked accounts. Pro+ includes up to 6. You can add more as an add-on later.",
  },
  {
    q: "Do I still need receipts if I connect my bank?",
    a:
      "Yes. Bank data shows that you spent, not why. The IRS wants receipts. We make it painless to attach and store them.",
  },
  {
    q: "How do I import older transactions beyond what my bank provides?",
    a: (
      <>
        Upload a CSV for any dates you need—no extra charge. We’ll map your columns, validate rows,
        and skip duplicates.{" "}
        <a
          href="/templates/writeoffs_csv_template.csv"
          download
          className="font-semibold underline"
          style={{ color: "#243186" }}
        >
          Download the CSV template
        </a>
        .
      </>
    ),
  },
  {
    q: "How many questions can I ask the bot?",
    a: "Starter 15/month, Pro 50/month, Pro+ 150/month. Caps reset monthly.",
  },
];

export default function Page() {
  /* Pricing toggle — default MONTHLY */
  const [annual, setAnnual] = useState(false);

  // Stripe price ids (NEXT_PUBLIC_* get inlined at build)
  const PRICES = {
    starterMonthly: process.env.NEXT_PUBLIC_STRIPE_PRICE_STARTER_MONTHLY as string,
    starterAnnual: process.env.NEXT_PUBLIC_STRIPE_PRICE_STARTER_ANNUAL as string,
    proMonthly: process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO_MONTHLY as string,
    proAnnual: process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO_ANNUAL as string,
    proPlusMonthly: process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO_PLUS_MONTHLY as string,
    proPlusAnnual: process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO_PLUS_ANNUAL as string,
  };

  return (
    <main className="relative bg-white">
      {/* ====================== HERO ====================== */}
      <section id="home" className="border-b border-neutral-200">
        <div className="relative">
          {/* Ambient background (static) */}
          <div
            aria-hidden={true}
            className="pointer-events-none absolute inset-0 -z-10 hidden md:block"
            style={{
              background:
                "radial-gradient(1200px 600px at 15% -10%, rgba(36,49,134,0.12), transparent), radial-gradient(1400px 600px at 85% -20%, rgba(36,49,134,0.08), transparent)",
              backgroundSize: "200% 200%",
            }}
          />

          {/* Bigger hero */}
          <div className="mx-auto grid min-h-[70vh] max-w-7xl grid-cols-1 items-center gap-10 px-4 pt-10 pb-14 sm:px-6 md:min-h-screen md:grid-cols-2 md:gap-14 md:pt-16 md:pb-24">
            {/* LEFT — Hero copy */}
            <div>
              <h1 className="mt-0 text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl md:text-6xl">
                The easiest way to capture, classify, and claim your Write-Offs.
              </h1>

              <p className="mt-5 max-w-3xl text-base text-neutral-700 sm:text-lg">
                Keep more of what’s yours with <strong>Write-Offs.io</strong>.
                Snap a receipt and we’ll walk you through the deduction
                step-by-step.
              </p>

              <p className="mt-3 max-w-3xl text-sm text-neutral-700 sm:text-base">
                Not sure it’s deductible? Coming soon:{" "}
                <strong>Ask Write-Offs™</strong> — our AI-powered tax pro that
                helps you know what qualifies before tax season ever starts.
              </p>
            </div>

            {/* RIGHT — hero image */}
            <MotionDiv
              initial={{ opacity: 0, scale: 0.985 }}
              animate={{
                opacity: 1,
                scale: 1,
                transition: { duration: 0.8, ease: "easeOut" },
              }}
              className="mx-auto w-full max-w-[680px]"
            >
              <div className="overflow-hidden rounded-3xl border border-neutral-200 bg-white shadow-card">
                <Image
                  src="/media/three-steps.png"
                  alt="3 Steps To A Write-Off — Receipt Capture, Guided Classification, Export for Tax Return"
                  width={2200}
                  height={1238}
                  priority
                  sizes="(max-width: 640px) 100vw, (max-width: 1200px) 90vw, 900px"
                  className="block h-auto w-full object-cover"
                />
              </div>
            </MotionDiv>
          </div>
        </div>
      </section>

      {/* ====================== HOW YOU’LL USE IT ====================== */}
      <section id="how" className="border-b border-neutral-200">
        <MotionDiv
          className="mx-auto max-w-7xl px-4 py-10 sm:px-6 md:py-14"
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.15 }}
          variants={stagger}
        >
          <MotionDiv variants={fadeUp}>
            <h2
              className="text-center text-lg font-semibold sm:text-xl"
              style={{ color: "#243186" }}
            >
              How You’ll Use It
              <Underline />
            </h2>
          </MotionDiv>

          <div className="mx-auto mt-5 grid max-w-4xl grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
            {[
              {
                step: "1",
                title: "You upload the pic.",
                body: "Email-in or upload a receipt photo—easy.",
              },
              {
                step: "2",
                title: "We Classify the Deduction",
                body:
                  "We walk you through any needed info to classify the expense.",
              },
              {
                step: "3",
                title: "Export for Tax Return",
                body:
                  "Simple one-click file ready to complete your tax return.",
              },
            ].map((s) => (
              <MotionDiv
                key={s.step}
                variants={fadeUp}
                whileHover={{
                  y: -3,
                  boxShadow: "0 12px 28px rgba(2,6,23,0.12)",
                }}
                className="rounded-2xl border border-neutral-200 bg-white p-4 text-center shadow-card md:p-5"
              >
                <div
                  className="mx-auto mb-2 inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold text-white"
                  style={{ backgroundColor: "#8CC54E" }}
                >
                  {s.step}
                </div>
                <div className="text-[15px] font-semibold text-neutral-900">
                  {s.title}
                </div>
                <div className="mt-1 text-[13px] text-neutral-700">{s.body}</div>
              </MotionDiv>
            ))}
          </div>
        </MotionDiv>
      </section>

      {/* ====================== FEATURES ====================== */}
      <section id="features" className="border-b border-neutral-200">
        <MotionDiv
          className="mx-auto max-w-7xl px-4 py-10 sm:px-6 md:py-14"
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.18 }}
          variants={stagger}
        >
          <MotionDiv variants={fadeUp}>
            <h2
              className="text-center text-lg font-semibold sm:text-xl"
              style={{ color: "#243186" }}
            >
              Features
              <Underline />
            </h2>
          </MotionDiv>

          <div className="mx-auto mt-6 grid max-w-6xl grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
            {[
              {
                title: "Suggest Likely Write-Offs",
                body:
                  "We highlight likely deductions with clear, human-readable reasons.",
              },
              {
                title: "Receipts + OCR",
                body: "Snap, email-in, or upload. We read totals, dates, vendors.",
              },
              {
                title: "Mileage Tracker",
                body: "Manual trips at launch. IRS-compliant logs.",
              },
              {
                title: "Ask Write-Offs™",
                body:
                  "Ask if something is a <span>Write-Off</span>. Get confident, contextual answers.",
              },
              {
                title: "Tax Return Ready",
                body:
                  "One-click CSV + receipt ZIP — clean package for your return.",
              },
              {
                title: "Audit-Ready Storage",
                body:
                  "Timestamps, originals, organized records for peace of mind.",
              },
            ].map((f) => (
              <MotionDiv
                key={f.title}
                variants={fadeUp}
                whileHover={{ y: -4, boxShadow: "0 16px 36px rgba(2,6,23,0.14)" }}
                className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-card"
                style={{
                  background:
                    "linear-gradient(180deg, rgba(140,197,78,0.06), rgba(255,255,255,0.0) 45%)",
                }}
              >
                <div
                  className="text-base font-semibold text-neutral-900"
                  dangerouslySetInnerHTML={{ __html: f.title }}
                />
                <div
                  className="mt-2 text-sm text-neutral-700"
                  dangerouslySetInnerHTML={{ __html: f.body }}
                />
              </MotionDiv>
            ))}
          </div>
        </MotionDiv>
      </section>

      {/* ====================== PRICING ====================== */}
      <section id="pricing" className="border-b border-neutral-200">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 md:py-14">
          <h2
            className="text-center text-lg font-semibold sm:text-xl"
            style={{ color: "#243186" }}
          >
            Pricing
            <Underline />
          </h2>

          {/* Billing Toggle */}
          <div className="mx-auto mt-4 flex w-full max-w-md items-center justify-center gap-3">
            <span className={!annual ? "font-semibold" : ""}>Monthly</span>
            <button
              onClick={() => setAnnual(!annual)}
              className="relative inline-flex h-7 w-14 items-center rounded-full bg-gray-200 transition"
              aria-label="Toggle billing interval"
            >
              <span
                className={`inline-block h-6 w-6 transform rounded-full bg-white shadow transition ${
                  annual ? "translate-x-7" : "translate-x-1"
                }`}
              />
            </button>
            <span className={annual ? "font-semibold" : ""}>
              Annual <span className="text-xs text-green-600">(save ~15%)</span>
            </span>
          </div>

          {/* 3 tiers: Starter / Pro / Pro+ */}
          <div className="mx-auto mt-6 grid max-w-6xl grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3">
            {/* Starter */}
            <div className="rounded-2xl border border-neutral-200 bg-white p-6 text-center shadow-card">
              <div className="text-lg font-semibold text-neutral-900">Starter</div>
              <div className="mt-2 text-3xl">
                {annual ? "$89" : "$9"}
                <span className="ml-1 text-base text-neutral-600">
                  /{annual ? "yr" : "mo"}
                </span>
              </div>
              <ul className="mx-auto mt-4 max-w-[18rem] space-y-2 text-left text-sm text-neutral-700">
                <li>• Manual & OCR receipts</li>
                <li>• Ask Write-Offs™: 15 Qs/mo</li>
                <li>• CSV + receipt ZIP export</li>
                <li>• No bank connections</li>
                <li>• Backfill window: 30 days</li>
              </ul>

              <BuyButton
                priceId={annual ? PRICES.starterAnnual : PRICES.starterMonthly}
                className="mt-6 inline-block w-full rounded-xl px-4 py-2 font-semibold text-white shadow-card"
              >
                Get started
              </BuyButton>
            </div>

            {/* Pro (highlight) */}
            <div className="rounded-2xl border border-blue-600 bg-white p-6 text-center shadow">
              <div className="text-lg font-semibold text-neutral-900">Pro</div>
              <div className="mt-2 text-3xl">
                {annual ? "$139" : "$14"}
                <span className="ml-1 text-base text-neutral-600">
                  /{annual ? "yr" : "mo"}
                </span>
              </div>
              <ul className="mx-auto mt-4 max-w-[18rem] space-y-2 text-left text-sm text-neutral-700">
                <li>• Link up to 3 accounts (Teller)</li>
                <li>• Category suggestions + mileage tracker</li>
                <li>• Unlimited receipts</li>
                <li>• Ask Write-Offs™: 50 Qs/mo</li>
                <li>• Backfill window: 90 days</li>
              </ul>

              <BuyButton
                priceId={annual ? PRICES.proAnnual : PRICES.proMonthly}
                className="mt-6 inline-block w-full rounded-xl px-4 py-2 font-semibold text-white shadow-card"
              >
                Get started
              </BuyButton>
            </div>

            {/* Pro+ */}
            <div className="rounded-2xl border border-neutral-200 bg-white p-6 text-center shadow-card">
              <div className="text-lg font-semibold text-neutral-900">Pro+</div>
              <div className="mt-2 text-3xl">
                {annual ? "$219" : "$24"}
                <span className="ml-1 text-base text-neutral-600">
                  /{annual ? "yr" : "mo"}
                </span>
              </div>
              <ul className="mx-auto mt-4 max-w-[18rem] space-y-2 text-left text-sm text-neutral-700">
                <li>• Link up to 6 accounts (Teller)</li>
                <li>• Advanced rules & vertical packs</li>
                <li>• Priority support</li>
                <li>• Ask Write-Offs™: 150 Qs/mo</li>
                <li>• Backfill window: 365 days</li>
              </ul>

              <BuyButton
                priceId={annual ? PRICES.proPlusAnnual : PRICES.proPlusMonthly}
                className="mt-6 inline-block w-full rounded-xl px-4 py-2 font-semibold text-white shadow-card"
              >
                Get started
              </BuyButton>
            </div>
          </div>

          <p className="mx-auto mt-4 max-w-3xl text-center text-xs text-neutral-600">
            Bank connections use <span className="font-medium">Teller</span>. Backfill limits apply by plan. Older history is free via CSV upload.
          </p>

          <p className="mx-auto mt-1 max-w-3xl text-center text-xs text-neutral-600">
            Ask Write-Offs™ usage caps by plan: 15 / 50 / 150 questions per month.
          </p>
        </div>
      </section>

      {/* ====================== FAQ ====================== */}
      <section id="faq" className="border-b border-neutral-200">
        <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 md:py-14">
          <h2
            className="text-center text-lg font-semibold sm:text-xl"
            style={{ color: "#243186" }}
          >
            FAQ
            <Underline />
          </h2>

          <div className="mx-auto mt-6 grid max-w-4xl grid-cols-1 gap-4">
            {faqs.map((item) => (
              <details
                key={item.q}
                className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-card open:shadow"
              >
                <summary className="cursor-pointer list-none text-base font-semibold text-neutral-900">
                  {item.q}
                </summary>
                <div className="mt-2 text-sm text-neutral-700">{item.a}</div>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ====================== ABOUT ====================== */}
      <section id="about" className="border-b border-neutral-200">
        <MotionDiv
          className="mx-auto max-w-7xl px-4 py-10 sm:px-6 md:py-14"
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.2 }}
          variants={stagger}
        >
          <MotionDiv variants={fadeUp}>
            <h2
              className="text-center text-lg font-semibold sm:text-xl"
              style={{ color: "#243186" }}
            >
              About Write-Offs.io
              <Underline />
            </h2>
          </MotionDiv>

          <MotionDiv
            variants={fadeUp}
            className="mx-auto mt-6 grid max-w-4xl grid-cols-1 items-center gap-6 rounded-2xl border border-neutral-200 bg-white p-6 shadow-card md:grid-cols-[180px,1fr]"
          >
            {/* Founder photo */}
            <div className="mx-auto h-48 w-48 overflow-hidden rounded-2xl border border-neutral-200 md:mx-0">
              <Image
                src="/media/founder.jpg"
                alt="Rick LaFave, Founder of Write-Offs.io"
                width={720}
                height={720}
                className="h-full w-full object-cover"
                style={{ filter: "grayscale(0%)" }}
              />
            </div>

            {/* Founder note */}
            <div>
              <div className="text-lg font-semibold text-neutral-900">
                Rick LaFave
              </div>
              <div className="text-sm text-neutral-600">
                Founder, Write-Offs.io
              </div>

              <p className="mt-3 text:[15px] text-neutral-800">
                I’ve worked in financial services since college—starting in
                banking and moving into tax in 2008. Along the way I saw too
                many small businesses show up under-prepared, and I suspect many
                left <span>Write-Offs</span> on the table.
              </p>

              <p className="mt-3 text-[15px] text-neutral-800">
                We’re starting with the essentials:{" "}
                <strong>receipt capture</strong>,{" "}
                <strong>classification</strong>, and a clean{" "}
                <strong>export for your tax return</strong>. Next, we’ll roll
                out secure integrations to reduce manual work.
              </p>

              <p className="mt-3 text-[15px] text-neutral-800">
                Trust is non-negotiable.{" "}
                <strong>We will never sell or share your data.</strong> We don’t
                make money from your information—Write-Offs.io exists to help
                you keep more of what you earn.
              </p>

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <a
                  href="#waitlist"
                  className="rounded-xl px-4 py-2 text-sm font-semibold text-white shadow-card"
                  style={{ backgroundColor: "#243186" }}
                >
                  Join the waitlist
                </a>
                <Link
                  href="/press"
                  className="rounded-xl border px-4 py-2 text-sm font-semibold"
                  style={{ borderColor: "#243186", color: "#243186" }}
                >
                  Media kit &amp; contact
                </Link>
              </div>

              <div className="mt-6 border-t border-neutral-200 pt-3 text-sm text-neutral-700">
                — Rick LaFave
              </div>
            </div>
          </MotionDiv>
        </MotionDiv>
      </section>

      {/* ====================== BLOG TEASERS ====================== */}
      <section id="blog" className="border-b border-neutral-200">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 md:py-14">
          <h2
            className="text-center text-lg font-semibold sm:text-xl"
            style={{ color: "#243186" }}
          >
            From the Blog
            <Underline />
          </h2>

          <div className="mx-auto mt-6 grid max-w-6xl grid-cols-1 gap-6 text-left md:grid-cols-2">
            {[
              {
                href: "/blog/gig-driver-deductions",
                title: "Overlooked Tax Deductions for Gig Drivers",
                blurb: "Checklist to avoid leaving money on the table.",
              },
              {
                href: "/blog/home-office-deduction-guide",
                title: "Home Office Deduction Guide",
                blurb:
                  "When it often applies, simplified vs. actual, and records to keep.",
              },
              {
                href: "/blog/year-end-write-off-checklist",
                title: "Year-End Write-Off Checklist",
                blurb:
                  "Tidy records, lock deductions, and prep for Schedule C.",
              },
            ].map((p) => (
              <MotionA
                key={p.href}
                href={p.href}
                whileHover={{ y: -3, boxShadow: "0 12px 28px rgba(2,6,23,0.12)" }}
                className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-card transition"
              >
                <div className="text-base font-semibold text-neutral-900">
                  {p.title}
                </div>
                <div className="mt-1 text-sm text-neutral-700">{p.blurb}</div>
                <div
                  className="mt-3 text-sm font-medium"
                  style={{ color: "#243186" }}
                >
                  Read →
                </div>
              </MotionA>
            ))}
          </div>

          <div className="mt-8 text-center">
            <Link
              href="/blog"
              className="inline-block rounded-xl border px-4 py-2 text-sm font-semibold"
              style={{ borderColor: "#243186", color: "#243186" }}
            >
              See all posts
            </Link>
          </div>
        </div>
      </section>

      {/* ====================== WAITLIST ====================== */}
      <section id="waitlist" className="border-b border-neutral-200">
        <div className="mx-auto max-w-7xl px-4 py-10 text-center sm:px-6 md:py-14">
          <h2
            className="text-lg font-semibold sm:text-xl"
            style={{ color: "#243186" }}
          >
            Join the Waitlist
            <Underline />
          </h2>
          <p className="mt-1 text-neutral-700">
            Drop your email. We’ll invite the first 50 to the private beta.
          </p>
          <WaitlistForm source="landing#waitlist" />
        </div>
      </section>

      {/* ====================== Sticky Mobile CTA ====================== */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-neutral-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/70 md:hidden">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3">
          <span className="text-sm font-semibold text-neutral-800">
            Get early access
          </span>
          <a
            href="#waitlist"
            className="ml-auto inline-flex rounded-xl px-4 py-2 text-sm font-bold text-white"
            style={{ backgroundColor: "#243186" }}
          >
            Join waitlist
          </a>
        </div>
      </div>
    </main>
  );
}


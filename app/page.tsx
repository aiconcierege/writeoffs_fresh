import Image from "next/image"
import Link from "next/link"
import WaitlistForm from "./components/WaitlistForm"
import { BettiIllustration } from "./components/BettiIllustration"
import { PublicFooter } from "./components/PublicFooter"

const steps = [
  {
    number: "01",
    title: "Send it over",
    body: "Share activity from the accounts you use for business and send over your receipts.",
  },
  {
    number: "02",
    title: "WriteOffs works",
    body: "Your activity is organized and your documentation stays connected—without a pile of bookkeeping tasks for you.",
  },
  {
    number: "03",
    title: "Answer only when needed",
    body: "If something depends on a fact only you know, WriteOffs asks one clear question and keeps moving.",
  },
]

const outcomes = [
  ["Know where you stand", "See the business records WriteOffs is handling without building your own reports."],
  ["Keep the proof together", "Receipts and supporting documents stay organized with the activity they explain."],
  ["Skip the busywork", "Stop spending your evenings sorting transactions into accounting categories."],
  ["Be ready for tax time", "Your records stay clean and organized for you or your tax professional."],
] as const

export default function Page() {
  return (
    <div className="public-site -mx-4 -mb-10 overflow-hidden bg-[#fffaf3] text-[#17211d] sm:-mx-6 lg:-mx-8">
      <section className="relative overflow-hidden bg-[#fff8ee]">
        <div className="relative mx-auto grid max-w-[90rem] lg:min-h-[36rem] lg:grid-cols-[1.08fr_0.92fr] xl:min-h-[39rem]">
          <div className="relative z-10 flex items-center px-6 py-12 sm:px-10 sm:py-16 lg:px-16 lg:py-14 xl:px-24">
            <div className="max-w-[43rem]">
              <p className="mb-6 inline-flex items-center gap-3 text-sm font-semibold text-[#176c54]">
                <span className="h-2.5 w-2.5 rounded-full bg-[#00b889]" aria-hidden="true" />
                Bookkeeping for the self-employed
              </p>
              <h1
                aria-label="You run your business. WriteOffs handles the books."
                className="text-[2.8rem] font-semibold leading-[0.98] tracking-[-0.052em] text-[#15221d] sm:text-[3.5rem] lg:text-[3.9rem] xl:text-[4.25rem]"
              >
                <span className="block">You run your</span>
                <span className="block">business.</span>
                <span className="mt-2 block text-[#243186]">WriteOffs handles</span>
                <span className="block text-[#243186]">the books.</span>
              </h1>
              <p className="mt-6 max-w-xl text-base leading-7 text-[#4f5d56] sm:text-lg sm:leading-8">
                Share your business activity and send us your receipts. WriteOffs organizes the records, keeps your documentation together, and asks for your help only when it needs a fact from you.
              </p>
              <div className="mt-7 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
                <a
                  href="#waitlist"
                  className="inline-flex min-h-13 items-center justify-center rounded-xl bg-[#243186] px-7 py-3.5 text-base font-semibold text-white shadow-[0_12px_28px_rgba(36,49,134,0.2)] transition hover:-translate-y-0.5 hover:bg-[#1d2870] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#243186]"
                >
                  Join the waitlist
                </a>
                <a href="#how" className="text-sm font-semibold text-[#243186] underline decoration-[#9ca8dc] decoration-2 underline-offset-4 transition hover:decoration-[#243186]">
                  See how it works
                </a>
              </div>
              <p className="mt-4 text-xs text-[#68756e] sm:text-sm">Early access for U.S. independent business owners.</p>
            </div>
          </div>

          <div className="relative min-h-[24rem] sm:min-h-[31rem] lg:-ml-14 lg:min-h-0 lg:[clip-path:polygon(12%_0,100%_0,100%_100%,0_100%)] xl:-ml-20">
            <Image
              src="/writeoffs-business-owner-hero.png"
              alt="An independent contractor planning a project in her workshop"
              fill
              priority
              sizes="(max-width: 1023px) 100vw, 48vw"
              className="object-cover object-[72%_center] lg:object-[58%_center]"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#17211d]/25 via-transparent to-transparent" aria-hidden="true" />
            <div className="absolute bottom-5 left-5 right-5 max-w-sm rounded-2xl bg-white/92 p-4 shadow-[0_18px_45px_rgba(23,33,29,0.18)] backdrop-blur sm:bottom-7 sm:left-7 sm:p-5 lg:bottom-8 lg:left-8">
              <p className="text-sm font-semibold text-[#17211d]">
                The best bookkeeping task<span className="text-[#178368]">?</span>
              </p>
              <p className="mt-1 text-xl font-semibold tracking-[-0.025em] text-[#17211d]">The one already handled.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-[#193f35] text-white">
        <div className="mx-auto grid max-w-7xl gap-6 px-6 py-8 sm:grid-cols-3 sm:px-10 sm:py-9 lg:px-16">
          {[
            ["Less admin", "More time for the work that pays you."],
            ["Clear records", "Activity and documentation kept together."],
            ["Calm tax time", "Organized books ready for preparation."],
          ].map(([title, body], index) => (
            <div key={title} className={index ? "border-t border-white/20 pt-8 sm:border-l sm:border-t-0 sm:pl-8 sm:pt-0" : ""}>
              <p className="text-lg font-semibold">{title}</p>
              <p className="mt-2 max-w-xs text-sm leading-6 text-[#cde4da]">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="how" className="bg-[#fffaf3]">
        <div className="mx-auto max-w-7xl px-6 py-16 sm:px-10 sm:py-20 lg:px-16 lg:py-24">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold text-[#178368]">How it works</p>
            <h2 className="mt-4 text-balance text-4xl font-semibold tracking-[-0.045em] text-[#17211d] sm:text-5xl">
              Hand off the books. Get back to business.
            </h2>
          </div>
          <div className="mt-11 grid gap-9 lg:grid-cols-3 lg:gap-0">
            {steps.map((step, index) => (
              <article key={step.number} className={`relative ${index ? "lg:border-l lg:border-[#cfd8d2] lg:pl-10" : "lg:pr-10"} ${index === 1 ? "rounded-[1.5rem] border-0 bg-[#e5f3e7] px-6 py-6 shadow-[0_20px_48px_rgba(23,83,62,.11)] lg:-my-7 lg:mx-6 lg:border-0 lg:px-8 lg:py-8" : ""}`}>
                <span className="font-mono text-sm font-semibold text-[#178368]">{step.number}</span>
                <h3 className="mt-5 text-2xl font-semibold tracking-[-0.03em]">{step.title}</h3>
                <p className="mt-3 max-w-sm text-base leading-7 text-[#59665f]">{step.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="betti-landing-section relative z-10 overflow-visible bg-[#193f35] text-white" aria-labelledby="meet-betti-heading">
        <div className="mx-auto grid max-w-7xl overflow-visible px-6 sm:px-10 lg:grid-cols-[0.72fr_1.28fr] lg:items-center lg:px-16">
          <div className="betti-landing-art relative order-2 h-72 overflow-visible sm:h-80 lg:order-1 lg:h-[25rem]">
            <div className="absolute -bottom-32 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-[#8ce6cb]/15 blur-2xl" aria-hidden="true"/>
            <BettiIllustration state="welcome" decorative sizes="(max-width: 1023px) 18rem, 24rem" className="absolute -bottom-14 left-1/2 w-[18rem] max-w-none -translate-x-1/2 drop-shadow-[0_24px_28px_rgba(0,0,0,.22)] sm:-bottom-16 sm:w-[21rem] lg:-bottom-20 lg:w-[24rem]"/>
          </div>
          <div className="order-1 pt-14 sm:pt-16 lg:order-2 lg:py-20 lg:pl-12">
            <p className="text-sm font-semibold text-[#8ce6cb]">Meet Betti the Bookkeeper</p>
            <h2 id="meet-betti-heading" className="mt-4 max-w-2xl text-balance text-4xl font-semibold tracking-[-0.045em] sm:text-5xl">She’s already working.</h2>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-[#cde4da]">Betti is the careful bookkeeper inside WriteOffs—organizing the activity, connecting the proof, and bringing you only the facts she genuinely needs.</p>
            <p className="mt-5 max-w-xl text-sm font-semibold leading-6 text-white">WriteOffs does the books. You keep running the business.</p>
          </div>
        </div>
      </section>

      <section id="features" className="relative z-0 overflow-hidden bg-[#e9f5ef]">
        <div className="absolute -left-28 top-16 h-72 w-72 rounded-full bg-[#9ce0c8]/30 blur-3xl" aria-hidden="true" />
        <div className="relative mx-auto grid max-w-7xl gap-12 px-6 py-16 sm:px-10 sm:py-20 lg:grid-cols-[0.82fr_1.18fr] lg:items-start lg:gap-20 lg:px-16 lg:py-24">
          <div className="lg:sticky lg:top-28">
            <p className="text-sm font-semibold text-[#176c54]">What you get</p>
            <h2 className="mt-4 text-balance text-4xl font-semibold tracking-[-0.045em] text-[#17211d] sm:text-5xl">
              Everything under control. Without doing it all yourself.
            </h2>
            <p className="mt-6 max-w-md text-lg leading-8 text-[#53635b]">
              WriteOffs works like a capable member of your team—quietly taking care of the records and bringing you only what truly needs your input.
            </p>
          </div>
          <div className="grid gap-x-10 gap-y-10 sm:grid-cols-2 sm:pt-2">
            {outcomes.map(([title, body], index) => (
              <article key={title} className={index % 2 ? "sm:translate-y-10" : ""}>
                <span className={`block text-4xl font-semibold tracking-[-0.05em] ${index === 1 || index === 2 ? "text-[#243186]" : "text-[#178368]"}`} aria-hidden="true">
                  0{index + 1}
                </span>
                <h3 className="text-xl font-semibold tracking-[-0.025em] text-[#17211d]">{title}</h3>
                <p className="mt-3 max-w-xs text-base leading-7 text-[#53635b]">{body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="for-you" className="bg-[#243186] text-white">
        <div className="mx-auto max-w-7xl px-6 py-16 sm:px-10 sm:py-20 lg:px-16">
          <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-end lg:gap-20">
            <div>
              <p className="text-sm font-semibold text-[#8ce6cb]">Built for independent business</p>
              <h2 className="mt-4 text-balance text-4xl font-semibold tracking-[-0.045em] sm:text-5xl">
                Your craft is the business. Bookkeeping shouldn’t be.
              </h2>
            </div>
            <div>
              <p className="max-w-2xl text-lg leading-8 text-[#d9def8]">
                For contractors, photographers, consultants, creators, home-service pros, and other one-person businesses who would rather serve customers than manage accounting software.
              </p>
              <div className="mt-7 flex flex-wrap gap-x-7 gap-y-3 text-sm font-semibold text-white/90" aria-label="Businesses WriteOffs is made for">
                <span>Hands-on trades</span><span>Creative work</span><span>Professional services</span><span>Independent experts</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-[#fffaf3]">
        <div className="mx-auto grid max-w-7xl gap-7 px-6 py-12 sm:px-10 sm:py-14 lg:grid-cols-[1fr_auto] lg:items-center lg:px-16">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold text-[#178368]">Built on trust</p>
            <h2 className="mt-4 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">Your records stay yours.</h2>
            <p className="mt-4 text-base leading-7 text-[#59665f] sm:text-lg sm:leading-8">
              WriteOffs preserves the original financial activity and documentation behind its work. It prepares organized bookkeeping records; it does not prepare or file tax returns.
            </p>
          </div>
          <Link href="/legal/privacy" className="text-sm font-semibold text-[#243186] underline decoration-[#9ca8dc] decoration-2 underline-offset-4">Read our privacy policy</Link>
        </div>
      </section>

      <section id="waitlist" className="relative overflow-hidden bg-[#15221d] text-white">
        <div className="absolute -right-32 -top-32 h-96 w-96 rounded-full bg-[#00b889]/20 blur-3xl" aria-hidden="true" />
        <div className="relative mx-auto max-w-5xl px-6 py-16 text-center sm:px-10 sm:py-20 lg:py-24">
          <p className="text-sm font-semibold text-[#8ce6cb]">Join early access</p>
          <h2 className="mx-auto mt-4 max-w-4xl text-balance text-4xl font-semibold tracking-[-0.05em] sm:text-5xl lg:text-6xl">
            Run your business. Leave the books to WriteOffs.
          </h2>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-[#c8d9d1]">
            Join the waitlist to hear when WriteOffs is ready for your business.
          </p>
          <div className="mx-auto mt-8 max-w-2xl rounded-2xl bg-[#fffaf3] p-3 text-[#17211d] shadow-[0_24px_70px_rgba(0,0,0,0.24)] sm:p-4">
            <WaitlistForm source="landing#waitlist" appearance="landing" />
          </div>
          <p className="mt-5 text-sm text-[#9fb8ad]">We’ll share thoughtful updates as early access opens.</p>
        </div>
      </section>

      <PublicFooter/>

    </div>
  )
}

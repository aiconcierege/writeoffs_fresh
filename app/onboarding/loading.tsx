export default function OnboardingLoading() {
  return (
    <section className="mx-auto max-w-2xl py-8 sm:py-12" aria-label="Loading onboarding">
      <div className="mb-5 h-2 overflow-hidden rounded-full bg-slate-200">
        <div className="h-full w-1/4 animate-pulse rounded-full bg-[#00d0a6]" />
      </div>
      <div className="card animate-pulse p-5 sm:p-8">
        <div className="h-4 w-24 rounded bg-slate-200" />
        <div className="mt-5 h-8 w-3/4 rounded bg-slate-200" />
        <div className="mt-3 h-4 w-full rounded bg-slate-100" />
        <div className="mt-8 h-12 w-full rounded-xl bg-slate-100" />
        <div className="mt-4 h-12 w-full rounded-xl bg-slate-100" />
      </div>
    </section>
  )
}

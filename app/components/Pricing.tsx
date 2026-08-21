// app/components/Pricing.tsx
export default function Pricing() {
  const plans = [
    {
      name: "Starter",
      price: "$9",
      period: "/mo",
      features: [
        "Manual & OCR receipts",
        "Ask Write-Offs™: 15 Qs/mo",
        "CSV + receipt ZIP export",
        "No bank connections",
        "Backfill window: 30 days",
      ],
      cta: "Get started",
      highlighted: false,
    },
    {
      name: "Pro",
      price: "$14",
      period: "/mo",
      features: [
        "Link up to 3 financial accounts",
        "Category suggestions + mileage tracker",
        "Unlimited receipts",
        "Ask Write-Offs™: 50 Qs/mo",
        "Backfill window: 90 days",
      ],
      cta: "Get started",
      highlighted: true,
    },
    {
      name: "Pro+",
      price: "$24",
      period: "/mo",
      features: [
        "Link up to 6 financial accounts",
        "Advanced bookkeeping support",
        "Priority support",
        "Ask Write-Offs™: 150 Qs/mo",
        "Backfill window: 365 days",
      ],
      cta: "Get started",
      highlighted: false,
    },
  ];

  return (
    <section id="pricing" className="py-16">
      <div className="mx-auto max-w-6xl px-4">
        <h2 className="mb-8 text-center text-3xl font-bold">Pricing</h2>

        <div className="mb-8 flex items-center justify-center gap-3 text-sm">
          <span className="opacity-70">Monthly</span>
          <span className="opacity-40">/</span>
          <span className="opacity-70">
            Annual <span className="text-emerald-600">(save ~15%)</span>
          </span>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {plans.map((p) => (
            <div
              key={p.name}
              className={`rounded-2xl border p-6 shadow-sm ${
                p.highlighted ? "border-indigo-300 ring-2 ring-indigo-200" : "border-zinc-200"
              }`}
            >
              <div className="mb-2 text-sm font-medium opacity-80">{p.name}</div>
              <div className="mb-4 flex items-end gap-1">
                <div className="text-4xl font-bold">{p.price}</div>
                <div className="pb-1 text-sm opacity-70">{p.period}</div>
              </div>

              <ul className="mb-6 space-y-2 text-sm">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <span className="mt-0.5 inline-block h-1.5 w-1.5 flex-none rounded-full bg-current opacity-60" />
                    <span className="opacity-90">{f}</span>
                  </li>
                ))}
              </ul>

              <button className="w-full rounded-xl bg-indigo-700 px-4 py-2.5 text-white hover:bg-indigo-800">
                {p.cta}
              </button>
            </div>
          ))}
        </div>

        <p className="mt-6 text-center text-xs opacity-70">
          Secure bank connections are available in supported environments. Backfill limits apply by plan.
          Older history is free via CSV upload.
        </p>
      </div>
    </section>
  );
}

// components/ArticleCTA.tsx
import Link from "next/link";

export default function ArticleCTA() {
  return (
    <div className="mt-12 rounded-2xl border border-surface-border bg-white p-6 shadow-card">
      <h2 className="text-xl font-bold text-surface-ink">Ready to simplify your write-offs?</h2>
      <p className="mt-2 text-surface-muted text-sm">
        Join the WriteOffs.io waitlist today and start organizing your deductions.
      </p>
      <Link
        href="/#waitlist"
        className="mt-4 inline-block rounded-full bg-brand px-5 py-3 text-sm font-semibold text-white hover:opacity-90 focus-visible:ring-2 ring-brand"
      >
        Join the waitlist
      </Link>
    </div>
  );
}

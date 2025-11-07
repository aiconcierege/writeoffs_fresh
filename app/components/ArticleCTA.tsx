// /app/components/ArticleCTA.tsx
import Link from "next/link";

export default function ArticleCTA({
  title = "Make write-offs easier.",
  subtitle = "Join the WriteOffs.io private beta to try receipt capture, Q&A, and clean exports.",
  href = "/#waitlist",
  cta = "Join the waitlist",
}: {
  title?: string;
  subtitle?: string;
  href?: string;
  cta?: string;
}) {
  return (
    <aside className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-card">
      <div className="text-lg font-semibold">{title}</div>
      <p className="mt-1 text-sm text-neutral-700">{subtitle}</p>
      <Link
        href={href}
        className="mt-4 inline-block rounded-xl px-4 py-2 font-semibold text-white shadow-card bg-[#2563EB] hover:bg-[#1D4ED8]"
      >
        {cta}
      </Link>
    </aside>
  );
}

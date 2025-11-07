// /app/blog/page.tsx
import Link from "next/link";

const posts = [
  {
    href: "/blog/gig-driver-deductions",
    title: "Overlooked Tax Deductions for Gig Drivers",
    blurb: "A short checklist so drivers don’t leave money on the table.",
  },
  {
    href: "/blog/year-end-write-off-checklist",
    title: "Year-End Write-Off Checklist",
    blurb: "Tidy your records, lock deductions, and prep for Schedule C.",
  },
  {
    href: "/blog/home-office-deduction-guide",
    title: "Home Office Deduction Guide",
    blurb: "When it often applies, simplified vs. actual, and what to keep.",
  },
];

export default function BlogIndex() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-16">
      <h1 className="text-3xl font-bold text-center">Blog</h1>
      <div className="mt-6 space-y-4">
        {posts.map((p) => (
          <Link
            key={p.href}
            href={p.href}
            className="block rounded-2xl border border-neutral-200 bg-white p-5 shadow-card hover:border-[#BFDBFE]"
          >
            <div className="text-lg font-semibold">{p.title}</div>
            <div className="text-sm text-neutral-700">{p.blurb}</div>
            <div className="mt-2 text-sm font-medium text-[#1D4ED8]">Read →</div>
          </Link>
        ))}
      </div>
    </main>
  );
}

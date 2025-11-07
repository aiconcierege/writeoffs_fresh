// /app/components/SectionRibbon.tsx
"use client";
import Link from "next/link";

const items = [
  { href: "#features", label: "Features" },
  { href: "#how", label: "How it works" },
  { href: "#pricing", label: "Pricing" },
  { href: "#faq", label: "FAQ" },
  { href: "#blog", label: "Blog" },
  { href: "/press", label: "Media Requests" }, // NEW
];

export default function SectionRibbon() {
  return (
    <section aria-label="Section navigation" className="border-y border-neutral-200 bg-white/90">
      <div className="mx-auto max-w-7xl px-5">
        <nav className="w-full py-3">
          <ul className="flex w-full flex-wrap items-center justify-center gap-3 text-center">
            {items.map((i) => (
              <li key={i.href}>
                <Link
                  href={i.href}
                  className="inline-block rounded-full border border-[#BFDBFE] px-4 py-2 text-sm font-semibold text-[#1D4ED8] hover:border-[#93C5FD]"
                >
                  {i.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </section>
  );
}

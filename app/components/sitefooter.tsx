// app/components/sitefooter.tsx
"use client";

import Link from "next/link";

export default function SiteFooter() {
  return (
    <footer className="border-t border-neutral-200 bg-white">
      <div className="mx-auto max-w-6xl px-6 py-8">
        <div className="flex items-center justify-between gap-4">
          {/* Brand: force exact pixel height so it never renders tiny */}
          <Link href="/" aria-label="WriteOffs.io Home" className="inline-flex items-center">
            <img
              src="/logo-header.png"         // ← your trimmed PNG in /public
              alt="WriteOffs.io logo"
              height={56}
              width={224}                    // width is governed by style below
              style={{ height: "56px", width: "auto", display: "block" }}
            />
          </Link>

          <nav className="hidden items-center gap-6 text-sm text-neutral-700 md:flex">
            <Link href="/privacy" className="hover:text-neutral-900">
              Privacy
            </Link>
            <Link href="/legal/terms" className="hover:text-neutral-900">
              Terms
            </Link>
            <Link href="/press" className="hover:text-neutral-900">
              Press
            </Link>
          </nav>
        </div>

        <div className="mt-6 text-xs text-neutral-500">
          © {new Date().getFullYear()} WriteOffs.io — All rights reserved.
        </div>
      </div>
    </footer>
  );
}


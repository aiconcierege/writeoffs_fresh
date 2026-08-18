// app/components/BrandLogo.tsx
"use client";

import Link from "next/link";

/**
 * Uses the trimmed raster header logo so the artwork fills the box.
 * Default: 56px tall. Adjust via `heightPx` if needed.
 */
export default function BrandLogo({
  heightPx = 56,
  href = "/",
}: {
  heightPx?: number;
  href?: string;
}) {
  return (
    <Link href={href} aria-label="WriteOffs.io Home" className="inline-flex items-center">
      <img
        src="/logo-header.png"          // ← match your actual file
        alt=""                           // decorative; sr-only label below for a11y
        height={heightPx}
        width={heightPx * 4}            // width is governed by the style below
        style={{ height: `${heightPx}px`, width: "auto", display: "block" }}
      />
      <span className="sr-only">WriteOffs.io</span>
    </Link>
  );
}

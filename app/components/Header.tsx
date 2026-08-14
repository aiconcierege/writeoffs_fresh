// app/components/Header.tsx
"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "../lib/utils"

import BrandLogo from "../components/BrandLogo"
import SignOutButton from "../components/SignOutButton"

const navItems = [
  { name: "Dashboard", href: "/dashboard" },
  { name: "Import", href: "/import" },
  { name: "Review", href: "/review" },
  { name: "Reports", href: "/reports/summary" },
]

export function Header() {
  const pathname = usePathname()

  if (pathname === "/") {
    return (
      <header className="fixed top-0 z-50 w-full border-b border-slate-200/80 bg-white/90 backdrop-blur-xl">
        <div className="mx-auto grid h-[4.75rem] max-w-7xl grid-cols-[auto_1fr_auto] items-center gap-2 px-4 sm:gap-3 sm:px-8 md:grid-cols-[1fr_auto_1fr] md:gap-0 lg:px-12">
          <div className="justify-self-start">
            <BrandLogo heightPx={42} />
          </div>
          <nav className="hidden items-center justify-self-center gap-8 md:flex">
            <Link href="/#how" className="text-sm font-semibold text-slate-600 transition hover:text-slate-950">How it works</Link>
            <Link href="/#features" className="text-sm font-semibold text-slate-600 transition hover:text-slate-950">Why WriteOffs</Link>
            <Link href="/#faq" className="text-sm font-semibold text-slate-600 transition hover:text-slate-950">FAQ</Link>
          </nav>
          <div className="flex items-center justify-self-end gap-4">
            <Link href="/login" className="hidden text-sm font-medium text-slate-600 transition hover:text-slate-950 sm:inline-flex">
              Log in
            </Link>
            <Link
              href="/#waitlist"
              className="inline-flex items-center whitespace-nowrap rounded-full bg-[#243186] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[#1d2870] sm:px-4 sm:text-sm"
            >
              Join the Waitlist
            </Link>
          </div>
        </div>
      </header>
    )
  }

  if (pathname === "/onboarding") {
    return (
      <header className="fixed top-0 z-50 w-full border-b border-slate-200/80 bg-white/95 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-4xl items-center justify-between px-4 sm:px-6">
          <BrandLogo heightPx={40} />
          <SignOutButton />
        </div>
      </header>
    )
  }

  return (
    <header className="fixed top-0 z-50 w-full backdrop-blur bg-background/80 border-b border-border">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8
                      grid grid-cols-[auto_1fr_auto] items-center h-16">
        {/* Left: brand */}
        <div className="justify-self-start flex items-center">
          <BrandLogo heightPx={40} />
        </div>

        {/* Center: nav + Account */}
        <div className="justify-self-center">
          <nav className="flex items-center gap-6">
            {navItems.map((item) => {
              const active = pathname.startsWith(item.href)
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={cn(
                    "text-sm font-medium transition-colors hover:text-primary px-1",
                    active ? "text-primary" : "text-muted-foreground"
                  )}
                >
                  {item.name}
                </Link>
              )
            })}

            {/* Account link, included in centered group */}
            <Link
              href="/settings/profile"
              className="text-sm font-medium text-muted-foreground hover:text-primary"
            >
              Account
            </Link>
          </nav>
        </div>

        {/* Right: Sign out (hard right) */}
        <div className="justify-self-end">
          <SignOutButton />
        </div>
      </div>
    </header>
  )
}

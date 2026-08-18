// app/components/Header.tsx
"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "../lib/utils"

import BrandLogo from "../components/BrandLogo"
import SignOutButton from "../components/SignOutButton"

const navItems = [
  { name: "Home", href: "/home" },
  { name: "Transactions", href: "/review" },
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
    <header className="fixed top-0 z-50 w-full border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto grid h-16 max-w-7xl grid-cols-[auto_1fr_auto] items-center gap-3 px-3 sm:px-6 lg:px-8">
        <div className="flex items-center justify-self-start">
          <span className="sm:hidden"><BrandLogo href="/home" heightPx={30} /></span>
          <span className="hidden sm:inline-flex"><BrandLogo href="/home" heightPx={38} /></span>
        </div>

        <div className="min-w-0 justify-self-center">
          <nav aria-label="Primary" className="flex items-center gap-3 sm:gap-7">
            {navItems.map((item) => {
              const active = pathname.startsWith(item.href)
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={cn(
                    "border-b-2 px-0.5 py-5 text-xs font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#243186] sm:text-sm",
                    active
                      ? "border-[#243186] text-slate-950"
                      : "border-transparent text-slate-600 hover:text-slate-950"
                  )}
                  aria-current={active ? "page" : undefined}
                >
                  {item.name}
                </Link>
              )
            })}
          </nav>
        </div>

        <div className="justify-self-end">
          <details className="group relative">
            <summary className="flex min-h-9 cursor-pointer list-none items-center gap-1 rounded-md px-2 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#243186] sm:px-3 sm:text-sm [&::-webkit-details-marker]:hidden">
              Account
              <span aria-hidden="true" className="text-[10px] transition-transform group-open:rotate-180">▾</span>
            </summary>
            <div className="absolute right-0 mt-2 w-48 border border-slate-200 bg-white p-2 shadow-lg">
              <Link
                href="/settings/profile"
                className="block rounded px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 hover:text-slate-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#243186]"
              >
                Account / Settings
              </Link>
              <div className="mt-1 border-t border-slate-100 pt-1">
                <SignOutButton className="w-full justify-center rounded-md border-0 bg-white px-3 py-2 text-slate-700 shadow-none hover:bg-slate-50" />
              </div>
            </div>
          </details>
        </div>
      </div>
    </header>
  )
}

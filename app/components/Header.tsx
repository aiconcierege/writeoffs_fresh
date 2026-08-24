// app/components/Header.tsx
"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "../lib/utils"

import BrandLogo from "../components/BrandLogo"
import SignOutButton from "../components/SignOutButton"
import { applicationNavigationSection, isAuthenticatedRoute } from "../lib/route-policy"

const navItems = [
  { name: "Home", href: "/home", section: "home" },
  { name: "Transactions", href: "/transactions", section: "transactions" },
  { name: "Reports", href: "/reports", section: "reports" },
]

export function Header() {
  const pathname = usePathname()

  if (!isAuthenticatedRoute(pathname)) {
    return (
      <header className="absolute top-0 z-50 w-full bg-[#fff8ee]/92 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[90rem] items-center justify-between px-5 sm:px-10 lg:px-16 xl:px-24">
          <div className="flex min-w-0 items-center">
            <BrandLogo heightPx={30} />
            <span className="mx-6 hidden h-5 w-px bg-[#cfd8d2] md:block" aria-hidden="true" />
            <nav aria-label="Public" className="hidden items-center gap-6 md:flex">
              <Link href="/#how" className="text-[13px] font-medium tracking-[-0.01em] text-[#526159] transition hover:text-[#17211d]">How it works</Link>
              <Link href="/#features" className="text-[13px] font-medium tracking-[-0.01em] text-[#526159] transition hover:text-[#17211d]">What you get</Link>
              <Link href="/#for-you" className="text-[13px] font-medium tracking-[-0.01em] text-[#526159] transition hover:text-[#17211d]">Who it’s for</Link>
            </nav>
          </div>
          <div className="flex shrink-0 items-center gap-4 sm:gap-6">
            <Link href="/login" className="hidden text-[13px] font-medium text-[#526159] transition hover:text-[#17211d] sm:inline-flex">
              Log in
            </Link>
            <Link
              href="/#waitlist"
              className="group inline-flex min-h-9 items-center gap-2 whitespace-nowrap border-b-2 border-[#243186] px-0.5 text-xs font-semibold text-[#243186] transition hover:border-[#00a984] hover:text-[#17211d] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#243186] sm:text-[13px]"
            >
              Join the waitlist <span aria-hidden="true" className="transition-transform group-hover:translate-x-0.5">→</span>
            </Link>
          </div>
        </div>
      </header>
    )
  }

  if (pathname === "/onboarding") {
    return (
      <header className="fixed top-0 z-50 w-full border-b border-[#dce3de]/80 bg-[#fbfaf7]/95 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-4xl items-center justify-between px-4 sm:px-6">
          <BrandLogo heightPx={40} />
          <SignOutButton />
        </div>
      </header>
    )
  }

  return (
    <header className="fixed top-0 z-50 w-full border-b border-[#dce3de]/80 bg-[#fbfaf7]/92 shadow-[0_1px_0_rgba(23,33,29,0.02)] backdrop-blur-xl">
      <div className="mx-auto grid h-16 max-w-7xl grid-cols-[auto_1fr_auto] items-center gap-3 px-3 sm:px-6 lg:px-8">
        <div className="flex items-center justify-self-start">
          <span className="sm:hidden"><BrandLogo href="/home" heightPx={26} /></span>
          <span className="hidden sm:inline-flex"><BrandLogo href="/home" heightPx={32} /></span>
        </div>

        <div className="min-w-0 justify-self-center">
          <nav aria-label="Primary" className="flex items-center gap-3 sm:gap-7">
            {navItems.map((item) => {
              const active = applicationNavigationSection(pathname) === item.section
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={cn(
                    "relative px-0.5 py-5 text-xs transition-colors after:absolute after:inset-x-0 after:bottom-[.85rem] after:h-0.5 after:origin-center after:rounded-full after:bg-[#243186] after:transition-transform focus-visible:rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#243186] sm:text-sm",
                    active
                      ? "font-semibold text-slate-950 after:scale-x-100"
                      : "font-medium text-[#65736b] after:scale-x-0 hover:text-[#17211d]"
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
            <summary
              aria-current={applicationNavigationSection(pathname) === "account" ? "page" : undefined}
              className={`flex min-h-10 cursor-pointer list-none items-center gap-1 rounded-xl px-2 text-xs font-semibold transition-colors hover:bg-white hover:text-[#17211d] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#243186] sm:px-3 sm:text-sm [&::-webkit-details-marker]:hidden ${applicationNavigationSection(pathname) === "account" ? "bg-white text-[#17211d] shadow-sm" : "text-[#65736b]"}`}
            >
              Account
              <span aria-hidden="true" className="text-[10px] transition-transform group-open:rotate-180">▾</span>
            </summary>
            <div className="absolute right-0 mt-2 w-52 rounded-xl border border-[#dce3de] bg-white p-2 shadow-[0_18px_45px_rgba(23,33,29,0.14)]">
              <Link
                href="/settings"
                className="block rounded px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 hover:text-slate-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#243186]"
              >
                Account / Settings
              </Link>
              <Link href="/settings/security" className="block rounded px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 hover:text-slate-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#243186]">Security</Link>
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

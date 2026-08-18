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
      <header className="absolute top-0 z-50 w-full bg-[#fff8ee]/95 backdrop-blur-xl">
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

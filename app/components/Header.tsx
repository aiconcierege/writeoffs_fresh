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

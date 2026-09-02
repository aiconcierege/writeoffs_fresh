"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useRef, useState, type KeyboardEvent } from "react"
import { cn } from "../lib/utils"
import BrandLogo from "./BrandLogo"
import SignOutButton from "./SignOutButton"

const navItems = [
  { name: "Dashboard", href: "/dashboard" },
  { name: "Import", href: "/import" },
  { name: "Review", href: "/review" },
  { name: "Reports", href: "/reports/summary" },
]

function isPublicRoute(pathname: string) {
  return pathname === "/"
    || pathname === "/login"
    || pathname === "/contact"
    || pathname === "/press"
    || pathname === "/waitlist"
    || pathname.startsWith("/legal/")
}

export function Header() {
  const pathname = usePathname()
  const publicMenu = useRef<HTMLDetailsElement>(null)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    if (publicMenu.current) publicMenu.current.open = false
  }, [pathname])

  useEffect(() => {
    if (!isPublicRoute(pathname)) return
    const update = () => setScrolled(window.scrollY > 28)
    update()
    window.addEventListener("scroll", update, { passive: true })
    return () => window.removeEventListener("scroll", update)
  }, [pathname])

  function closePublicMenu() {
    if (publicMenu.current) publicMenu.current.open = false
  }

  function handlePublicMenuKeyDown(event: KeyboardEvent<HTMLDetailsElement>) {
    if (event.key !== "Escape" || !publicMenu.current?.open) return
    event.preventDefault()
    publicMenu.current.open = false
    publicMenu.current.querySelector("summary")?.focus()
  }

  if (isPublicRoute(pathname)) {
    return (
      <header data-scrolled={scrolled ? "true" : "false"} className="public-header fixed top-0 z-50 w-full border-b border-transparent bg-[#fff8ee]/92 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[90rem] items-center justify-between px-5 sm:px-10 lg:px-16 xl:px-24">
          <div className="flex min-w-0 items-center">
            <BrandLogo heightPx={scrolled ? 34 : 40} />
            <span className="mx-6 hidden h-5 w-px bg-[#cfd8d2] md:block" aria-hidden="true" />
            <nav aria-label="Public" className="hidden items-center gap-6 md:flex">
              <Link href="/#how" className="text-[13px] font-medium tracking-[-0.01em] text-[#526159] transition hover:text-[#17211d]">How it works</Link>
              <Link href="/#features" className="text-[13px] font-medium tracking-[-0.01em] text-[#526159] transition hover:text-[#17211d]">What you get</Link>
              <Link href="/#for-you" className="text-[13px] font-medium tracking-[-0.01em] text-[#526159] transition hover:text-[#17211d]">Who it’s for</Link>
            </nav>
          </div>
          <div className="hidden shrink-0 items-center gap-4 sm:flex sm:gap-6">
            <Link href="/login" className="text-[13px] font-medium text-[#526159] transition hover:text-[#17211d]">Log in</Link>
            <Link href="/#waitlist" className="group inline-flex min-h-9 items-center gap-2 whitespace-nowrap border-b-2 border-[#243186] px-0.5 text-xs font-semibold text-[#243186] transition hover:border-[#00a984] hover:text-[#17211d] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#243186] sm:text-[13px]">
              Join the waitlist <span aria-hidden="true" className="transition-transform group-hover:translate-x-0.5">→</span>
            </Link>
          </div>
          <details ref={publicMenu} onKeyDown={handlePublicMenuKeyDown} className="public-mobile-menu relative sm:hidden">
            <summary className="grid min-h-11 min-w-11 cursor-pointer list-none place-items-center rounded-lg text-[#243186] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#243186] [&::-webkit-details-marker]:hidden" aria-label="Open navigation">
              <span aria-hidden="true" className="grid gap-1"><i className="block h-0.5 w-5 bg-current"/><i className="block h-0.5 w-5 bg-current"/><i className="block h-0.5 w-5 bg-current"/></span>
            </summary>
            <div className="absolute right-0 mt-2 w-[min(19rem,calc(100vw-2rem))] rounded-2xl border border-[#d5ddd7] bg-[#fffdf8] p-3 shadow-[0_20px_55px_rgba(23,33,29,.16)]">
              <nav aria-label="Public mobile" className="grid">
                <Link onClick={closePublicMenu} href="/#how" className="rounded-lg px-3 py-3 text-sm font-medium">How it works</Link>
                <Link onClick={closePublicMenu} href="/#features" className="rounded-lg px-3 py-3 text-sm font-medium">What you get</Link>
                <Link onClick={closePublicMenu} href="/#for-you" className="rounded-lg px-3 py-3 text-sm font-medium">Who it’s for</Link>
                <Link onClick={closePublicMenu} href="/login" className="rounded-lg px-3 py-3 text-sm font-medium">Log in</Link>
                <Link onClick={closePublicMenu} href="/#waitlist" className="mt-1 rounded-lg bg-[#243186] px-3 py-3 text-center text-sm font-semibold text-white">Join the waitlist</Link>
              </nav>
            </div>
          </details>
        </div>
      </header>
    )
  }

  return (
    <header className="fixed top-0 z-50 w-full backdrop-blur bg-background/80 border-b border-border">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-[auto_1fr_auto] items-center h-16">
        <div className="justify-self-start flex items-center"><BrandLogo heightPx={40} /></div>
        <div className="justify-self-center">
          <nav className="flex items-center gap-6">
            {navItems.map((item) => {
              const active = pathname.startsWith(item.href)
              return <Link key={item.name} href={item.href} className={cn("text-sm font-medium transition-colors hover:text-primary px-1", active ? "text-primary" : "text-muted-foreground")}>{item.name}</Link>
            })}
            <Link href="/settings/profile" className="text-sm font-medium text-muted-foreground hover:text-primary">Account</Link>
          </nav>
        </div>
        <div className="justify-self-end"><SignOutButton /></div>
      </div>
    </header>
  )
}

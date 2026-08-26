// app/components/Header.tsx
"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useRef, type KeyboardEvent } from "react"
import BrandLogo from "../components/BrandLogo"
import SignOutButton from "../components/SignOutButton"
import { isAuthenticatedRoute } from "../lib/route-policy"

const recordItems = [
  ["Transactions", "/transactions"], ["Receipts", "/receipts"],
  ["Mileage", "/mileage"], ["Invoices", "/invoices"], ["Reports", "/reports"],
  ["Questions", "/questions"],
] as const

export function Header() {
  const pathname = usePathname()
  const menu = useRef<HTMLDetailsElement>(null)

  useEffect(() => {
    if (menu.current) menu.current.open = false
  }, [pathname])

  function closeMenu() {
    if (menu.current) menu.current.open = false
  }

  function handleMenuKeyDown(event: KeyboardEvent<HTMLDetailsElement>) {
    if (event.key !== 'Escape' || !menu.current?.open) return
    event.preventDefault()
    menu.current.open = false
    menu.current.querySelector('summary')?.focus()
  }

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

  return <header className="fixed top-0 z-50 w-full border-b border-[#dce3de]/80 bg-[#fbfaf7]/94 backdrop-blur-xl">
    <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-7">
      <BrandLogo href="/home" heightPx={32}/>
      <details ref={menu} onKeyDown={handleMenuKeyDown} className="group relative"><summary className="flex min-h-11 cursor-pointer list-none items-center gap-3 rounded-xl px-3 text-sm font-semibold text-[#17211d] hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#243186] [&::-webkit-details-marker]:hidden"><span>Menu</span><span aria-hidden="true" className="grid gap-1"><i className="block h-0.5 w-5 bg-current"/><i className="block h-0.5 w-5 bg-current"/><i className="block h-0.5 w-5 bg-current"/></span></summary>
        <div className="absolute right-0 mt-2 w-[min(20rem,calc(100vw-2rem))] rounded-2xl border border-[#dce3de] bg-[#fffefa] p-3 shadow-[0_24px_65px_rgba(23,33,29,.17)]">
          <Link onClick={closeMenu} href="/home" aria-current={pathname==='/home'?'page':undefined} className="block rounded-xl bg-[#eef7f2] px-4 py-3 font-semibold text-[#17211d]">Home</Link>
          <nav aria-label="Your records" className="mt-2 grid grid-cols-2 gap-1">{recordItems.map(([name,href])=><Link onClick={closeMenu} key={href} href={href} aria-current={pathname.startsWith(href)?'page':undefined} className="flex min-h-12 items-center rounded-lg px-3 text-sm font-medium text-[#435149] hover:bg-white">{name}</Link>)}</nav>
          <div className="my-2 border-t border-[#dce3de]"/><Link onClick={closeMenu} href="/get-started" className="block min-h-11 rounded-lg px-3 py-3 text-sm font-medium text-[#435149] hover:bg-white">Add or connect records</Link><Link onClick={closeMenu} href="/settings" className="block min-h-11 rounded-lg px-3 py-3 text-sm font-medium text-[#435149] hover:bg-white">Account and settings</Link><Link onClick={closeMenu} href="/settings/billing" className="block min-h-11 rounded-lg px-3 py-3 text-sm font-medium text-[#435149] hover:bg-white">Membership</Link>
          <div className="mt-2 border-t border-[#dce3de] pt-2"><SignOutButton className="w-full justify-center border-0 bg-transparent shadow-none"/></div>
        </div></details>
    </div>
  </header>
}

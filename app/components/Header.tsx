// app/components/Header.tsx
"use client"

import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import { useEffect, useRef, useState, type KeyboardEvent } from "react"
import BrandLogo from "../components/BrandLogo"
import SignOutButton from "../components/SignOutButton"
import { isAuthenticatedRoute } from "../lib/route-policy"

const bookItems = [
  ["Transactions", "/transactions"], ["Receipts", "/receipts"],
  ["Mileage", "/mileage"], ["Invoices", "/invoices"], ["Reports", "/reports"],
] as const

const accountItems = [
  ["Add or connect records", "/get-started"], ["Account and settings", "/settings"],
  ["Membership", "/settings/billing"],
] as const

export function Header() {
  const pathname = usePathname()
  const search = useSearchParams()
  const menu = useRef<HTMLDetailsElement>(null)
  const publicMenu = useRef<HTMLDetailsElement>(null)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    if (menu.current) menu.current.open = false
    if (publicMenu.current) publicMenu.current.open = false
  }, [pathname])

  useEffect(() => {
    if (isAuthenticatedRoute(pathname)) return
    const update = () => setScrolled(window.scrollY > 28)
    update()
    window.addEventListener('scroll', update, { passive: true })
    return () => window.removeEventListener('scroll', update)
  }, [pathname])

  useEffect(() => {
    function outside(event: PointerEvent) {
      if (menu.current?.open && !menu.current.contains(event.target as Node)) menu.current.open = false
    }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [])

  function closeMenu() {
    if (menu.current) menu.current.open = false
  }

  function closePublicMenu() {
    if (publicMenu.current) publicMenu.current.open = false
  }

  function authenticatedMenuCurrent(href: string) {
    if (href === '/settings') {
      return pathname.startsWith('/settings') && !pathname.startsWith('/settings/billing')
    }
    return pathname === href || pathname.startsWith(`${href}/`)
  }

  function handleMenuKeyDown(event: KeyboardEvent<HTMLDetailsElement>) {
    if (event.key !== 'Escape' || !menu.current?.open) return
    event.preventDefault()
    menu.current.open = false
    menu.current.querySelector('summary')?.focus()
  }

  function handlePublicMenuKeyDown(event: KeyboardEvent<HTMLDetailsElement>) {
    if (event.key !== 'Escape' || !publicMenu.current?.open) return
    event.preventDefault()
    publicMenu.current.open = false
    publicMenu.current.querySelector('summary')?.focus()
  }

  if (!isAuthenticatedRoute(pathname)) {
    return (
      <header data-scrolled={scrolled ? 'true' : 'false'} className="public-header fixed top-0 z-50 w-full border-b border-transparent bg-[#fff8ee]/92 backdrop-blur-xl">
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
            <Link href="/login" className="hidden text-[13px] font-medium text-[#526159] transition hover:text-[#17211d] sm:inline-flex">
              Log in
            </Link>
            <Link
              href="/signup"
              className="group inline-flex min-h-9 items-center gap-2 whitespace-nowrap border-b-2 border-[#243186] px-0.5 text-xs font-semibold text-[#243186] transition hover:border-[#00a984] hover:text-[#17211d] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#243186] sm:text-[13px]"
            >
              Get started <span aria-hidden="true" className="transition-transform group-hover:translate-x-0.5">→</span>
            </Link>
          </div>
          <details ref={publicMenu} onKeyDown={handlePublicMenuKeyDown} className="public-mobile-menu relative sm:hidden">
            <summary className="grid min-h-11 min-w-11 cursor-pointer list-none place-items-center rounded-lg text-[#243186] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#243186] [&::-webkit-details-marker]:hidden" aria-label="Open navigation"><span aria-hidden="true" className="grid gap-1"><i className="block h-0.5 w-5 bg-current"/><i className="block h-0.5 w-5 bg-current"/><i className="block h-0.5 w-5 bg-current"/></span></summary>
            <div className="absolute right-0 mt-2 w-[min(19rem,calc(100vw-2rem))] rounded-2xl border border-[#d5ddd7] bg-[#fffdf8] p-3 shadow-[0_20px_55px_rgba(23,33,29,.16)]">
              <nav aria-label="Public mobile" className="grid"><Link onClick={closePublicMenu} href="/#how" className="rounded-lg px-3 py-3 text-sm font-medium">How it works</Link><Link onClick={closePublicMenu} href="/#features" className="rounded-lg px-3 py-3 text-sm font-medium">What you get</Link><Link onClick={closePublicMenu} href="/#for-you" className="rounded-lg px-3 py-3 text-sm font-medium">Who it’s for</Link><Link onClick={closePublicMenu} href="/login" className="rounded-lg px-3 py-3 text-sm font-medium">Log in</Link><Link onClick={closePublicMenu} href="/signup" className="mt-1 rounded-lg bg-[#243186] px-3 py-3 text-center text-sm font-semibold text-white">Get started</Link></nav>
            </div>
          </details>
        </div>
      </header>
    )
  }

  if (pathname === "/onboarding" || pathname === "/membership" || pathname.startsWith("/mfa/") || (pathname === "/settings/security" && search.get("enroll") === "required")) {
    return (
      <header className="wo-header">
        <div className="wo-header-inner">
          <BrandLogo heightPx={34} />
          <SignOutButton />
        </div>
      </header>
    )
  }

  return <header className="wo-header">
    <div className="wo-header-inner">
      <BrandLogo href="/home" heightPx={34}/>
      <details ref={menu} onKeyDown={handleMenuKeyDown} className="wo-menu">
        <summary><span>Menu</span><span aria-hidden="true" className="wo-menu-bars"><i/><i/><i/></span></summary>
        <nav className="wo-menu-panel" aria-label="Authenticated navigation">
          <div className="wo-menu-primary">
            <Link onClick={closeMenu} href="/home" aria-current={pathname==='/home'?'page':undefined}>Home</Link>
            <Link onClick={closeMenu} href="/check-in" aria-current={authenticatedMenuCurrent('/check-in')?'page':undefined}>Work with Betti <span aria-hidden="true">→</span></Link>
          </div>
          <p className="wo-menu-label">Your books</p>
          <div className="wo-menu-books">{bookItems.map(([name,href])=><Link onClick={closeMenu} key={href} href={href} aria-current={authenticatedMenuCurrent(href)?'page':undefined}>{name}</Link>)}</div>
          <p className="wo-menu-label">Your account</p>
          <div>{accountItems.map(([name,href])=><Link onClick={closeMenu} key={href} href={href} aria-current={authenticatedMenuCurrent(href)?'page':undefined}>{name}</Link>)}</div>
          <div className="wo-menu-footer"><SignOutButton className="w-full justify-start border-0 bg-transparent px-3 text-[#52645b] shadow-none"/></div>
        </nav>
      </details>
    </div>
  </header>
}

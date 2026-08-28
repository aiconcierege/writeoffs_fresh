// app/components/Header.tsx
"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
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
              href="/#waitlist"
              className="group inline-flex min-h-9 items-center gap-2 whitespace-nowrap border-b-2 border-[#243186] px-0.5 text-xs font-semibold text-[#243186] transition hover:border-[#00a984] hover:text-[#17211d] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#243186] sm:text-[13px]"
            >
              Join the waitlist <span aria-hidden="true" className="transition-transform group-hover:translate-x-0.5">→</span>
            </Link>
          </div>
          <details ref={publicMenu} onKeyDown={handlePublicMenuKeyDown} className="public-mobile-menu relative sm:hidden">
            <summary className="grid min-h-11 min-w-11 cursor-pointer list-none place-items-center rounded-lg text-[#243186] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#243186] [&::-webkit-details-marker]:hidden" aria-label="Open navigation"><span aria-hidden="true" className="grid gap-1"><i className="block h-0.5 w-5 bg-current"/><i className="block h-0.5 w-5 bg-current"/><i className="block h-0.5 w-5 bg-current"/></span></summary>
            <div className="absolute right-0 mt-2 w-[min(19rem,calc(100vw-2rem))] rounded-2xl border border-[#d5ddd7] bg-[#fffdf8] p-3 shadow-[0_20px_55px_rgba(23,33,29,.16)]">
              <nav aria-label="Public mobile" className="grid"><Link onClick={closePublicMenu} href="/#how" className="rounded-lg px-3 py-3 text-sm font-medium">How it works</Link><Link onClick={closePublicMenu} href="/#features" className="rounded-lg px-3 py-3 text-sm font-medium">What you get</Link><Link onClick={closePublicMenu} href="/#for-you" className="rounded-lg px-3 py-3 text-sm font-medium">Who it’s for</Link><Link onClick={closePublicMenu} href="/login" className="rounded-lg px-3 py-3 text-sm font-medium">Log in</Link><Link onClick={closePublicMenu} href="/#waitlist" className="mt-1 rounded-lg bg-[#243186] px-3 py-3 text-center text-sm font-semibold text-white">Join the waitlist</Link></nav>
            </div>
          </details>
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
      <BrandLogo href="/home" heightPx={36}/>
      <details ref={menu} onKeyDown={handleMenuKeyDown} className="group relative"><summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 rounded-xl border border-[#ccd8d0] bg-[#fffefa]/80 px-4 text-base font-semibold text-[#17211d] shadow-[0_5px_16px_rgba(23,33,29,.04)] transition hover:border-[#aebfb4] hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#243186] [&::-webkit-details-marker]:hidden"><span>Menu</span><span aria-hidden="true" className="grid gap-1.5"><i className="block h-0.5 w-5 bg-current"/><i className="block h-0.5 w-5 bg-current"/><i className="block h-0.5 w-5 bg-current"/></span></summary>
        <div className="absolute right-0 mt-2 w-[min(20rem,calc(100vw-2rem))] rounded-2xl border border-[#dce3de] bg-[#fffefa] p-3 shadow-[0_24px_65px_rgba(23,33,29,.17)]">
          <Link onClick={closeMenu} href="/home" aria-current={pathname==='/home'?'page':undefined} className="block rounded-xl bg-[#eef7f2] px-4 py-3 font-semibold text-[#17211d]">Home</Link>
          <nav aria-label="Authenticated navigation" className="mt-3">
            <p className="px-3 text-[10px] font-bold uppercase tracking-[.14em] text-[#748078]">Your books</p>
            <div className="mt-1 grid grid-cols-2 gap-1">{bookItems.map(([name,href])=><Link onClick={closeMenu} key={href} href={href} aria-current={authenticatedMenuCurrent(href)?'page':undefined} className="flex min-h-12 items-center rounded-lg px-3 text-base font-medium text-[#435149] hover:bg-white">{name}</Link>)}</div>
            <div className="my-2 border-t border-[#e3e8e4]"/>
            <p className="px-3 text-[10px] font-bold uppercase tracking-[.14em] text-[#748078]">Betti</p>
            <Link onClick={closeMenu} href="/questions" aria-current={authenticatedMenuCurrent('/questions')?'page':undefined} className="mt-1 flex min-h-12 items-center rounded-lg px-3 text-base font-medium text-[#435149] hover:bg-white">Questions</Link>
            <div className="my-2 border-t border-[#e3e8e4]"/>
            <p className="px-3 text-[10px] font-bold uppercase tracking-[.14em] text-[#748078]">Your account</p>
            <div className="mt-1 grid">{accountItems.map(([name,href])=><Link onClick={closeMenu} key={href} href={href} aria-current={authenticatedMenuCurrent(href)?'page':undefined} className="flex min-h-12 items-center rounded-lg px-3 text-base font-medium text-[#435149] hover:bg-white">{name}</Link>)}</div>
          </nav>
          <div className="mt-2 border-t border-[#dce3de] pt-2"><SignOutButton className="w-full justify-start border-0 bg-transparent px-3 text-[#68756e] shadow-none"/></div>
        </div></details>
    </div>
  </header>
}

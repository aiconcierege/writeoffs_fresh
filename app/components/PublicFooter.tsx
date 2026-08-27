import Link from 'next/link'

export function PublicFooter() {
  return <footer className="bg-[#0d1713] text-[#c8d9d1]">
    <div className="mx-auto flex max-w-7xl flex-col gap-7 px-6 py-9 sm:px-10 md:flex-row md:items-center md:justify-between lg:px-16">
      <p className="text-sm">© {new Date().getFullYear()} WriteOffs.io. All rights reserved.</p>
      <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-3 text-sm">
        <Link href="/legal/privacy" className="transition hover:text-white">Privacy</Link>
        <Link href="/legal/terms" className="transition hover:text-white">Terms</Link>
        <Link href="/legal/tax-disclaimer" className="transition hover:text-white">Tax disclaimer</Link>
        <Link href="/press" className="transition hover:text-white">Press</Link>
      </nav>
    </div>
  </footer>
}

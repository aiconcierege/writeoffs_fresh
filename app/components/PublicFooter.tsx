import Link from 'next/link'
import BrandLogo from './BrandLogo'

const groups = [
  { label: 'Product', links: [['How it works','/#how'],['What you get','/#features'],['Who it’s for','/#for-you']] },
  { label: 'Company', links: [['Contact','/contact'],['Press','/press']] },
  { label: 'Legal', links: [['Privacy','/legal/privacy'],['Terms','/legal/terms'],['Tax disclaimer','/legal/tax-disclaimer']] },
] as const

export function PublicFooter() {
  return <footer className="bg-[#0d1713] text-[#c8d9d1]">
    <div className="mx-auto max-w-7xl px-6 py-11 sm:px-10 sm:py-14 lg:px-16">
      <div className="grid gap-10 border-b border-white/15 pb-10 sm:grid-cols-2 lg:grid-cols-[1.35fr_repeat(3,.65fr)] lg:gap-12">
        <div className="max-w-sm">
          <span className="inline-flex rounded-lg bg-[#fffaf3] px-3 py-2"><BrandLogo heightPx={32}/></span>
          <p className="mt-5 text-base leading-7 text-[#dce9e3]">Your bookkeeper for the business you run.</p>
          <Link href="/#waitlist" className="mt-6 inline-flex min-h-11 items-center border-b-2 border-[#8ce6cb] text-sm font-semibold text-white transition hover:border-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#8ce6cb]">Join the waitlist →</Link>
        </div>
        {groups.map(group => <nav key={group.label} aria-label={`${group.label} links`}>
          <p className="text-xs font-bold uppercase tracking-[.14em] text-[#8ce6cb]">{group.label}</p>
          <ul className="mt-4 grid gap-1">
            {group.links.map(([label,href]) => <li key={href}><Link href={href} className="inline-flex min-h-10 items-center text-sm transition hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8ce6cb]">{label}</Link></li>)}
          </ul>
        </nav>)}
      </div>
      <p className="pt-7 text-sm text-[#9fb8ad]">© {new Date().getFullYear()} WriteOffs.io. All rights reserved.</p>
    </div>
  </footer>
}

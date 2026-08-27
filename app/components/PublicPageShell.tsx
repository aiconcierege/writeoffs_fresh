import type { ReactNode } from 'react'
import { PublicFooter } from './PublicFooter'

export function PublicPageShell({ eyebrow, title, introduction, children }: {
  eyebrow: string
  title: string
  introduction?: string
  children: ReactNode
}) {
  return <div className="public-site public-page-shell -mx-4 -mb-10 overflow-hidden bg-[#fffaf3] text-[#17211d] sm:-mx-6 lg:-mx-8">
    <header className="public-page-hero">
      <div className="mx-auto max-w-5xl px-6 py-14 sm:px-10 sm:py-20 lg:px-16">
        <p>{eyebrow}</p>
        <h1>{title}</h1>
        {introduction && <div>{introduction}</div>}
      </div>
    </header>
    <div className="public-page-content mx-auto max-w-5xl px-6 py-12 sm:px-10 sm:py-16 lg:px-16">{children}</div>
    <PublicFooter/>
  </div>
}

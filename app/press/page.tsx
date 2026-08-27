import Image from 'next/image'
import { BettiIllustration } from '../components/BettiIllustration'
import { PublicPageShell } from '../components/PublicPageShell'

export const metadata = {
  title: 'Press Kit · WriteOffs.io',
  description: 'Official WriteOffs company information, logos, colors, and media contact.',
}

const colors = [
  ['WriteOffs navy', '#243186'],
  ['WriteOffs green', '#178368'],
  ['Warm cream', '#FFFAF3'],
  ['Deep green', '#193F35'],
] as const

export default function PressPage() {
  return <PublicPageShell eyebrow="Media resources" title="Press kit" introduction="Official company information and approved brand assets for WriteOffs.">
    <section className="press-intro" aria-labelledby="about-writeoffs">
      <div>
        <p className="public-section-label">Company boilerplate</p>
        <h2 id="about-writeoffs">Bookkeeping for independent business owners.</h2>
      </div>
      <p>WriteOffs is bookkeeping for self-employed and independent businesses. It organizes financial activity, keeps receipts and other documentation with the activity they support, and handles bookkeeping and supported tax logic behind the scenes. When WriteOffs needs a real-world fact only the customer knows, it asks a clear question. The result is organized bookkeeping records and reports without asking customers to become bookkeepers themselves. WriteOffs does not prepare or file tax returns.</p>
    </section>

    <section className="press-section" aria-labelledby="logos-heading">
      <div className="press-section-heading"><p className="public-section-label">Brand assets</p><h2 id="logos-heading">Official WriteOffs logos</h2><p>Use the artwork as supplied. Do not redraw, recolor, or combine it with another mark.</p></div>
      <div className="press-logo-stage">
        <div><Image src="/logo-header.png" alt="WriteOffs" width={332} height={62}/><a href="/logo.svg" download>Download SVG <span aria-hidden="true">↓</span></a></div>
        <div className="press-logo-dark"><Image src="/media/writeoffs_logo_clean.png" alt="WriteOffs" width={332} height={92}/><a href="/media/writeoffs_logo_clean.png" download>Download PNG <span aria-hidden="true">↓</span></a></div>
      </div>
      <p className="press-icon-download"><a href="/og/og-default.png" download>Download approved social/app artwork <span aria-hidden="true">↓</span></a></p>
    </section>

    <section className="press-section" aria-labelledby="colors-heading">
      <div className="press-section-heading"><p className="public-section-label">Color</p><h2 id="colors-heading">The WriteOffs palette</h2></div>
      <dl className="press-colors">{colors.map(([name, value]) => <div key={value}><i style={{backgroundColor:value}}/><dt>{name}</dt><dd>{value}</dd></div>)}</dl>
    </section>

    <section className="press-betti" aria-labelledby="press-betti-heading">
      <div className="press-betti-art"><BettiIllustration state="welcome" decorative sizes="(max-width: 639px) 16rem, 20rem"/></div>
      <div><p className="public-section-label">Supporting character</p><h2 id="press-betti-heading">Betti the Bookkeeper</h2><p>Betti is the careful, calm bookkeeper customers recognize inside WriteOffs. She helps make the invisible work feel personal, but she is not the WriteOffs logo and must never replace or be combined with it.</p>
        <div className="press-downloads"><a href="/betti/betti-welcome.png" download>Welcome pose <span aria-hidden="true">↓</span></a><a href="/betti/betti-caught-up.png" download>Caught-up pose <span aria-hidden="true">↓</span></a></div>
      </div>
    </section>

    <section className="press-contact" aria-labelledby="media-contact"><p className="public-section-label">Media contact</p><h2 id="media-contact">Let’s talk.</h2><p>For interviews, background, or approved assets, email <a href="mailto:press@writeoffs.io">press@writeoffs.io</a>. For embargoed briefings, include your outlet and timeline.</p></section>
  </PublicPageShell>
}

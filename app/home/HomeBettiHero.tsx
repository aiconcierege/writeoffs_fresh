import Link from 'next/link'
import { BettiIllustration, type BettiState } from '../components/BettiIllustration'
import type { BettiHomeProjection } from '../lib/home/betti-home'

const artworkState: Record<BettiHomeProjection['state'], BettiState> = {
  'needs-customer': 'question',
  attention: 'question',
  working: 'working',
  'documentation-follow-up': 'question',
  'caught-up': 'caught-up',
}

export function HomeBettiHero({ projection }: { projection: BettiHomeProjection }) {
  return <section className="home-betti-hero" data-betti-state={projection.state} aria-labelledby="home-heading">
    <div className="home-betti-message">
      <p className="home-betti-identity">Betti <span aria-hidden="true">·</span> your bookkeeper</p>
      <h1 id="home-heading">{projection.heading}</h1>
      <p className="home-betti-thought">{projection.supporting}</p>
      {projection.action && <div className="home-betti-action">
        <Link href={projection.action.href} className="btn btn-primary">{projection.action.label} <span aria-hidden="true">→</span></Link>
        {projection.action.note && <small className="home-betti-reassurance">{projection.action.note}</small>}
      </div>}
    </div>
    <div className="home-betti-portrait" aria-hidden="true">
      <BettiIllustration state={artworkState[projection.state]} className="home-betti-art" priority
        sizes="(max-width: 639px) 12rem, (max-width: 1023px) 18rem, 23rem" decorative />
    </div>
  </section>
}

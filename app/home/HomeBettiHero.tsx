import Link from 'next/link'
import { BettiIllustration, type BettiState } from '../components/BettiIllustration'
import type { HomeCommand } from '../lib/home/command-center'

const artworkState: Record<HomeCommand['state'], BettiState> = {
  welcome: 'welcome', waiting: 'working', held: 'working', unavailable: 'welcome',
  'needs-customer': 'question',
  attention: 'question',
  working: 'working',
  'caught-up': 'caught-up',
}

export function HomeBettiHero({ projection }: { projection: HomeCommand }) {
  return <section className="home-betti-hero" data-betti-state={projection.state} aria-labelledby="home-heading">
    <div className="home-betti-message">
      <p className="home-betti-identity">Betti <span aria-hidden="true">·</span> your bookkeeper</p>
      <h1 id="home-heading">{projection.heading}</h1>
      <p className="home-betti-thought">{projection.supporting}</p>
      {projection.action && <div className="home-betti-action">
        <Link href={projection.action.href} className="btn btn-primary">{projection.action.label} <span aria-hidden="true">→</span></Link>
      </div>}
      {projection.alternative && <Link className="home-betti-alternative" href={projection.alternative.href}>{projection.alternative.label} →</Link>}
      {projection.context.length > 0 && <ul className="home-work-context" aria-label="What needs you">{projection.context.map(line => <li key={line}>{line}</li>)}</ul>}
    </div>
    <div className="home-betti-portrait" aria-hidden="true">
      <BettiIllustration state={artworkState[projection.state]} className="home-betti-art" priority
        sizes="(max-width: 639px) 9rem, (max-width: 1023px) 16rem, 21rem" decorative />
    </div>
  </section>
}

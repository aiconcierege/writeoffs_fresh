import { BettiIllustration, type BettiState } from '../BettiIllustration'

/** A stable presentation boundary for approved art. Future animation belongs here,
 * never in page-specific render/answer code. These moods currently use static PNGs. */
export function BettiPresence({ state = 'question', engagement = 'customer', className = '', priority = false, sizes }: {
  state?: BettiState
  engagement?: 'customer' | 'work'
  className?: string
  priority?: boolean
  sizes?: string
}) {
  return <div className={`wo-betti ${className}`} data-engagement={engagement} aria-hidden="true">
    <BettiIllustration state={state} decorative priority={priority} sizes={sizes} />
  </div>
}

import Image from 'next/image'

export const BETTI_STATES = [
  'working',
  'question',
  'caught-up',
  'welcome',
] as const

export type BettiState = (typeof BETTI_STATES)[number]

const assets: Record<BettiState, string> = {
  working: '/betti/betti-working.png',
  question: '/betti/betti-question.png',
  'caught-up': '/betti/betti-caught-up.png',
  welcome: '/betti/betti-welcome.png',
}

const descriptions: Record<BettiState, string> = {
  working: 'Betti the Bookkeeper calmly organizing business records',
  question: 'Betti the Bookkeeper ready to ask a quick question',
  'caught-up': 'Betti the Bookkeeper with the records caught up',
  welcome: 'Betti the Bookkeeper welcoming a customer to WriteOffs',
}

const dimensions: Record<BettiState, { width: number; height: number }> = {
  working: { width: 1230, height: 1278 },
  question: { width: 1024, height: 1536 },
  'caught-up': { width: 1536, height: 1024 },
  welcome: { width: 1237, height: 1272 },
}

/**
 * The only application contract for approved Betti artwork. Betti remains
 * separate from BrandLogo and is never used as a WriteOffs brand lockup.
 * Do not render this component until the corresponding production asset exists.
 */
export function BettiIllustration({
  state,
  className,
  priority = false,
  decorative = false,
  sizes = '(max-width: 639px) 9rem, 14rem',
}: {
  state: BettiState
  className?: string
  priority?: boolean
  decorative?: boolean
  sizes?: string
}) {
  return (
    <Image
      src={assets[state]}
      alt={decorative ? '' : descriptions[state]}
      width={dimensions[state].width}
      height={dimensions[state].height}
      sizes={sizes}
      priority={priority}
      className={className}
    />
  )
}

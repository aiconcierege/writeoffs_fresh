export type BettiHomeState =
  | 'needs-customer'
  | 'attention'
  | 'working'
  | 'documentation-follow-up'
  | 'caught-up'

export type BettiHomeProjection = {
  state: BettiHomeState
  heading: string
  supporting: string
  action: { href: string; label: string; note?: string } | null
}

function named(copy: string, name: string | null) {
  return name ? `${copy}, ${name}.` : `${copy}.`
}

export function customerFirstName(metadata: Record<string, unknown> | null | undefined) {
  for (const key of ['preferred_name', 'first_name', 'full_name', 'name']) {
    const value = metadata?.[key]
    if (typeof value !== 'string') continue
    if (value.includes('@')) continue
    const first = value.trim().split(/\s+/)[0]?.replace(/[^\p{L}\p{M}'’-]/gu, '') ?? ''
    if (first && first.length <= 50) return first
  }
  return null
}

export function timeOfDayGreeting(now: Date, timeZone: string | null) {
  let hour = now.getHours()
  if (timeZone) {
    try {
      const value = new Intl.DateTimeFormat('en-US', { hour: 'numeric', hourCycle: 'h23', timeZone })
        .formatToParts(now).find(item => item.type === 'hour')?.value
      if (value != null) hour = Number(value)
    } catch {
      // A stale Business timezone should never prevent Home from loading.
    }
  }
  return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
}

export function projectBettiHome(input: {
  name: string | null
  greeting: string
  actionableReviewIds: string[]
  receiptsProcessing: number
  receiptsNeedHelp: number
  outstandingDocumentation: number
}): BettiHomeProjection {
  const reviewId = input.actionableReviewIds[0]
  if (reviewId) return {
    state: 'needs-customer',
    heading: `${input.greeting}${input.name ? `, ${input.name}` : ''}. I went through your books.`,
    supporting: 'I handled what I could on my own. I just need a few things from you to finish last week.',
    action: { href: `/weekly-review/${reviewId}`, label: 'See what Betti needs', note: 'I’ll ask one thing at a time.' },
  }
  if (input.receiptsNeedHelp > 0) return {
    state: 'attention',
    heading: named('I need your help with a receipt', input.name),
    supporting: input.receiptsNeedHelp === 1
      ? 'I couldn’t finish organizing one receipt safely. Take a look when you have a moment.'
      : `I couldn’t finish organizing ${input.receiptsNeedHelp} receipts safely. Take a look when you have a moment.`,
    action: { href: '/receipts', label: 'Check the receipts' },
  }
  if (input.receiptsProcessing > 0) return {
    state: 'working',
    heading: 'I’m still working on your books.',
    supporting: input.receiptsProcessing === 1
      ? 'I’m organizing one receipt. You don’t need to wait here.'
      : `I’m organizing ${input.receiptsProcessing} receipts. You don’t need to wait here.`,
    action: null,
  }
  if (input.outstandingDocumentation > 0) return {
    state: 'documentation-follow-up',
    heading: named('Your books are up to date', input.name),
    supporting: input.outstandingDocumentation === 1
      ? 'I’m still keeping track of one receipt that needs to be added.'
      : `I’m still keeping track of ${input.outstandingDocumentation} receipts that need to be added.`,
    action: null,
  }
  return {
    state: 'caught-up',
    heading: named('Everything’s handled', input.name),
    supporting: 'I don’t need anything from you right now.',
    action: null,
  }
}

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
  askableQuestionCount: number
  receiptsProcessing: number
  receiptsNeedHelp: number
  hasDeferredWork?: boolean
  historicalMileageNeedsAttention?: boolean
  outstandingDocumentation: number
  missingReceipts?: boolean
  historicalReview?: boolean
  documentationLimitations?: boolean
  statementAccountUseNeeded?: boolean
  bookkeepingDecisionsPending?: number
}): BettiHomeProjection {
  if(input.statementAccountUseNeeded)return {state:'needs-customer',heading:'Tell me how you used this account.',
    supporting:'One account detail will help me organize the activity in your statements.',
    action:{href:'/check-in',label:'Tell Betti about your account'}}
  if(input.missingReceipts)return {state:'documentation-follow-up',heading:'I’m missing receipts for some of your purchases.',supporting:'Let’s find the receipts you don’t have and keep the information you do.',action:{href:'/transactions?view=receipts',label:'Review missing receipts'}}
  if(input.historicalReview)return {state:'needs-customer',heading:'I found some older purchases for you to look over.',supporting:'See anything that wasn’t for the business? A quick review can save questions later.',action:{href:'/transactions?scope=historical',label:'Review older purchases'}}
  if (input.askableQuestionCount > 0) return {
    state: 'needs-customer',
    heading: `${input.greeting}${input.name ? `, ${input.name}` : ''}. I went through your books.`,
    supporting: input.askableQuestionCount > 10
      ? 'I have a few things to go over with you. I’ll take them one at a time.'
      : `I have ${input.askableQuestionCount} ${input.askableQuestionCount === 1 ? 'question' : 'questions'} for you.`,
    action: { href: '/check-in', label: 'Answer Betti’s questions' },
  }
  if(input.historicalMileageNeedsAttention)return {state:'needs-customer',heading:'Your earlier business miles are still on your list.',supporting:'Add the miles from your records, or fill in the vehicle details when you have them.',action:{href:'/mileage',label:'Review business mileage'}}
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
  if(input.hasDeferredWork)return {state:'documentation-follow-up',heading:'Your progress is saved.',supporting:'A few answers are still on your list for later. I’ll keep organizing the records I have.',action:{href:'/check-in',label:'See your saved work'}}
  if (input.outstandingDocumentation > 0 && input.missingReceipts !== false) return {
    state: 'documentation-follow-up',
    heading: named('Your books are up to date', input.name),
    supporting: input.outstandingDocumentation === 1
      ? 'I’m still keeping track of one receipt that needs to be added.'
      : `I’m still keeping track of ${input.outstandingDocumentation} receipts that need to be added.`,
    action: null,
  }
  if((input.bookkeepingDecisionsPending??0)>0)return {state:'attention',heading:'Some activity still needs review.',
    supporting:'I’m keeping unresolved activity separate from your working totals. You can review it and add supporting records.',
    action:{href:'/transactions',label:'Review activity'}}
  if(input.documentationLimitations)return {state:'documentation-follow-up',heading:'Your records are organized.',supporting:'Some older purchases still have documentation limits. Keep any records you find; they may help at tax time.',action:{href:'/reports',label:'See your reports'}}
  return {
    state: 'caught-up',
    heading: 'Your books are current.',
    supporting: 'I don’t need anything from you right now.',
    action: null,
  }
}

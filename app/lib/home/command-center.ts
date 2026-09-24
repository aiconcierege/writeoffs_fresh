import type {GuidedWorkProjection} from '../bookkeeping/guided-work-projection'

export type HomeCommand = {
  state: 'welcome' | 'needs-customer' | 'working' | 'waiting' | 'caught-up' | 'attention' | 'held' | 'unavailable'
  heading: string; supporting: string; context: string[]
  action: { href: string; label: string } | null
  alternative?: { href: string; label: string }
  education?: string
}
const dateLabel = (day: string) => new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
  .format(new Date(`${day}T00:00:00Z`))

/** Presentation only. All workload, readiness and action authority comes from Phase 1. */
export function homeCommand(work: GuidedWorkProjection, startMethod: string | null): HomeCommand {
  const next = work.nextAction
  const context: string[] = []
  if (next?.type === 'provide_records') {
    const documents = startMethod === 'statement_uploads' || startMethod === 'receipts'
    return { state: 'welcome', heading: 'I’m ready to start your books.',
      supporting: documents ? 'Send me your statements and the receipts you have. I’ll take it from there.'
        : 'Connect your business accounts so I can keep up as new activity arrives. You can also send me statements.',
      action: { href: documents ? '/import' : '/get-started', label: documents ? 'Send documents' : 'Connect accounts' },
      alternative: { href: documents ? '/get-started' : '/import', label: documents ? 'Connect accounts for automatic updates' : 'Use statements instead' },
      context: [], education: 'Send activity and receipts. I’ll do the bookkeeping and ask only when I need a fact.' }
  }
  if (work.readiness.phase === 'outside_scope') return {state:'waiting',heading:'These records are from before your books begin.',
    supporting:`Your books start ${dateLabel(work.scope.bookkeepingStart!)}. Earlier records aren’t included in these books.`,
    action:null,alternative:{href:'/onboarding?edit=1',label:'Review an earlier bookkeeping start'},context:['Your books still begin on the same date.']}
  if (next?.type === 'recover_ingestion') return { state: 'attention', heading: 'I need your help with a document.',
    supporting: 'I couldn’t finish reading it. Let’s see what’s missing.',
      action: { href: next.href, label: 'View document' }, context }
  if (next?.type === 'evidence_opportunity') return {state:'needs-customer',heading:'Before I ask you anything, do you have receipts?',
    supporting:'Send me what you have. It may answer some of my questions for you.',
    action:{href:'/check-in?returnTo=%2Fhome',label:'Send receipts'},context}
  if (next && work.customer.actionableCount > 0) {
    const href = next.href.startsWith('/check-in') ? `${next.href}${next.href.includes('?') ? '&' : '?'}returnTo=%2Fhome` : next.href
    return { state: 'needs-customer',
      heading: next.type==='account_use'?'I have a question before I get started.':'I’ve worked on your books. I have a few questions for you.',
      supporting: 'Tell me what you know. I’ll take care of the bookkeeping from there.',
      action: { href, label: next.type === 'account_use' && !href.startsWith('/check-in') ? 'Tell Betti about your account' : 'Answer Betti’s questions' }, context }
  }
  if (work.betti.genuinelyProcessing > 0) return { state: 'working', heading: 'I’m updating your books.',
    supporting: 'Your totals may change as I organize your records. I’ll let you know when the next step is ready.', action: null, context: ['I’ll ask if I need anything else.'] }
  if (work.betti.failures.length || work.betti.missingJobs.length) return {
    state: 'held', heading: 'I couldn’t finish processing some records.', supporting: 'There’s nothing I need you to answer right now. Your available books are below.', action: null, context: [] }
  if (work.betti.systemHeld.length) return {
    state: 'held', heading: 'I still have some records to review.', supporting: 'There’s nothing I need you to answer right now. I haven’t finished reviewing everything yet.', action: null, context: [] }
  if (work.betti.queued || work.betti.retryScheduled) return { state: 'waiting', heading: 'I’m updating your books.',
    supporting: work.betti.retryScheduled ? 'I need to try part of the work again. You don’t need to wait here.' : 'Your totals may change as I organize your records. I’ll let you know when the next step is ready.', action: null, context: [] }
  if (work.customer.deferredCount) return { state: 'waiting', heading: 'You’re all set for now.',
    supporting: 'I saved the things you want to come back to. I’ll keep working with what I have.', action: null, context: [] }
  if (work.readiness.booksCurrentThrough) return { state: 'caught-up', heading: `Your books are current through ${dateLabel(work.readiness.booksCurrentThrough)}.`,
    supporting: 'Keep sending me your records. I’ll ask when I need something.', action: null, context: [] }
  if (work.readiness.knownAccountsOrganizedThrough) return { state: 'caught-up', heading: 'Your available records are organized.',
    supporting: `Through ${dateLabel(work.readiness.knownAccountsOrganizedThrough)}, for the accounts and statement periods you’ve provided.`, action: null, context: [] }
  return { state: 'caught-up', heading: 'You’re all set for now.',
    supporting: 'There’s nothing I need you to answer right now. Your working books reflect the records available so far.', action: null, context: [] }
}

export const unavailableHomeCommand: HomeCommand = { state: 'unavailable', heading: 'Your books are here.',
  supporting: 'I couldn’t load my work summary just now. Refresh to try again.', action: null, context: [] }

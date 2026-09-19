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
  if (work.customer.actionableCount) context.push(`${work.customer.actionableCount} ${work.customer.actionableCount===1?'thing needs':'things need'} you`)
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
    supporting:`Your books start ${dateLabel(work.scope.bookkeepingStart!)}. I’ve kept the earlier evidence, but it isn’t part of your active books.`,
    action:null,alternative:{href:'/onboarding?edit=1',label:'Review an earlier bookkeeping start'},context:['Your current bookkeeping scope stays unchanged.']}
  if (next?.type === 'recover_ingestion') return { state: 'attention', heading: 'I need your help with a document.',
    supporting: 'I couldn’t finish organizing it. Your document is safe—let’s take a look.',
    action: { href: next.href, label: 'View document' }, context }
  if (next && work.customer.actionableCount > 0) {
    const earlier = work.progress.catchUp.customerActions > 0 || (work.index?.summaryCurrent!==false && work.progress.catchUp.activity > 0 && work.readiness.catchUp === 'work_remaining')
    const current = (work.index?.summaryCurrent!==false && work.progress.current.activity > 0) || work.progress.current.customerActions > 0
    const href = next.href.startsWith('/check-in') ? `${next.href}${next.href.includes('?') ? '&' : '?'}returnTo=%2Fhome` : next.href
    return { state: 'needs-customer',
      heading: 'I have a few questions for you.',
      supporting: earlier && current ? 'I’ve worked through your activity to get you caught up and keep up. Tell me a few facts, and I’ll take it from there.'
        : 'I’ve reviewed the information you sent. Tell me a few facts, and I’ll take it from there.',
      action: { href, label: next.type === 'account_use' && !href.startsWith('/check-in') ? 'Tell Betti about your account' : 'Continue with Betti' }, context }
  }
  if (work.betti.genuinelyProcessing > 0) return { state: 'working', heading: 'I’m organizing the records you sent.',
    supporting: 'You can leave this page while I work. I’ll ask if I need anything after I’ve looked through them.', action: null, context: ['I’ll ask when I need something from you.'] }
  if (work.betti.failures.length || work.betti.missingJobs.length || work.betti.systemHeld.length) return {
    state: 'held', heading: 'Your records are safe.', supporting: 'Some work needs another look before I can finish. There’s nothing you need to answer right now.', action: null, context: [] }
  if (work.betti.queued || work.betti.retryScheduled) return { state: 'waiting', heading: 'Your records are received.',
    supporting: work.betti.retryScheduled ? 'Some processing is waiting to try again. I’ll check what I need from you afterward.' : 'I haven’t finished reviewing them yet. There’s nothing to answer right now.', action: null, context: [] }
  if (work.customer.deferredCount) return { state: 'waiting', heading: 'You’re done for now.',
    supporting: 'The things you set aside are saved for later. Your available working numbers are below.', action: null, context: [] }
  if (work.readiness.booksCurrentThrough) return { state: 'caught-up', heading: `Your books are current through ${dateLabel(work.readiness.booksCurrentThrough)}.`,
    supporting: 'Keep sending me your records. I’ll ask when I need something.', action: null, context: [] }
  if (work.readiness.knownAccountsOrganizedThrough) return { state: 'caught-up', heading: 'Your available records are organized.',
    supporting: `Through ${dateLabel(work.readiness.knownAccountsOrganizedThrough)}, for the accounts and statement periods you’ve provided.`, action: null, context: [] }
  return { state: 'caught-up', heading: 'You’re done for now.',
    supporting: 'There’s nothing I need you to answer right now. Your working books reflect the records available so far.', action: null, context: [] }
}

export const unavailableHomeCommand: HomeCommand = { state: 'unavailable', heading: 'Your books are here.',
  supporting: 'I couldn’t load my work summary just now. Refresh to try again.', action: null, context: [] }

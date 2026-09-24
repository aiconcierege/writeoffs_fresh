import type {BettiWorkProjection} from './betti-work'
import type {ActionIndexFreshness} from './action-index-model'
import type {ActionPresentation} from './action-presentation'

/** Conversation DTO: exact canonical action and counts, without the full action
 * universe, job list or coverage diagnostics. It is never a partial FullWork value.
 * No eligibility or ranking is recalculated here. Full work structurally satisfies
 * this contract, allowing initial server rendering and refresh to share the UI. */
export type GuidedWorkProjection = Pick<BettiWorkProjection,
 'version'|'businessId'|'asOf'|'scopeVersion'|'progress'|'readiness'|'nextAction'> & {
 scope:Pick<BettiWorkProjection['scope'],'bookkeepingStart'>
 customer:Pick<BettiWorkProjection['customer'],'actionableCount'|'deferredCount'|'sharedCount'> & {substantiveCount?:number}
 betti:Pick<BettiWorkProjection['betti'],'genuinelyProcessing'|'queued'|'retryScheduled'|'failures'|'missingJobs'|'systemHeld'>
 index?:ActionIndexFreshness
 presentation?:ActionPresentation
}
export function guidedWorkProjection(work:BettiWorkProjection&{index?:ActionIndexFreshness}):GuidedWorkProjection {
 return {version:work.version,businessId:work.businessId,asOf:work.asOf,scopeVersion:work.scopeVersion,
  ...(work.index?{index:work.index}:{}),
  scope:{bookkeepingStart:work.scope.bookkeepingStart},progress:work.progress,readiness:work.readiness,
  nextAction:work.nextAction,
  customer:{substantiveCount:work.customer.substantiveCount,actionableCount:work.customer.actionableCount,deferredCount:work.customer.deferredCount,sharedCount:work.customer.sharedCount},
  betti:{genuinelyProcessing:work.betti.genuinelyProcessing,queued:work.betti.queued,retryScheduled:work.betti.retryScheduled,
   failures:work.betti.failures,missingJobs:work.betti.missingJobs,systemHeld:work.betti.systemHeld},
 }
}

/** Dirty indexes can retain valid rows while omitting newly ready or held work.
 * They are not authoritative for choosing a new conversational turn. */
export function authoritativeContinuation(work:GuidedWorkProjection){
 return !work.index||work.index.summaryCurrent===true
}

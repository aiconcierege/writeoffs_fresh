import type {IndexedWorkProjection} from './action-index-model'
import type {BettiWorkProjection,WorkAction} from './betti-work'

export type PresentedAction = {id:string;version:string}
export type ActionPresentation = {
 status:'retained'|'settling'|'rechecking'|'updated'|'resolved'|'deferred'
 action:WorkAction|null
}

/** Read-only presentation continuity over the SAME canonical eligible set.
 * A changed recommendation is not a reason to withdraw an eligible question.
 * Absence from an invalidated index is not proof that a question was resolved.
 * No customer-provided action content or record IDs are trusted here. */
export function actionPresentation(work:BettiWorkProjection|IndexedWorkProjection,presented:PresentedAction):ActionPresentation {
 const current=work.customer.actionable.find(a=>a.id===presented.id)
 if(current?.version===presented.version)return {status:'retained',action:current}
 if(current)return {status:'updated',action:current}
 if(work.customer.deferred.some(a=>a.id===presented.id))return {status:'deferred',action:null}
 if(('index' in work&&!work.index.summaryCurrent)||work.betti.waiting.length||work.betti.jobs.length||work.betti.missingJobs.length)
  return work.nextAction?{status:'rechecking',action:work.nextAction}:{status:'settling',action:null}
 // A batch can be regrouped or a question superseded, not answered. Absence
 // alone must not claim the supplied evidence resolved a fact that is still
 // being requested in another canonical action.
 return work.nextAction?{status:'updated',action:work.nextAction}:{status:'resolved',action:null}
}

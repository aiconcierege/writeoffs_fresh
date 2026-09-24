import type {WorkContext,BettiWorkProjection} from './betti-work'
export type DocumentReview = {phase:'processing'|'needs_attention'|'ready';remainingFact:boolean;loanSplit?:{principalCents:number;interestCents:number}}
/** Presentation only. Document completion and dependent reassessment must both
 * finish. An unrelated ready question is never evidence of upload completion. */
export function documentReviewState(input:{documentIds:string[];recordIds:string[];components?:{anchor:string;record:string}[];documents:{id:string;state:string}[];receiptIds:string[];context:WorkContext;work:BettiWorkProjection}):DocumentReview{
 const docs=new Set(input.documentIds),receipts=new Set(input.receiptIds),records=new Set(input.recordIds)
 for(const link of input.context.documentRecords??[])if(docs.has(link.document_id))records.add(link.record_id)
 for(const component of input.components??[])if(records.has(component.anchor))records.add(component.record)
 for(const doc of input.context.documents)if(docs.has(doc.id)&&doc.receipt_id)receipts.add(doc.receipt_id)
 for(const link of input.context.links)if(receipts.has(link.receipt_id))records.add(link.record_id)
 const jobs=input.context.jobs.filter(j=>docs.has(j.document_id??'')||receipts.has(j.receipt_id??'')||records.has(j.record_id??''))
 const remainingFact=input.work.customer.actionable.some(a=>a.type!=='evidence_opportunity'&&a.recordIds.some(id=>records.has(id)))
 if(input.work.betti.missingJobs.some(j=>docs.has(j.documentId)))return{phase:'needs_attention',remainingFact}
 if(input.documents.some(d=>['dead_letter','needs_attention','unreadable','set_aside'].includes(d.state))||jobs.some(j=>j.state==='dead_letter'))return{phase:'needs_attention',remainingFact}
 if(input.documents.length!==docs.size||input.documents.some(d=>d.state!=='completed')||jobs.some(j=>['pending','processing','retryable'].includes(j.state)))return{phase:'processing',remainingFact}
 return{phase:'ready',remainingFact}
}

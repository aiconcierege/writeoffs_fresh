import type {GuidedWorkProjection} from '../../lib/bookkeeping/guided-work-projection'
import {homeCommand} from '../../lib/home/command-center'

export type ConversationOutcome = 'answered' | 'deferred' | 'receipts-deferred' | null

export function savedAcknowledgment(outcome:ConversationOutcome) {
 return outcome==='receipts-deferred'?'No problem. I saved those receipts for later.'
  :outcome==='deferred'?'No problem. I saved that for later.'
  :'Got it. I’ve saved what you told me.'
}

/** Presentation only, used when no canonical action is ready. A saved deferral
 * never manufactures processing or hides another ready action. Real failures
 * remain visible separately from the customer's successfully saved choice. */
export function conversationStatus(work:GuidedWorkProjection,outcome:ConversationOutcome,paused=false){
 const home=homeCommand(work,'statement_uploads')
 const waiting=work.betti.genuinelyProcessing+work.betti.queued+work.betti.retryScheduled>0
 const processingProblem=work.betti.failures.length>0||work.betti.missingJobs.length>0
 const held=work.betti.systemHeld.length>0
 if(work.presentation?.status==='settling')return {heading:'I’m checking the next thing.',supporting:'You don’t need to wait here.',waiting:true,alternative:undefined,operationalNote:undefined}
 const savedForLater=work.customer.deferredCount>0
 const justDeferred=outcome==='deferred'||outcome==='receipts-deferred'
 if(justDeferred||(savedForLater&&!waiting))return {
  heading:'You’re all set for now.',
  supporting:outcome==='receipts-deferred'?'I’ll keep working with what I have. You can send those receipts whenever you’re ready.':'I saved the things you want to come back to. I’ll keep working with what I have.',
  operationalNote:processingProblem?'I couldn’t finish processing some records. There’s nothing else you need to answer right now.':undefined,
  waiting,alternative:undefined,
 }
 if(waiting)return {
  heading:outcome==='answered'?'Got it. I’m updating your books.':work.betti.genuinelyProcessing?'I’m working on your books.':'I have more to review.',
  supporting:paused?'This is taking a little longer. You don’t need to wait here.':outcome==='answered'?'I’m using what you told me to finish what I can. You don’t need to wait here.':'I’m reviewing what you’ve shared. You don’t need to wait here.',
  waiting,alternative:undefined,operationalNote:undefined,
 }
 if(processingProblem)return {heading:'I couldn’t finish processing some records.',supporting:'There’s nothing you need to answer right now. Your available books are still here.',waiting,alternative:undefined,operationalNote:undefined}
 if(held)return {heading:'You’re all set for now.',supporting:'There’s nothing else I need you to answer right now. I still have records to review.',waiting,alternative:undefined,operationalNote:undefined}
 return {heading:home.heading,supporting:home.supporting,alternative:home.alternative,waiting,operationalNote:undefined}
}

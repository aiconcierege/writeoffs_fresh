type MixedUseCandidate={
 amountCents:number
 bookkeepingNature:string|null
 treatment:string
 activeIssueReasons:string[]
}

export function isWeeklyMixedUseCandidate(item:MixedUseCandidate){
 return item.amountCents<0
  &&(item.bookkeepingNature===null||item.bookkeepingNature==='expense')
  &&['business','unresolved'].includes(item.treatment)
  &&item.activeIssueReasons.every(reason=>reason==='MIXED_USE_CLARIFICATION')
}

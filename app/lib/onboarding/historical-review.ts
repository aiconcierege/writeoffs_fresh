import type {CustomerQuestion} from '../bookkeeping/customer-questions'
/** Discovery and resolution stay canonical. This only separates customer work. */
export function splitHistoricalQuestions(questions:CustomerQuestion[],ongoingFrom:string) {
  return {
    historical:questions.filter(q=>q.transaction.date!=null&&q.transaction.date<ongoingFrom),
    ongoing:questions.filter(q=>q.transaction.date==null||q.transaction.date>=ongoingFrom),
  }
}
export function historicalReviewGroups(questions:CustomerQuestion[]) {
  const groups=new Map<string,{merchant:string;count:number;mealDocumentation:boolean}>()
  for(const question of questions){const merchant=question.transaction.merchant||'Other activity';const group=groups.get(merchant)??{merchant,count:0,mealDocumentation:false};group.count++;group.mealDocumentation ||=question.kind==='meal_relationship';groups.set(merchant,group)}
  return [...groups.values()].sort((a,b)=>b.count-a.count||a.merchant.localeCompare(b.merchant))
}

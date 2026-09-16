/** Bounded deterministic extraction. Ambiguous totals, dates or extra charges fail closed. */
export type LoanPaymentFacts={paymentDate:string;paymentCents:number;principalCents:number;interestCents:number}
export function parseLoanPaymentStatement(text:string):LoanPaymentFacts|null{
 if(!/\bloan\s+(?:statement|payment|account)\b/i.test(text))return null
 const amount=(label:string)=>{
  const matches=[...text.matchAll(new RegExp(`(?:^|\\n)\\s*${label}\\s*[:$ ]+([0-9][0-9,]*\\.[0-9]{2})\\s*(?:\\n|$)`,'gim'))]
  if(matches.length!==1)return null
  const [d,c]=matches[0][1].replaceAll(',','').split('.');const n=Number(d)*100+Number(c)
  return Number.isSafeInteger(n)&&n>=0?n:null
 }
 const principal=amount('principal(?: paid)?'),interest=amount('interest(?: paid)?'),payment=amount('(?:total payment|payment amount)')
 const dates=[...text.matchAll(/(?:^|\n)\s*payment date\s*:\s*(\d{4}-\d{2}-\d{2})\s*(?:\n|$)/gi)]
 if(dates.length!==1||principal==null||interest==null||payment==null||principal<=0||interest<=0||principal+interest!==payment)return null
 const date=dates[0][1];if(Number.isNaN(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date)return null
 return {paymentDate:date,paymentCents:payment,principalCents:principal,interestCents:interest}
}

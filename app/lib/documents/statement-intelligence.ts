import 'server-only'

import { createHash } from 'node:crypto'

export type StatementAccountType = 'checking'|'savings'|'credit_card'
export type StatementTransaction = { transactionDate:string; postingDate:string|null; rawDescription:string;
  normalizedDescription:string; amountCents:number; runningBalanceCents:number|null; checkNumber:string|null;
  sourcePage:number; sourceRow:number; evidenceFingerprint:string }
export type StatementPeriod = { periodIdentity:string; institutionName:string; maskedAccount:string|null;
  accountType:StatementAccountType; currency:string; periodStart:string|null; periodEnd:string|null;
  issueDate:string|null; beginningBalanceCents:number|null; endingBalanceCents:number|null;
  validationStatus:'validated'|'partially_validated'|'unresolved'; sourcePageStart:number;sourcePageEnd:number;
  ambiguousRowCount:number; transactions:StatementTransaction[] }

const sha=(value:string)=>createHash('sha256').update(value).digest('hex')
const iso=(year:number,month:number,day:number)=>{const value=`${year.toString().padStart(4,'0')}-${month.toString().padStart(2,'0')}-${day.toString().padStart(2,'0')}`;
  const parsed=new Date(`${value}T00:00:00Z`);return parsed.getUTCFullYear()===year&&parsed.getUTCMonth()+1===month&&parsed.getUTCDate()===day?value:null}
const cents=(value:string)=>{let clean=value.replace(/[$,\s]/g,'');const paren=/^\(.*\)$/.test(clean);if(paren)clean=clean.slice(1,-1);
  if(!/^[+-]?\d+\.\d{2}$/.test(clean))return null;const sign=(clean.startsWith('-')?-1:1)*(paren?-1:1);const [whole,fraction]=clean.replace(/^[+-]/,'').split('.');
  const result=sign*(Number(whole)*100+Number(fraction));return Number.isSafeInteger(result)&&result!==0?result:null}

export function normalizeStatementDescription(value:string){return value.toUpperCase().replace(/\b(?:REF|REFERENCE|TRACE|TERMINAL)\s*#?\w+\b/g,' ')
  .replace(/\s+/g,' ').trim().slice(0,512)}

function dateFrom(value:string,periodStart:string|null,periodEnd:string|null){
  let match=/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(value);if(match)return iso(+match[1],+match[2],+match[3])
  match=/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(value);if(match){const year=match[3].length===2?2000+(+match[3]):+match[3];return iso(year,+match[1],+match[2])}
  match=/^(\d{1,2})\/(\d{1,2})$/.exec(value);if(!match||!periodStart||!periodEnd)return null
  const month=+match[1],day=+match[2],startYear=+periodStart.slice(0,4),endYear=+periodEnd.slice(0,4)
  return [startYear,endYear].map(year=>iso(year,month,day)).find(candidate=>candidate&&candidate>=periodStart&&candidate<=periodEnd)??null
}

function periodDates(text:string){const match=/(?:statement\s+period|period)\s*:?\s*(\d{1,2}\/\d{1,2}\/\d{2,4}|\d{4}-\d{1,2}-\d{1,2})\s*(?:-|to|through)\s*(\d{1,2}\/\d{1,2}\/\d{2,4}|\d{4}-\d{1,2}-\d{1,2})/i.exec(text)
  if(!match)return {start:null,end:null};return {start:dateFrom(match[1],null,null),end:dateFrom(match[2],null,null)}}
function accountType(text:string,documentClass:string):StatementAccountType{return /credit\s*card|cardmember|payment due/i.test(text)||documentClass==='card_statement'?'credit_card':/savings/i.test(text)?'savings':'checking'}
function institution(text:string){const explicit=/(?:institution|bank|issuer)\s*:\s*([^\n]{2,100})/i.exec(text)?.[1]?.trim();if(explicit)return explicit
  return text.split('\n').map(line=>line.trim()).find(line=>/bank|credit union|card/i.test(line)&&line.length<=100)??'Statement account'}
function mask(text:string){return /(?:ending in|account(?: number)?|card)\s*(?:#|:|x+|\*+)?\s*(\d{4})\b/i.exec(text)?.[1]??null}
function labeledMoney(text:string,label:RegExp){const line=text.split('\n').find(value=>label.test(value));if(!line)return null
  const values=line.match(/\(?-?\$?[0-9][0-9,]*\.\d{2}\)?/g)??[];return values.length?cents(values[values.length-1]):null}
function signAmount(raw:number,description:string,type:StatementAccountType,rawToken:string){if(/^[+(]/.test(rawToken.trim())||rawToken.trim().startsWith('-'))return raw
  if(type==='credit_card')return /payment|refund|credit|cashback|reward/i.test(description)?Math.abs(raw):-Math.abs(raw)
  return /deposit|credit|interest paid|refund/i.test(description)?Math.abs(raw):/withdrawal|debit|check|fee|payment|purchase/i.test(description)?-Math.abs(raw):null}

function parseStatementGroup(input:{pages:{page:number;text:string}[];documentClass:string;documentSha256:string}){
  const all=input.pages.map(page=>page.text).join('\n');const dates=periodDates(all);const type=accountType(all,input.documentClass)
  const institutionName=institution(all),maskedAccount=mask(all),currency=/\b(?:CAD|EUR|GBP|AUD)\b/.exec(all)?.[0]??'USD'
  const beginning=labeledMoney(all,/beginning balance|opening balance/i),ending=labeledMoney(all,/ending balance|closing balance/i)
  const occurrences=new Map<string,number>();const transactions:StatementTransaction[]=[];let ambiguous=0
  for(const page of input.pages){const lines=page.text.replace(/\r/g,'').split('\n').map(line=>line.trim()).filter(Boolean)
    lines.forEach((line,index)=>{if(/balance|statement period|amount due|payment due/i.test(line))return
      const match=/^(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?|\d{4}-\d{1,2}-\d{1,2})\s+(.+?)\s+(\(?[+-]?\$?[\d,]+\.\d{2}\)?)(?:\s+(\(?[+-]?\$?[\d,]+\.\d{2}\)?))?$/.exec(line)
      if(!match)return;const transactionDate=dateFrom(match[1],dates.start,dates.end),rawAmount=cents(match[3]);const description=match[2].trim().slice(0,512)
      const signed=rawAmount===null?null:signAmount(rawAmount,description,type,match[3]);if(!transactionDate||signed===null){ambiguous++;return}
      const running=match[4]?cents(match[4]):null,normalized=normalizeStatementDescription(description)
      if(!normalized){ambiguous++;return}const check=/\bCHECK\s*#?([0-9]{2,12})\b/i.exec(description)?.[1]??null
      const base=[institutionName.toUpperCase(),maskedAccount??'',type,currency,transactionDate,signed,normalized,running??'',check??''].join('|')
      const occurrence=(occurrences.get(base)??0)+1;occurrences.set(base,occurrence)
      transactions.push({transactionDate,postingDate:null,rawDescription:description,normalizedDescription:normalized,amountCents:signed,
        runningBalanceCents:running,checkNumber:check,sourcePage:page.page,sourceRow:index+1,evidenceFingerprint:sha(`statement-evidence:v1|${base}|${occurrence}`)})
    })
  }
  const inflow=transactions.filter(row=>row.amountCents>0).reduce((sum,row)=>sum+row.amountCents,0)
  const outflow=transactions.filter(row=>row.amountCents<0).reduce((sum,row)=>sum+row.amountCents,0)
  const balanceValid=beginning!==null&&ending!==null&&beginning+inflow+outflow===ending
  const validationStatus=balanceValid?'validated':transactions.length?'partially_validated':'unresolved'
  const identity=sha(['statement-period:v1',institutionName.toUpperCase(),maskedAccount??'',type,currency,dates.start??input.documentSha256,
    dates.end??input.pages[0]?.page??1].join('|'))
  return [{periodIdentity:identity,institutionName,maskedAccount,accountType:type,currency,periodStart:dates.start,periodEnd:dates.end,
    issueDate:null,beginningBalanceCents:beginning,endingBalanceCents:ending,validationStatus,sourcePageStart:input.pages[0]?.page??1,
    sourcePageEnd:input.pages.at(-1)?.page??1,ambiguousRowCount:ambiguous,transactions} satisfies StatementPeriod]
}

export function parseStatementPages(input:{pages:{page:number;text:string}[];documentClass:string;documentSha256:string}){
  const groups:{pages:{page:number;text:string}[];key:string}[]=[];let currentKey='unidentified'
  for(const page of input.pages){const dates=periodDates(page.text);const key=dates.start&&dates.end?`${dates.start}|${dates.end}`:currentKey
    if(groups.length===0||key!==currentKey){groups.push({pages:[],key});currentKey=key}groups.at(-1)!.pages.push(page)}
  return groups.flatMap(group=>parseStatementGroup({...input,pages:group.pages}))
}

export function periodToRpc(period:StatementPeriod){return {period:{period_identity:period.periodIdentity,institution_name:period.institutionName,
  masked_account:period.maskedAccount,account_type:period.accountType,currency:period.currency,period_start:period.periodStart,
  period_end:period.periodEnd,issue_date:period.issueDate,beginning_balance_cents:period.beginningBalanceCents,
  ending_balance_cents:period.endingBalanceCents,validation_status:period.validationStatus,source_page_start:period.sourcePageStart,
  source_page_end:period.sourcePageEnd,ambiguous_row_count:period.ambiguousRowCount},rows:period.transactions.map(row=>({
    evidence_fingerprint:row.evidenceFingerprint,transaction_date:row.transactionDate,posting_date:row.postingDate,
    raw_description:row.rawDescription,normalized_description:row.normalizedDescription,amount_cents:row.amountCents,
    running_balance_cents:row.runningBalanceCents,check_number:row.checkNumber,source_page:row.sourcePage,source_row:row.sourceRow}))}}

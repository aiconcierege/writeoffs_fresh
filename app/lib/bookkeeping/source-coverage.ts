/** Evidence availability is not an assertion that an institution supplied every record. */
export type CoverageInput = { authorizedStart:string|null; requestedStart:string|null; through:string;
 accounts:{id:string;name:string;mask:string|null;provider:string|null;connected:boolean;bankFrom:string|null;bankThrough:string|null;quarantined:number;
 statements:{from:string|null;through:string|null;validated:boolean}[]}[] }
type Interval={from:string;through:string}
const day=(date:string,delta:number)=>new Date(Date.parse(date+'T00:00:00Z')+delta*86400000).toISOString().slice(0,10)
function gaps(start:string,end:string,ranges:Interval[]):Interval[]{
 let cursor=start;const result:Interval[]=[]
 for(const r of [...ranges].sort((a,b)=>a.from.localeCompare(b.from))){
  if(r.through<cursor||r.from>end)continue
  if(r.from>cursor)result.push({from:cursor,through:day(r.from,-1)})
  cursor=cursor>day(r.through,1)?cursor:day(r.through,1);if(cursor>end)break
 }
 if(cursor<=end)result.push({from:cursor,through:end});return result
}
export function projectSourceCoverage(input:CoverageInput){
 const start=input.authorizedStart ? [input.authorizedStart,input.requestedStart??input.authorizedStart].sort().at(-1)!:null
 const accounts=input.accounts.map(a=>{
  const confirmed=a.statements.filter(s=>s.validated&&s.from&&s.through).map(s=>({from:s.from!,through:s.through!}))
  const bank=a.bankFrom&&a.bankThrough&&a.bankFrom<=a.bankThrough?{from:a.bankFrom,through:a.bankThrough}:null
  return {id:a.id,name:a.name,mask:a.mask,bank,quarantined:a.quarantined,
   // These intervals guide record collection only. They never certify completeness.
   recordsNeeded:start&&start<=input.through?gaps(start,input.through,[...confirmed,...(bank?[bank]:[])]):[],
   unconfirmed:start&&start<=input.through?gaps(start,input.through,confirmed):[]}
 })
 return {start,through:input.through,accounts,needsRecords:accounts.some(a=>a.recordsNeeded.length>0),
  hasRejectedRecords:accounts.some(a=>a.quarantined>0),sourceUniverseConfirmed:false as const}
}
export type SourceCoverage=ReturnType<typeof projectSourceCoverage>

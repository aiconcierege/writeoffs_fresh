'use client'
import {useEffect,useState} from 'react'
type Candidate={statement_account_id:string;target_account_id:string;display_name:string;strong_identity:boolean}
type Statement={statement_account_id:string|null;institution_name:string|null;masked_account:string|null}
export function StatementAccountLinks({revision}:{revision:string}){
 const [groups,setGroups]=useState<{account:string;name:string;choices:Candidate[]}[]>([]),[choice,setChoice]=useState<Record<string,string>>({}),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[retry,setRetry]=useState(0)
 useEffect(()=>{const controller=new AbortController();void Promise.all(['/api/documents/statements/accounts','/api/documents/statements'].map(async url=>{const r=await fetch(url,{cache:'no-store',signal:controller.signal});if(!r.ok)throw Error();return r.json()})).then(([accounts,statements])=>{
  const linked=new Set((accounts.links??[]).map((x:{statement_account_id:string})=>x.statement_account_id)),candidates=accounts.candidates as Candidate[]
  const docs=statements.documents as Statement[]
  setGroups([...new Set(candidates.map(c=>c.statement_account_id))].filter(id=>!linked.has(id)).map(account=>{const d=docs.find(x=>x.statement_account_id===account);return{account,name:`${d?.institution_name??'Statement account'}${d?.masked_account?` · ${d.masked_account}`:''}`,choices:candidates.filter(c=>c.statement_account_id===account)}}))
 }).catch(()=>{if(!controller.signal.aborted)setMessage('I couldn’t check the statement accounts. Try again.')});return()=>controller.abort()},[revision,retry])
 async function link(account:string){if(busy||!choice[account])return;setBusy(true);setMessage('')
  try{const r=await fetch('/api/documents/statements/accounts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({statementAccountId:account,targetAccountId:choice[account],requestKey:crypto.randomUUID()})});if(!r.ok)throw Error();setGroups(g=>g.filter(x=>x.account!==account));setMessage('Got it. I’ll use these statements for that account.')}
  catch{setMessage('I couldn’t connect those records. Please try again.')}finally{setBusy(false)}
 }
 return <>{groups.map(g=><section key={g.account} className="source-coverage"><h3>{g.name}</h3><label htmlFor={`statement-link-${g.account}`}>Is this a statement for an account you’ve already connected?</label><select id={`statement-link-${g.account}`} className="input min-h-11 my-2" value={choice[g.account]??''} onChange={e=>setChoice({...choice,[g.account]:e.target.value})}><option value="">Choose an account, or leave it separate</option>{g.choices.map(c=><option key={c.target_account_id} value={c.target_account_id}>{c.display_name}{c.strong_identity?' · Suggested':''}</option>)}</select><button className="btn btn-secondary" disabled={busy||!choice[g.account]} onClick={()=>void link(g.account)}>Use this account</button></section>)}{message&&<p role="status">{message}{message.includes('couldn’t')&&<button type="button" className="btn btn-secondary" onClick={()=>setRetry(v=>v+1)}>Try again</button>}</p>}</>
}

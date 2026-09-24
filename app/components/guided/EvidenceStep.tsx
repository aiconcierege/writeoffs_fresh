'use client'
import {useRef,useState} from 'react'
import type {WorkAction} from '../../lib/bookkeeping/betti-work'
import type {GuidedWorkProjection} from '../../lib/bookkeeping/guided-work-projection'
import {DocumentIntake} from '../../documents/DocumentIntake'
export function EvidenceStep({action,busy,perform,onPending,showIntroduction=true,onProvided}:{onProvided?:(ids:string[],command:()=>Promise<GuidedWorkProjection|void>)=>Promise<void>;showIntroduction?:boolean;action:WorkAction;busy:boolean;perform:(fn:()=>Promise<GuidedWorkProjection|void>,deferred?:boolean)=>Promise<void>;onPending:(pending:boolean,message?:string)=>void}){
 const request=useRef<{signature:string;id:string}|null>(null)
 const [uploading,setUploading]=useState(false)
 const [received,setReceived]=useState<string[]>([])
 const month=new Intl.DateTimeFormat('en-US',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(`${action.items![0].date.slice(0,7)}-01T12:00:00Z`))
 function save(response:'provided'|'none'|'later',documentIds:string[]=[]){const command=async()=>{
  const payload={actionId:action.id,version:action.version,items:action.items,response,documentIds},signature=JSON.stringify(payload)
  if(request.current?.signature!==signature)request.current={signature,id:crypto.randomUUID()}
  const result=await fetch('/api/bookkeeping/work/evidence',{method:'POST',headers:{'content-type':'application/json','x-betti-guided':'1'},body:JSON.stringify({...payload,requestId:request.current.id}),signal:AbortSignal.timeout(15000)})
  const body=await result.json();if(!result.ok)throw new Error(body.error??'Please try again.');return body.work as GuidedWorkProjection|undefined
 };return response==='provided'&&onProvided?onProvided(documentIds,command):perform(command,response==='later')}
 return <>{showIntroduction&&<><h1>Have receipts? Send them first.</h1><p className="betti-explanation">{action.workstream==='catch_up'?`I’m working on ${month}. Receipts and bills may answer some of my questions for you.`:'Send any receipts or bills you have. They may answer some of my questions for you.'}</p></>}
 <p className="betti-workstream">{month} · {action.account?.name}{action.account?.mask?` · ${action.account.mask}`:''}</p>
 <DocumentIntake guided compact primary={!showIntroduction} disabled={busy} buttonLabel="Send receipts" onUploadState={(pending,result)=>{
  setUploading(pending);onPending(pending,'Receiving your documents…')
  if(!pending&&result?.documentIds.length){const ids=[...new Set([...received,...result.documentIds])];setReceived(ids);if(!result.failed)void save('provided',ids.slice(0,10))}
 }}/>
 {received.length>0?<button className="btn btn-primary" disabled={busy||uploading} onClick={()=>void save('provided',received.slice(0,10))}>Continue with these documents →</button>:<div className="betti-continue"><button className="btn btn-secondary" disabled={busy||uploading} onClick={()=>void save('none')}>I don’t have any</button><button className="betti-defer" disabled={busy||uploading} onClick={()=>void save('later')}>I’ll do this later</button></div>}
 <p className="betti-explanation">You can send documents later, too. I’ll keep working with what I have.</p></>
}

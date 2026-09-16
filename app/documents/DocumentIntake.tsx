'use client'
import {useEffect,useRef,useState} from 'react'
import Link from 'next/link'
import {useRouter} from 'next/navigation'
import {supabase} from '../../utils/supabase/client'
import {fileKind} from '../lib/documents/file-validation'
import {runBoundedBatch} from '../lib/documents/batch-intake'
type Document={id:string;original_name:string;document_class:string;state:string;reason:string|null;receipt_outcome:string|null;transaction_count:number}
export function DocumentIntake({compact=false,recordId}:{compact?:boolean;recordId?:string}){
 const router=useRouter()
 const input=useRef<HTMLInputElement>(null),busyRef=useRef(false),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[documents,setDocuments]=useState<Document[]>([]),[paused,setPaused]=useState(false)
 async function refresh(){const r=await fetch('/api/documents',{cache:'no-store'});if(r.ok){const b=await r.json();setDocuments(b.documents??[]);setPaused(b.processingPaused===true)}}
 useEffect(()=>{void refresh()},[])
 const pending=documents.some(d=>['pending','retryable','processing'].includes(d.state))
 useEffect(()=>{if(!pending)return;const timer=setInterval(()=>void refresh(),4000);return()=>clearInterval(timer)},[pending])
 async function upload(files:File[]){
  if(!files.length||busyRef.current)return
  if(files.length>10){setMessage('Choose up to 10 documents at a time.');return}
  busyRef.current=true;setBusy(true);setMessage('Sending your documents…')
  try{
   const{data:{user}}=await supabase.auth.getUser();if(!user){router.push('/login');return}
   const results=await runBoundedBatch({items:files,concurrency:2,process:async(file)=>{
    if(!file.size||file.size>20*1024*1024)throw new Error('SIZE')
    const bytes=new Uint8Array(await file.arrayBuffer()),kind=fileKind(bytes),mime=kind==='pdf'?'application/pdf':kind==='text'?'text/csv':['png','jpeg','webp'].includes(kind)?`image/${kind}`:'application/octet-stream'
    const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(n=>n.toString(16).padStart(2,'0')).join(''),path=`receipts/${user.id}/${hash}`
    const stored=await supabase.storage.from('receipts').upload(path,file,{contentType:mime,upsert:false})
    if(stored.error&&!/already exists|duplicate/i.test(stored.error.message))throw new Error('UPLOAD')
    const r=await fetch('/api/documents',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id:crypto.randomUUID(),fingerprint:hash,name:file.name,mime,bytes:file.size,...(recordId?{recordId}:{})})})
    if(!r.ok)throw new Error('REGISTER');return file.name
   }})
   const failed=results.filter(r=>r.status==='rejected').length,received=results.length-failed
   setMessage(`${received} ${received===1?'document':'documents'} received.${failed?` ${failed} could not be sent. Check the file is under 20 MB and try again.`:' You can leave while Betti organizes them.'}`);await refresh()
  }catch{setMessage('Your documents could not be sent. Please try again.')}
  finally{busyRef.current=false;setBusy(false);if(input.current)input.current.value=''}
 }
 return <div className={`document-intake min-w-0 ${compact?'document-intake-compact':''}`}>
  <p className="text-sm leading-6 text-slate-600">Send me receipts and statements. I’ll figure out where they belong.</p>
  <button type="button" className="btn btn-secondary mt-3 min-h-11" disabled={busy} onClick={()=>input.current?.click()}>{busy?'Sending…':'Choose files'}</button>
  <input ref={input} type="file" multiple className="sr-only" aria-label="Send Betti documents" accept="image/jpeg,image/png,image/webp,application/pdf,text/csv,.csv" onChange={e=>void upload(Array.from(e.target.files??[]))}/>
  {message&&<p role="status" className="mt-3 break-words text-sm leading-6">{message}</p>}
  {paused&&<p role="status" className="mt-3 text-sm">Your documents are safe. Organizing is paused; please check back later.</p>}
  {!compact&&documents.length>0&&<ul className="mt-6 divide-y divide-slate-200" aria-label="Your documents">{documents.map(d=><li key={d.id} className="py-4"><div className="flex flex-wrap items-start justify-between gap-2"><strong className="min-w-0 break-words font-medium" style={{overflowWrap:'anywhere'}}>{d.original_name||'Document'}</strong><span className="text-sm text-slate-600">{paused&&['pending','retryable','processing'].includes(d.state)?'Organizing is paused':status(d)}</span></div>{['dead_letter','unreadable'].includes(d.state)&&<button type="button" className="mt-2 min-h-11 text-sm font-semibold text-[#243186]" onClick={async()=>{const r=await fetch(`/api/documents/${d.id}/retry`,{method:'POST'});setMessage(r.ok?'Betti will try this document again.':'Please try again later. Your document is safe.');await refresh()}}>Try again</button>}{d.state==='needs_attention'&&<p className="mt-2 text-sm leading-6 text-slate-600">{help(d.reason)}</p>}{d.state==='completed'&&d.transaction_count>0&&<Link href="/transactions" className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-[#243186]">View {d.transaction_count} transactions →</Link>}{d.document_class==='receipt'&&<Link href="/receipts" className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-[#243186]">View receipt →</Link>}</li>)}</ul>}
  {compact&&<Link href="/import" className="ml-3 mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-[#243186]">View documents →</Link>}
 </div>
}
function status(d:Document){if(['pending','retryable','processing'].includes(d.state))return 'Betti is organizing this'
 if(d.state==='completed'&&d.document_class==='loan_statement')return 'Loan payment organized'
 if(d.state==='completed')return d.receipt_outcome==='matched'?'Receipt matched':d.document_class==='receipt'?'Saved for later matching':d.document_class==='transaction_file'?'Activity imported':'Statement imported'
 return d.state==='needs_attention'?'Needs your help':'Could not be read'}
function help(reason:string|null){if(reason?.startsWith('LOAN_'))return 'I need a statement showing this payment’s date, principal and interest separately. The amounts must add up to the payment. Your document is saved; no split has been assumed.'
 if(reason==='DOCUMENT_TYPE_UNCLEAR')return 'I’m not sure what kind of document this is. Please send a clear receipt or a complete bank or credit-card statement.'
 if(reason==='DOCUMENT_POSSIBLE_DUPLICATES')return 'Some activity may already be in your books. I’ve saved this document for review instead of adding it twice.'
 if(reason==='MULTIPLE_RECEIPTS_DETECTED')return 'I found more than one receipt in this image. Please upload each receipt separately.'
 return 'I couldn’t safely read all the information I need. Your original is saved. Please try a clearer or complete document.'}

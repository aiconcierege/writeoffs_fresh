'use client'
import './documents.css'
import {StatementAccountLinks} from '../components/StatementAccountLinks'
import '../components/source-coverage.css'
import {StatementAccountUse,type StatementUseAccount} from '../components/StatementAccountUse'
import {useCallback,useEffect,useRef,useState} from 'react'
import Link from 'next/link'
import {useRouter} from 'next/navigation'
import {supabase} from '../../utils/supabase/client'
import {fileKind} from '../lib/documents/file-validation'
import {receiptPhotoDocument} from '../lib/documents/receipt-photo-document'
import {runBoundedBatch} from '../lib/documents/batch-intake'
import {status,type Document} from '../lib/documents/customer-status'
export function DocumentIntake({compact=false,recordId,guided=false,onUploadState,buttonLabel='Choose files',primary=false,disabled=false}:{primary?:boolean;disabled?:boolean;buttonLabel?:string;compact?:boolean;recordId?:string;guided?:boolean;onUploadState?:(busy:boolean,result?:{received:number;documentIds:string[];failed:number})=>void}){
 const [accounts,setAccounts]=useState<StatementUseAccount[]>([])
 const [uploads,setUploads]=useState<Array<{key:string;name:string;state:'uploading'|'received'|'failed';documentId?:string}>>([])
 const router=useRouter()
 const input=useRef<HTMLInputElement>(null),camera=useRef<HTMLInputElement>(null),busyRef=useRef(false),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[documents,setDocuments]=useState<Document[]>([]),[paused,setPaused]=useState(false)
 const [dragging,setDragging]=useState(false),[oneReceipt,setOneReceipt]=useState(false)
 const refresh=useCallback(async()=>{const r=await fetch(recordId?`/api/documents?record=${recordId}`:'/api/documents',{cache:'no-store'});if(r.ok){const b=await r.json();setDocuments(b.documents??[]);setAccounts(b.accountUseAccounts??[]);setPaused(b.processingPaused===true)}},[recordId])
 useEffect(()=>{void refresh()},[refresh])
 const pending=uploads.some(u=>u.state==='received'&&!documents.some(d=>d.id===u.documentId))||documents.some(d=>['pending','retryable','processing'].includes(d.state))
 useEffect(()=>{if(!pending)return;const timer=setInterval(()=>void refresh(),4000);return()=>clearInterval(timer)},[pending,refresh])
 async function upload(files:File[]){
  if(!files.length||busyRef.current)return
  if(files.length>10){setMessage('Choose up to 10 documents at a time.');return}
  if(oneReceipt){
   busyRef.current=true;setBusy(true);onUploadState?.(true);setMessage('Preparing your receipt photos…')
   try{files=[await receiptPhotoDocument(files)]}catch(error){setMessage(error instanceof Error?error.message:'These photos could not be prepared.');busyRef.current=false;setBusy(false);onUploadState?.(false);return}
   busyRef.current=false
  }
  const batch=files.map(file=>({file,key:crypto.randomUUID()}));setUploads(batch.map(({file,key})=>({key,name:file.name,state:'uploading'})))
  let receivedCount=0
  const receivedDocumentIds:string[]=[]
  busyRef.current=true;setBusy(true);onUploadState?.(true);setMessage('Sending your documents…')
  try{
   const{data:{user}}=await supabase.auth.getUser();if(!user){router.push('/login');return}
   const results=await runBoundedBatch({items:batch,concurrency:2,process:async({file,key})=>{
    try{
    if(!file.size||file.size>20*1024*1024)throw new Error('SIZE')
    const bytes=new Uint8Array(await file.arrayBuffer()),kind=fileKind(bytes),mime=kind==='pdf'?'application/pdf':kind==='text'?'text/csv':['png','jpeg','webp'].includes(kind)?`image/${kind}`:'application/octet-stream'
    const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(n=>n.toString(16).padStart(2,'0')).join(''),path=`receipts/${user.id}/${hash}`
    const stored=await supabase.storage.from('receipts').upload(path,file,{contentType:mime,upsert:false})
    if(stored.error&&!/already exists|duplicate/i.test(stored.error.message))throw new Error('UPLOAD')
    const r=await fetch('/api/documents',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id:crypto.randomUUID(),fingerprint:hash,name:file.name,mime,bytes:file.size,...(recordId?{recordId}:{})})})
    if(!r.ok)throw new Error('REGISTER');const body=await r.json();receivedCount++;receivedDocumentIds.push(body.document.id);setUploads(rows=>rows.map(row=>row.key===key?{...row,state:'received',documentId:body.document.id}:row));return file.name
    }catch(error){setUploads(rows=>rows.map(row=>row.key===key?{...row,state:'failed'}:row));throw error}
   }})
   const failed=results.filter(r=>r.status==='rejected').length,received=results.length-failed
   setMessage(`${received} ${received===1?'document':'documents'} received.${failed?` ${failed} could not be sent. Check the file is under 20 MB and try again.`:' You can leave while Betti organizes them.'}`);void refresh().catch(()=>{/* Polling retries; registration already succeeded. */})
  }catch{setUploads(rows=>rows.map(row=>row.state==='uploading'?{...row,state:'failed'}:row));setMessage('Your documents could not be sent. Please try again.')}
  finally{busyRef.current=false;setBusy(false);onUploadState?.(false,{received:receivedCount,documentIds:receivedDocumentIds,failed:files.length-receivedCount});if(input.current)input.current.value=''}
 }
 async function setAside(id:string){
  if(busyRef.current)return;busyRef.current=true;setBusy(true)
  try{const r=await fetch(`/api/documents/${id}/set-aside`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({requestId:crypto.randomUUID()})});setMessage(r.ok?'Set aside. I won’t use this document in your books.':'This document could not be set aside. Refresh to see its current status.');await refresh()}catch{setMessage('Please try again. This document has not been set aside.')}finally{busyRef.current=false;setBusy(false)}
 }
 const visibleDocuments=(guided?documents.filter(d=>uploads.some(u=>u.documentId===d.id)):compact?documents.slice(0,3):documents)
 return <div className={`document-intake min-w-0 ${compact?'document-intake-compact':''}`}>
  {!guided&&<p className="text-sm leading-6 text-slate-600">Send me receipts and statements. I’ll figure out where they belong.</p>}
  <div className={`document-drop ${dragging?'document-drop-active':''}`} onDragOver={event=>{event.preventDefault();if(!disabled&&!busy)setDragging(true)}} onDragLeave={()=>setDragging(false)}
   onDrop={event=>{event.preventDefault();setDragging(false);if(!disabled&&!busy)void upload(Array.from(event.dataTransfer.files))}}>
   {!compact&&<><p className="document-drop-title">Give your records to Betti.</p><p className="document-drop-copy">Drop files here, or choose them below. I’ll read them and find where they belong.</p></>}
   <div className="document-capture-actions"><button type="button" className={`btn ${primary?'btn-primary':'btn-secondary'} min-h-11`} disabled={busy||disabled} onClick={()=>input.current?.click()}>{busy?'Sending…':buttonLabel}</button>
    <button type="button" className="btn btn-secondary document-camera" disabled={busy||disabled} onClick={()=>camera.current?.click()}>Take a photo</button></div>
   <p className="document-formats">JPEG, PNG, WebP and PDFs · Up to 10 files · 20 MB each</p>
   <label className="mt-4 flex min-h-11 cursor-pointer items-center gap-3 text-sm text-slate-700"><input type="checkbox" checked={oneReceipt} disabled={busy||disabled} onChange={event=>setOneReceipt(event.target.checked)}/> These photos are pages of one receipt or document</label>
   {oneReceipt&&<p className="mt-2 text-sm text-slate-600">Choose the photos together, in page order. I’ll keep the originals and review them as one document.</p>}
  </div>
  <input ref={camera} type="file" capture="environment" accept="image/jpeg,image/png" className="sr-only" aria-label="Take a receipt photo" onChange={event=>{void upload(Array.from(event.target.files??[]));event.target.value=''}}/>
  <input ref={input} type="file" multiple className="sr-only" aria-label="Send Betti documents" accept={oneReceipt?"image/jpeg,image/png,image/webp,.heic,.heif":"image/jpeg,image/png,image/webp,application/pdf,text/csv,.csv"} onChange={e=>void upload(Array.from(e.target.files??[]))}/>
  {message&&(!guided||!busy)&&<p role="status" className="mt-3 break-words text-sm leading-6">{message}</p>}
  {paused&&<p role="status" className="mt-3 text-sm">Your documents are safe. Organizing is paused; please check back later.</p>}
  {uploads.some(u=>!documents.some(d=>d.id===u.documentId))&&<ul aria-label="Files being sent" aria-live="polite" className="mt-4 space-y-3">{uploads.filter(u=>!documents.some(d=>d.id===u.documentId)).map(u=><li key={u.key} className="rounded-lg border border-slate-200 bg-slate-50 p-4"><p className="break-words font-semibold" style={{overflowWrap:'anywhere'}}>{u.name}</p><p className="mt-1 text-sm">{u.state==='uploading'?'Uploading…':u.state==='received'?'Received — Betti is reviewing it':'Could not upload — choose this file to try again'}</p>{u.state==='uploading'&&<div role="progressbar" aria-label={`Uploading ${u.name}`} className="mt-3 h-1 animate-pulse rounded bg-[#243186]"/>}</li>)}</ul>}
  {!guided&&accounts.length>0&&<StatementAccountUse accounts={accounts} conversational onSaved={()=>void refresh()}/>}
  {visibleDocuments.length>0&&<ul className="mt-6 divide-y divide-slate-200" aria-label="Your documents" aria-live="polite">{visibleDocuments.map(d=><li key={d.id} className="py-4"><div className="flex flex-wrap items-start justify-between gap-2"><strong className="min-w-0 break-words font-medium" style={{overflowWrap:'anywhere'}}>{d.original_name||'Document'}</strong><span className="text-sm text-slate-600">{paused&&['pending','retryable','processing'].includes(d.state)?'Organizing is paused':status(d)}</span></div>{(['dead_letter','unreadable'].includes(d.state)||(d.state==='needs_attention'&&d.reason?.startsWith('LOAN_')))&&<button type="button" className="mt-2 min-h-11 text-sm font-semibold text-[#243186]" onClick={async()=>{const r=await fetch(`/api/documents/${d.id}/retry`,{method:'POST'});setMessage(r.ok?'Betti will try this document again.':'Please try again later. Your document is safe.');await refresh()}}>Try again</button>}{d.state==='needs_attention'&&<p className="mt-2 text-sm leading-6 text-slate-600">{help(d.reason)}</p>}{d.state==='needs_attention'&&d.reason==='DOCUMENT_TYPE_UNCLEAR'&&<button type="button" disabled={busy} className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-[#243186]" onClick={()=>void setAside(d.id)}>Not for my books</button>}{d.state==='completed'&&(d.active_transaction_count??d.transaction_count)>0&&<Link href="/transactions" className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-[#243186]">View {d.active_transaction_count??d.transaction_count} transactions →</Link>}{d.document_class==='receipt'&&<Link href="/receipts" className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-[#243186]">View receipt →</Link>}</li>)}</ul>}
  {!guided&&!compact&&<StatementAccountLinks revision={documents.map(d=>d.id+':'+d.state).join('|')}/>}
  {compact&&<Link href="/import" className="ml-3 mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-[#243186]">View documents →</Link>}
 </div>
}

function help(reason:string|null){if(reason?.startsWith('LOAN_'))return 'I need a statement showing this payment’s date, principal and interest separately. The amounts must add up to the payment. Your document is saved; no split has been assumed.'
 if(reason==='DOCUMENT_TYPE_UNCLEAR')return 'I’m not sure what kind of document this is. Please send a clear receipt or a complete bank or credit-card statement.'
 if(reason==='DOCUMENT_POSSIBLE_DUPLICATES')return 'Some activity may already be in your books. I’ve saved this document for review instead of adding it twice.'
 if(reason==='MULTIPLE_RECEIPTS_DETECTED')return 'I found more than one receipt in this image. Please upload each receipt separately.'
 return 'I couldn’t safely read all the information I need. Your original is saved. Please try a clearer or complete document.'}

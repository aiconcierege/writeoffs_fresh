'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../utils/supabase/client'
import { runBoundedBatch } from '../lib/documents/batch-intake'

export function StatementUpload() {
  const input = useRef<HTMLInputElement>(null); const busyRef = useRef(false)
  const [busy,setBusy] = useState(false); const [message,setMessage] = useState<string | null>(null)
  const [documents,setDocuments]=useState<Array<{id:string;original_name:string|null;processing_status:string}>>([])
  async function refresh(){const response=await fetch('/api/documents/statements',{cache:'no-store'});if(response.ok){const body=await response.json();setDocuments(body.documents??[])}}
  useEffect(()=>{void refresh()},[])
  async function upload(files: File[]) {
    if (!files.length || busyRef.current) return
    const accepted = files.filter((file) => file.type === 'application/pdf' && file.size > 0 && file.size <= 100 * 1024 * 1024)
    if (!accepted.length) { setMessage('Choose PDF statements up to 100 MB each.'); return }
    busyRef.current = true; setBusy(true); setMessage(`Uploading ${accepted.length} ${accepted.length === 1 ? 'statement' : 'statements'}…`)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { window.location.href='/login'; return }
    const userId=user.id
    let received=0,duplicates=0
    const results=await runBoundedBatch({items:accepted,concurrency:3,onSettled:(settled,total)=>setMessage(`${settled} of ${total} handled…`),process:async(file)=>{
        const fingerprint=await sha256(file),requestedId=crypto.randomUUID(),storagePath=`statements/${userId}/${fingerprint}`
        const stored=await supabase.storage.from('receipts').upload(storagePath,file,{contentType:'application/pdf',upsert:false})
        if(stored.error&&!/already exists|duplicate/i.test(stored.error.message))throw new Error('UPLOAD_FAILED')
        const response=await fetch('/api/documents/statements',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({
          id:requestedId,documentClass:/card|credit/i.test(file.name)?'card_statement':'bank_statement',uploadFingerprint:fingerprint,storagePath,originalName:file.name,
          mimeType:file.type,bytes:file.size})});const result=await response.json().catch(()=>({}))
        if(!response.ok||!result.document?.id)throw new Error('REGISTER_FAILED')
        if(result.document.id===requestedId)received+=1;else duplicates+=1
        return result.document.id
    }})
    const failed=results.filter(result=>result.status==='rejected').length
    setBusy(false);busyRef.current=false
    setMessage(`${received} ${received===1?'statement':'statements'} received${duplicates?` · ${duplicates} already added`:''}${failed?` · ${failed} could not upload`:''}. You can leave while WriteOffs inspects them.`)
    await refresh()
    if(input.current)input.current.value=''
  }
  return <section className="mt-10 border-t border-slate-200 pt-8" aria-labelledby="statement-upload-heading">
    <h2 id="statement-upload-heading" className="text-xl font-semibold text-slate-950">Bank or card statements</h2>
    <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Upload monthly or combined PDF statements. WriteOffs stores each file and inspects it in the background.</p>
    <button type="button" disabled={busy} onClick={()=>input.current?.click()} className="btn btn-secondary mt-4">{busy?'Uploading statements…':'Upload statements'}</button>
    <input ref={input} type="file" multiple accept="application/pdf" className="sr-only" aria-label="Upload bank or card statement PDFs"
      onChange={(event)=>void upload(Array.from(event.target.files??[]))}/>
    {message&&<p role="status" aria-live="polite" className="mt-3 text-sm text-slate-600">{message}</p>}
    {documents.length>0&&<ul className="mt-5 divide-y divide-slate-200 border-y border-slate-200">{documents.map(document=><li key={document.id} className="flex min-h-12 items-center justify-between gap-4 py-3 text-sm"><span className="min-w-0 truncate font-medium text-slate-800">{document.original_name??'Statement'}</span><span className="shrink-0 text-slate-600">{statementStatus(document.processing_status)}</span></li>)}</ul>}
  </section>
}

async function sha256(file:File){const digest=await crypto.subtle.digest('SHA-256',await file.arrayBuffer());return Array.from(new Uint8Array(digest)).map(value=>value.toString(16).padStart(2,'0')).join('')}
function statementStatus(value:string){return({queued:'Queued',processing:'Still processing',organized:'Organized',needs_attention:'Needs your help',unreadable:'Could not be read'} as Record<string,string>)[value]??'Queued'}

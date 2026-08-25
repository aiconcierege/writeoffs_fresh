'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../utils/supabase/client'
import { runBoundedBatch } from '../lib/documents/batch-intake'

export function StatementUpload() {
  const input = useRef<HTMLInputElement>(null); const busyRef = useRef(false)
  const [busy,setBusy] = useState(false); const [message,setMessage] = useState<string | null>(null)
  const [documents,setDocuments]=useState<Array<{id:string;original_name:string|null;processing_status:string;transaction_count:number;
    institution_name:string|null;masked_account:string|null;period_start:string|null;period_end:string|null;statement_account_id:string|null;
    account_link_id:string|null;account_link_event_id:string|null;target_account_id:string|null}>>([])
  const [candidates,setCandidates]=useState<Array<{statement_account_id:string;target_account_id:string;display_name:string;provider:string;strong_identity:boolean}>>([])
  const [choices,setChoices]=useState<Record<string,string>>({})
  async function refresh(){const [response,accounts]=await Promise.all([fetch('/api/documents/statements',{cache:'no-store'}),
    fetch('/api/documents/statements/accounts',{cache:'no-store'})]);if(response.ok){const body=await response.json();setDocuments(body.documents??[])}
    if(accounts.ok){const body=await accounts.json();setCandidates(body.candidates??[])}}
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
  async function linkAccount(statementAccountId:string){const targetAccountId=choices[statementAccountId];if(!targetAccountId)return
    setMessage('Linking account…');const response=await fetch('/api/documents/statements/accounts',{method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({statementAccountId,targetAccountId,requestKey:crypto.randomUUID()})});const body=await response.json().catch(()=>({}))
    setMessage(response.ok?'Account linked. WriteOffs will avoid duplicate activity.':body.error??'We could not link that account.');if(response.ok)await refresh()}
  async function unlink(linkId:string,eventId:string){setMessage('Removing account link…');const response=await fetch('/api/documents/statements/accounts',{method:'DELETE',
    headers:{'content-type':'application/json'},body:JSON.stringify({linkId,expectedEventId:eventId})});const body=await response.json().catch(()=>({}))
    setMessage(response.ok?'Account link removed.':body.error??'We could not remove that link.');if(response.ok)await refresh()}
  return <section className="mt-10 border-t border-slate-200 pt-8" aria-labelledby="statement-upload-heading">
    <h2 id="statement-upload-heading" className="text-xl font-semibold text-slate-950">Bank or card statements</h2>
    <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Upload monthly or combined PDF statements. WriteOffs stores each file and inspects it in the background.</p>
    <button type="button" disabled={busy} onClick={()=>input.current?.click()} className="btn btn-secondary mt-4">{busy?'Uploading statements…':'Upload statements'}</button>
    <input ref={input} type="file" multiple accept="application/pdf" className="sr-only" aria-label="Upload bank or card statement PDFs"
      onChange={(event)=>void upload(Array.from(event.target.files??[]))}/>
    {message&&<p role="status" aria-live="polite" className="mt-3 text-sm text-slate-600">{message}</p>}
    {documents.length>0&&<ul className="mt-5 divide-y divide-slate-200 border-y border-slate-200">{documents.map(document=>{const options=candidates.filter(candidate=>candidate.statement_account_id===document.statement_account_id)
      return <li key={document.id} className="py-4 text-sm"><div className="flex min-h-12 items-start justify-between gap-4"><span className="min-w-0"><span className="block break-words font-medium text-slate-800">{document.institution_name??document.original_name??'Statement'}{document.masked_account?` · •••• ${document.masked_account}`:''}</span>{document.period_start&&document.period_end&&<span className="mt-0.5 block text-xs text-slate-500">{document.period_start}–{document.period_end}{document.transaction_count?` · ${document.transaction_count} transactions`:''}</span>}</span><span className="shrink-0 text-slate-600">{statementStatus(document.processing_status)}</span></div>
      {document.statement_account_id&&options.length>0&&!document.account_link_id&&<div className="mt-3 max-w-md rounded-xl bg-slate-50 p-3"><label className="block text-sm font-medium text-slate-800" htmlFor={`account-${document.id}`}>Is this the same account as one you already use with WriteOffs?</label><div className="mt-2 flex flex-col gap-2 sm:flex-row"><select id={`account-${document.id}`} className="input min-h-11 flex-1" value={choices[document.statement_account_id]??''} onChange={event=>setChoices(current=>({...current,[document.statement_account_id!]:event.target.value}))}><option value="">Not sure — leave separate</option>{options.map(option=><option key={option.target_account_id} value={option.target_account_id}>{option.display_name}{option.strong_identity?' · Suggested':''}</option>)}</select><button className="btn btn-secondary min-h-11" type="button" disabled={!choices[document.statement_account_id]} onClick={()=>void linkAccount(document.statement_account_id!)}>Link account</button></div></div>}
      {document.account_link_id&&document.account_link_event_id&&<div className="mt-3 flex items-center gap-3 text-xs text-slate-600"><span>Linked to an existing account</span><button type="button" className="font-semibold text-blue-700 underline-offset-2 hover:underline" onClick={()=>void unlink(document.account_link_id!,document.account_link_event_id!)}>Remove link</button></div>}</li>})}</ul>}
  </section>
}

async function sha256(file:File){const digest=await crypto.subtle.digest('SHA-256',await file.arrayBuffer());return Array.from(new Uint8Array(digest)).map(value=>value.toString(16).padStart(2,'0')).join('')}
function statementStatus(value:string){return({queued:'Queued',processing:'Still processing',organized:'Organized',needs_attention:'Needs your help',unreadable:'Could not be read'} as Record<string,string>)[value]??'Queued'}

'use client'

import { useRef, useState } from 'react'
import { supabase } from '../../utils/supabase/client'
import { runBoundedBatch } from '../lib/documents/batch-intake'

export function ReceiptUploadAction({ onComplete, variant = 'home', intendedTransactionId,mobileLabel='Add receipt',capture }: {
  onComplete?: () => void | Promise<void>
  variant?: 'home' | 'history' | 'guided'
  intendedTransactionId?: string
  mobileLabel?: string
  capture?: 'user'|'environment'
}) {
  const input = useRef<HTMLInputElement>(null)
  const inFlight = useRef(false)
  const [status, setStatus] = useState<'idle' | 'uploading' | 'organizing' | 'done' | 'error'>('idle')
  const [message, setMessage] = useState<string | null>(null)
  const [failed, setFailed] = useState<File[]>([])

  async function select(selected: File[]) {
    if (!selected.length || inFlight.current) return
    const files = selected.filter((file) => /^(image\/(jpeg|png|webp)|application\/pdf)$/.test(file.type)
      && file.size > 0 && file.size <= 20 * 1024 * 1024)
    if (!files.length) { setStatus('error'); setMessage('Choose receipt images or PDFs up to 20 MB each.'); return }
    inFlight.current = true
    setFailed([]); setStatus('uploading'); setMessage(`Uploading ${files.length} ${files.length === 1 ? 'receipt' : 'receipts'}…`)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { window.location.href = '/login'; return }
      const userId = user.id
      let accepted = 0; let duplicates = 0; let attachmentFailed = false
      const results = await runBoundedBatch({ items: files,concurrency: 4,onSettled: (settled,total) => setMessage(`${settled} of ${total} received…`),
        process: async (file) => {
            const fingerprint = await sha256(file); const requestedId = crypto.randomUUID()
            const storagePath = `receipts/${userId}/${fingerprint}`
            const upload = await supabase.storage.from('receipts').upload(storagePath, file, {
              contentType: file.type, upsert: false,
            })
            if (upload.error && !/already exists|duplicate/i.test(upload.error.message)) throw new Error('UPLOAD_FAILED')
            const registration = await fetch('/api/receipts', { method: 'POST',headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ id: requestedId,uploadFingerprint: fingerprint,storagePath,
                originalName: file.name,mimeType: file.type,bytes: file.size }) })
            const registered = await registration.json().catch(() => ({}))
            if (!registration.ok || !registered.receipt?.id) throw new Error('REGISTRATION_FAILED')
            if(intendedTransactionId){
              const attachment=await fetch(`/api/bookkeeping/financial-transactions/${intendedTransactionId}/receipts`,{
                method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({receipt_id:registered.receipt.id})})
              if(!attachment.ok){attachmentFailed=true;throw new Error('ATTACHMENT_FAILED')}
            }
            if (registered.receipt.id === requestedId) accepted += 1; else duplicates += 1
            return registered.receipt.id
        } })
      const failures = files.filter((_,index) => results[index].status === 'rejected')
      setFailed(failures)
      if (accepted + duplicates === 0) {
        if(attachmentFailed)throw new Error('ATTACHMENT_FAILED')
        throw new Error('BATCH_FAILED')
      }
      setStatus(failures.length ? 'error' : 'done')
      setMessage(accepted === 1 && duplicates === 0 && failures.length === 0
        ? intendedTransactionId?'Receipt attached. WriteOffs is organizing it.':'Receipt added. WriteOffs is organizing it.'
        : `${accepted} ${accepted === 1 ? 'receipt' : 'receipts'} received${duplicates ? ` · ${duplicates} already added` : ''}${failures.length ? ` · ${failures.length} could not upload` : ''}. WriteOffs will keep organizing them after you leave.`)
      await onComplete?.()
    } catch (cause) {
      setStatus('error'); setMessage(cause instanceof Error&&cause.message==='ATTACHMENT_FAILED'
        ? 'The receipt was saved, but I couldn’t safely attach it to this transaction. Try again or find it in Receipts.'
        : 'The receipts could not be added. Try again.')
    } finally {
      inFlight.current = false
      if (input.current) input.current.value = ''
    }
  }

  const busy = status === 'uploading' || status === 'organizing'
  return <div className={variant === 'history' ? 'w-full' : 'inline-flex flex-col items-start gap-2'}>
    <button type="button" disabled={busy} onClick={() => input.current?.click()}
      className={variant==='guided'?'btn btn-secondary min-h-12':'btn btn-primary min-h-12'}>
      {busy ? 'Adding receipt…' : <><span className="hidden sm:inline">Upload receipt</span><span className="sm:hidden">{mobileLabel}</span></>}
    </button>
    <input ref={input} type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf" className="sr-only"
      capture={capture} aria-label="Upload receipt images or PDFs" onChange={(event) => void select(Array.from(event.target.files ?? []))} />
    {message && <p role={status === 'error' ? 'alert' : 'status'} aria-live="polite"
      className={`max-w-sm text-sm ${status === 'error' ? 'text-red-700' : 'text-[#59665f]'}`}>{message}</p>}
    {failed.length > 0 && <button type="button" className="min-h-11 text-sm font-semibold text-[#243186]"
      onClick={() => void select(failed)}>Retry {failed.length === 1 ? 'failed receipt' : `${failed.length} failed receipts`}</button>}
  </div>
}

async function sha256(file: File) {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
  return Array.from(new Uint8Array(digest)).map((value) => value.toString(16).padStart(2, '0')).join('')
}

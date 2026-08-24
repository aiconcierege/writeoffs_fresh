'use client'

import { useRef, useState } from 'react'
import { supabase } from '../../utils/supabase/client'

export function ReceiptUploadAction({ onComplete, variant = 'home' }: {
  onComplete?: () => void | Promise<void>
  variant?: 'home' | 'history'
}) {
  const input = useRef<HTMLInputElement>(null)
  const inFlight = useRef(false)
  const [status, setStatus] = useState<'idle' | 'uploading' | 'organizing' | 'done' | 'error'>('idle')
  const [message, setMessage] = useState<string | null>(null)

  async function select(file: File | undefined) {
    if (!file || inFlight.current) return
    if (!/^(image\/.+|application\/pdf)$/.test(file.type)) {
      setStatus('error'); setMessage('Choose an image or PDF.'); return
    }
    inFlight.current = true
    setStatus('uploading'); setMessage('Uploading receipt…')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { window.location.href = '/login'; return }
      const fingerprint = await sha256(file)
      const storagePath = `receipts/${user.id}/${fingerprint}`
      const upload = await supabase.storage.from('receipts').upload(storagePath, file, {
        contentType: file.type || 'application/octet-stream', upsert: false,
      })
      if (upload.error && !/already exists|duplicate/i.test(upload.error.message)) throw new Error('UPLOAD_FAILED')
      const registration = await fetch('/api/receipts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: crypto.randomUUID(), uploadFingerprint: fingerprint, storagePath,
          originalName: file.name, mimeType: file.type || 'application/octet-stream', bytes: file.size }),
      })
      const registered = await registration.json().catch(() => ({}))
      if (!registration.ok || !registered.receipt?.id) throw new Error('REGISTRATION_FAILED')
      setStatus('organizing'); setMessage('Receipt added. WriteOffs is organizing it.')
      const receiptId = String(registered.receipt.id)
      const extraction = await fetch('/api/receipts/ocr', {
        method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: receiptId }),
      })
      const extractionResult = await extraction.json().catch(() => ({}))
      if (!extraction.ok || extractionResult.ok === false) {
        await fetch('/api/receipts/annotate', {
          method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: receiptId }),
        })
      }
      setStatus('done'); setMessage('Receipt added. WriteOffs is organizing it.')
      await onComplete?.()
    } catch {
      setStatus('error'); setMessage('The receipt could not be added. Try again.')
    } finally {
      inFlight.current = false
      if (input.current) input.current.value = ''
    }
  }

  const busy = status === 'uploading' || status === 'organizing'
  return <div className={variant === 'home' ? 'inline-flex flex-col items-start gap-2' : 'w-full'}>
    <button type="button" disabled={busy} onClick={() => input.current?.click()}
      className={`${variant === 'home' ? 'btn-primary' : 'btn-secondary'} btn min-h-12`}>
      {busy ? 'Adding receipt…' : <><span className="hidden sm:inline">Upload receipt</span><span className="sm:hidden">Add receipt</span></>}
    </button>
    <input ref={input} type="file" accept="image/*,application/pdf" className="sr-only"
      aria-label="Upload receipt image or PDF" onChange={(event) => void select(event.target.files?.[0])} />
    {message && <p role={status === 'error' ? 'alert' : 'status'} aria-live="polite"
      className={`max-w-sm text-sm ${status === 'error' ? 'text-red-700' : 'text-[#59665f]'}`}>{message}</p>}
  </div>
}

async function sha256(file: File) {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
  return Array.from(new Uint8Array(digest)).map((value) => value.toString(16).padStart(2, '0')).join('')
}

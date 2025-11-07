/* File: app/components/WaitlistNotice.tsx
 * Version: v1
 * Date: 2025-10-13
 * Notes: Shows a dismissible banner when ?waitlist=1 (signups gated).
 */
'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'

export default function WaitlistNotice() {
  const params = useSearchParams()
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (params.get('waitlist') === '1') setShow(true)
  }, [params])

  if (!show) return null

  return (
    <div className="fixed inset-x-0 top-0 z-50">
      <div className="mx-auto max-w-7xl px-4 pt-3">
        <div className="flex items-start justify-between rounded-2xl border border-neutral-300 bg-white/95 p-3 shadow">
          <div className="pr-4 text-sm text-neutral-800">
            Signups are closed while we finish MVP. Join the waitlist and we’ll notify you for early access.
          </div>
          <button
            onClick={() => setShow(false)}
            className="rounded-lg border px-2 py-1 text-sm"
            aria-label="Dismiss banner"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  )
}

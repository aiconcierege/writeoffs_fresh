/* File: app/settings/VerticalSwitcher.tsx
 * Version: v1
 * Date: 2025-10-13
 * Notes: Client widget to toggle profiles.vertical via /api/profile/vertical.
 */
'use client'

import { useState } from 'react'

export default function VerticalSwitcher({ current }: { current: 'general' | 'realtor' }) {
  const [value, setValue] = useState<'general' | 'realtor'>(current)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const next = value === 'general' ? 'realtor' : 'general'

  async function save(newVal: 'general' | 'realtor') {
    setSaving(true)
    setMsg(null)
    try {
      const res = await fetch('/api/profile/vertical', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ v: newVal })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Failed to save')
      setValue(newVal)
      setMsg(`Switched to ${newVal}.`)
    } catch (e: any) {
      setMsg(e?.message || 'Could not update vertical.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mt-3 flex items-center gap-3">
      <button
        disabled={saving}
        onClick={() => save(next)}
        className="rounded-xl border px-3 py-1.5 text-sm disabled:opacity-60"
      >
        {saving ? 'Saving…' : `Switch to ${next}`}
      </button>
      {msg && <span className="text-xs text-neutral-600">{msg}</span>}
    </div>
  )
}

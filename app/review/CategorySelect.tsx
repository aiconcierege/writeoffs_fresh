/* File: app/review/CategorySelect.tsx
 * Version: v2
 * Date: 2025-10-14
 * Notes: Syncs internal state when parent updates `current` (fixes bulk-update not reflecting until refresh).
 */
'use client'

import { useEffect, useState } from 'react'

type Category = { key: string; label: string }

export default function CategorySelect({
  id,
  current,
  categories
}: {
  id: string
  current: string | null
  categories: Category[]
}) {
  const [value, setValue] = useState<string>(current ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 🔧 Keep local state in sync with parent prop changes (e.g., bulk apply)
  useEffect(() => {
    setValue(current ?? '')
  }, [current])

  async function onChange(next: string) {
    setValue(next) // optimistic
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/tx/category', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, category_key: next || null })
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error || 'Failed to save category')
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to save category')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <select
        className="rounded-xl border px-2 py-1 text-sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={saving}
        aria-label="Select Schedule C category"
      >
        <option value="">— Unset —</option>
        {categories.map((c) => (
          <option key={c.key} value={c.key}>{c.label}</option>
        ))}
      </select>
      {saving && <span className="text-xs text-neutral-500">Saving…</span>}
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  )
}



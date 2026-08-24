'use client'

import { useState } from 'react'

export type SettingsInitial = {
  business_name: string
  owner_name: string
  contact_email: string
  phone: string
  address_line1: string
  address_line2: string
  city: string
  region: string
  postal_code: string
  country: string
  theme: 'system' | 'light' | 'dark'
}

export default function SettingsForm({ initial }: { initial: SettingsInitial }) {
  const [form, setForm] = useState<SettingsInitial>(initial)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  function set<K extends keyof SettingsInitial>(k: K, v: SettingsInitial[K]) {
    setForm(prev => ({ ...prev, [k]: v }))
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setErr(null); setMsg(null)
    try {
      const res = await fetch('/api/profile/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || data?.error) throw new Error('We couldn’t save that change. Please try again.')
      setMsg('Saved.')
    } catch (cause: unknown) {
      setErr(cause instanceof Error ? cause.message : 'We couldn’t save that change. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="surface p-5 sm:p-7">
      <div className="section-heading">Profile and business</div>

      {/* Theme */}
      <div className="mt-6">
        <label className="block text-sm font-medium">Theme</label>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {(['system','light','dark'] as const).map(t => (
            <label key={t} className="inline-flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="theme"
                checked={form.theme === t}
                onChange={() => set('theme', t)}
              />
              {t === 'system' ? 'System' : t[0].toUpperCase() + t.slice(1)}
            </label>
          ))}
        </div>
      </div>

      {/* Business info */}
      <div className="mt-6 grid gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Business name" value={form.business_name} onChange={v => set('business_name', v)} />
          <Field label="Owner name"    value={form.owner_name}    onChange={v => set('owner_name', v)} />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Contact email" type="email" value={form.contact_email} onChange={v => set('contact_email', v)} />
          <Field label="Phone" value={form.phone} onChange={v => set('phone', v)} />
        </div>

        <Field label="Address line 1" value={form.address_line1} onChange={v => set('address_line1', v)} />
        <Field label="Address line 2" value={form.address_line2} onChange={v => set('address_line2', v)} />

        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="City" value={form.city} onChange={v => set('city', v)} />
          <Field label="State / Region" value={form.region} onChange={v => set('region', v)} />
          <Field label="Postal code" value={form.postal_code} onChange={v => set('postal_code', v)} />
        </div>

        <Field label="Country" value={form.country} onChange={v => set('country', v)} />
      </div>

      <div className="mt-6 flex items-center justify-end gap-2">
       <button type="submit" disabled={saving} className="rounded-xl btn btn-primary px-4 py-2 text-sm font-semibold disabled:opacity-60">
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>

      {(msg || err) && (
        <div role={err ? 'alert' : 'status'} className={`notice mt-4 ${err ? 'notice-error' : 'notice-success'}`}
        >
          {err || msg}
        </div>
      )}
    </form>
  )
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
}) {
  return (
    <div>
      <label className="block text-sm font-medium">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="field mt-1 text-sm"
      />
    </div>
  )
}

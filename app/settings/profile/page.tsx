/* File: app/settings/profile/page.tsx
 * Version: v3
 * Notes:
 * - Server component; imports client SettingsForm from ./SettingsForm
 * - Uses bg-muted surface + .card + button utilities for a less stark page
 */
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { redirect } from 'next/navigation'
import { createServerSupabase } from '../../../utils/supabase/server'
import SettingsForm, { type SettingsInitial } from './SettingsForm'

export default async function ProfileSettingsPage() {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('vertical,business_name,owner_name,contact_email,phone,address_line1,address_line2,city,region,postal_code,country,theme,bank_connected')
    .eq('id', user.id)
    .maybeSingle()

  const initial: SettingsInitial = {
    vertical: (profile?.vertical ?? 'general') as SettingsInitial['vertical'],
    business_name: profile?.business_name ?? '',
    owner_name: profile?.owner_name ?? '',
    contact_email: profile?.contact_email ?? (user.email ?? ''),
    phone: profile?.phone ?? '',
    address_line1: profile?.address_line1 ?? '',
    address_line2: profile?.address_line2 ?? '',
    city: profile?.city ?? '',
    region: profile?.region ?? '',
    postal_code: profile?.postal_code ?? '',
    country: profile?.country ?? '',
    theme: (profile?.theme ?? 'system') as SettingsInitial['theme'],
  }

  const bankConnected = Boolean(profile?.bank_connected)

  return (
    <main className="min-h-screen bg-muted">
      <section className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="text-3xl font-bold">Profile &amp; Settings</h1>
        <p className="mt-2 text-sm text-muted">
          Choose your industry pack, manage business info, and set preferences.
        </p>

        <div className="mt-6 grid gap-4">
          <div className="card p-5">
            <SettingsForm initial={initial} />
          </div>
          <div className="card p-5">
            <BankConnectionsCard connected={bankConnected} />
          </div>
        </div>
      </section>
    </main>
  )
}

function BankConnectionsCard({ connected }: { connected: boolean }) {
  return (
    <div>
      <div className="text-base font-semibold">Bank connections</div>
      <p className="mt-2 text-sm text-neutral-700">
        Connect a bank to auto-suggest matches for receipts and mark transactions as cleared.
      </p>
      <div className="mt-3">
        <button
          type="button"
          disabled
          className="btn btn-secondary disabled:opacity-60"
          title="Coming soon"
        >
          {connected ? 'Connected (coming soon)' : 'Connect bank (coming soon)'}
        </button>
      </div>
    </div>
  )
}

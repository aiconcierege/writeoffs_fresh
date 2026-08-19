/* File: app/settings/profile/page.tsx
 * Version: v3
 * Notes:
 * - Server component; imports client SettingsForm from ./SettingsForm
 * - Uses bg-muted surface + .card + button utilities for a less stark page
 */
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createServerSupabase } from '../../../utils/supabase/server'
import SettingsForm, { type SettingsInitial } from './SettingsForm'

export default async function ProfileSettingsPage() {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: profile }, { data: business }] = await Promise.all([
    supabase
      .from('profiles')
      .select('vertical,theme')
      .eq('id', user.id)
      .maybeSingle(),
    supabase
      .from('businesses')
      .select('name,owner_name,contact_email,phone,address_line1,address_line2,city,state,postal_code,country')
      .eq('owner_user_id', user.id)
      .maybeSingle(),
  ])

  const initial: SettingsInitial = {
    vertical: (profile?.vertical ?? 'general') as SettingsInitial['vertical'],
    business_name: business?.name ?? '',
    owner_name: business?.owner_name ?? '',
    contact_email: business?.contact_email ?? (user.email ?? ''),
    phone: business?.phone ?? '',
    address_line1: business?.address_line1 ?? '',
    address_line2: business?.address_line2 ?? '',
    city: business?.city ?? '',
    region: business?.state ?? '',
    postal_code: business?.postal_code ?? '',
    country: business?.country ?? 'US',
    theme: (profile?.theme ?? 'system') as SettingsInitial['theme'],
  }

  return (
    <main className="min-h-screen bg-muted">
      <section className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="text-3xl font-bold">Profile &amp; Settings</h1>
        <p className="mt-2 text-sm text-muted">
          Manage your business profile, business information, and preferences.
        </p>

        <div className="mt-6 grid gap-4">
          <div className="card p-5">
            <SettingsForm initial={initial} />
          </div>
          <div className="card p-5">
            <div className="text-base font-semibold">Business setup</div>
            <p className="mt-2 text-sm text-neutral-700">
              Review how your business operates, including customer-job materials and your starting date.
            </p>
            <Link href="/onboarding?edit=1" className="btn btn-secondary mt-3 inline-flex min-h-11 items-center">
              Review business setup
            </Link>
          </div>
          <div className="card p-5">
            <BankConnectionsCard />
          </div>
        </div>
      </section>
    </main>
  )
}

function BankConnectionsCard() {
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
          Connect bank (coming soon)
        </button>
      </div>
    </div>
  )
}

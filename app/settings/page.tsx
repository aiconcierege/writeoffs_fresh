export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createServerSupabase } from '../../utils/supabase/server'
import SettingsForm, { type SettingsInitial } from './profile/SettingsForm'

export default async function SettingsPage() {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: profile }, { data: business }] = await Promise.all([
    supabase.from('profiles').select('theme').eq('id', user.id).maybeSingle(),
    supabase.from('businesses')
      .select('name,owner_name,contact_email,phone,address_line1,address_line2,city,state,postal_code,country')
      .eq('owner_user_id', user.id).maybeSingle(),
  ])

  const initial: SettingsInitial = {
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

  return <main className="app-page">
    <section className="page-container page-container-narrow">
      <p className="eyebrow">Account</p><h1 className="page-title">Settings</h1>
      <p className="page-description">Manage your business information, setup, and connections.</p>
      <div className="mt-8 grid gap-6">
        <SettingsForm initial={initial} />
        <section className="section-rule" aria-labelledby="security-heading">
          <h2 id="security-heading" className="text-base font-semibold">Security</h2>
          <p className="mt-2 text-sm text-neutral-700">Manage two-factor authentication and protect access to your financial records.</p>
          <Link href="/settings/security" className="btn btn-secondary mt-3 inline-flex min-h-11 items-center">Manage account security</Link>
        </section>
        <section className="section-rule" aria-labelledby="business-setup-heading">
          <h2 id="business-setup-heading" className="text-base font-semibold">Business setup</h2>
          <p className="mt-2 text-sm text-neutral-700">Review how your business operates, including customer-job materials and your starting date.</p>
          <Link href="/onboarding?edit=1" className="btn btn-secondary mt-3 inline-flex min-h-11 items-center">Review business setup</Link>
        </section>
        <section className="section-rule" aria-labelledby="bank-connections-heading">
          <h2 id="bank-connections-heading" className="text-base font-semibold">Bank connections</h2>
          <p className="mt-2 text-sm text-neutral-700">Connect and update financial accounts securely. Connected activity appears in the same Transactions, receipt matching, and reporting experience as CSV imports.</p>
          <Link href="/settings/banking" className="btn btn-secondary mt-3 inline-flex min-h-11 items-center">Manage bank connections</Link>
        </section>
      </div>
    </section>
  </main>
}

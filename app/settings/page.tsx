/* File: app/settings/page.tsx
 * Version: v4.1
 * Date: 2025-10-22
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createServerSupabase } from '../../utils/supabase/server';
import VerticalSwitcher from './VerticalSwitcher';

export default async function SettingsPage() {
  const supabase = await createServerSupabase();

  // Require login
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Pull the profile (vertical)
  const { data: profile } = await supabase
    .from('profiles')
    .select('vertical')
    .eq('id', user.id)
    .maybeSingle();

  const current = (profile?.vertical ?? 'general') as 'general' | 'realtor';
  const nice = current === 'realtor' ? 'Realtor Pack' : 'General Pack';

  return (
    <main className="min-h-screen bg-white">
      <section className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="text-3xl font-bold">Account settings</h1>

        <div className="mt-6 grid gap-4">
          {/* Email */}
          <div className="rounded-2xl border p-5">
            <div className="text-sm text-neutral-600">Email</div>
            <div className="mt-1 font-mono text-sm">{user.email}</div>
          </div>

          {/* Industry (Vertical) */}
          <div className="rounded-2xl border p-5">
            <div className="text-sm text-neutral-600">Industry</div>
            <div className="mt-1 text-sm font-medium">{nice}</div>
            <VerticalSwitcher current={current} />
            <p className="mt-2 text-xs text-neutral-600">
              Switching changes presets (categories, rules). Your data stays intact.
            </p>
          </div>

          {/* Banking */}
          <div className="rounded-2xl border p-5">
            <div className="text-sm text-neutral-600">Bank connections</div>
            <p className="mt-1 text-sm">
              View existing bank connection information.
            </p>
            <Link
              href="/settings/banking"
              className="mt-3 inline-flex items-center rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-neutral-50"
            >
              Manage bank connections →
            </Link>
            <p className="mt-2 text-xs text-neutral-500">
              Plaid Sandbox connections are available in configured test environments.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}

// app/settings/banking/page.tsx
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { redirect } from "next/navigation";
import { createServerSupabase } from "../../../utils/supabase/server";
import BankConnect from "../../components/BankConnect";
import { plaidIsConfigured, plaidSandboxLinkEnabled } from "../../lib/plaid/config";

export default async function BankingSettings() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: connections }, { data: accounts }] = await Promise.all([
    supabase.rpc('list_plaid_connections'),
    supabase.rpc('list_plaid_connection_accounts'),
  ])

  return (
    <main className="mx-auto max-w-2xl px-6 py-8 space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Bank connections</h1>
        <p className="text-sm text-neutral-600">
          Connect and update financial accounts. Connected activity enters the same Transactions,
          receipt matching, and reporting system as CSV imports.
        </p>
      </header>

      <div className="space-y-2">
        <BankConnect enabled={plaidIsConfigured() && plaidSandboxLinkEnabled()}
          connections={connections ?? []} accounts={accounts ?? []} />
      </div>
    </main>
  );
}

// app/settings/banking/page.tsx
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { redirect } from "next/navigation";
import { createServerSupabase } from "../../../utils/supabase/server";
import BankConnect from "../../components/BankConnect";
import { plaidEnvironment, plaidLinkEnabled } from "../../lib/plaid/config";

export default async function BankingSettings() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: connections }, { data: accounts }, { data: accountUses }] = await Promise.all([
    supabase.rpc('list_plaid_connections'),
    supabase.rpc('list_plaid_connection_accounts'),
    supabase.from('current_financial_account_use')
      .select('id,financial_account_id,designation,effective_at'),
  ])

  return (
    <main className="app-page"><div className="page-container page-container-narrow space-y-8">
      <header className="space-y-1">
        <p className="eyebrow">Connections</p><h1 className="page-title">Bank connections</h1>
        <p className="page-description">Connect your accounts and tell Betti how you use each one.</p>
      </header>

      <div className="space-y-2">
        <BankConnect enabled={plaidLinkEnabled()} sandbox={plaidEnvironment() === 'sandbox'}
          connections={connections ?? []} accounts={accounts ?? []} accountUses={accountUses ?? []} />
      </div>
    </div></main>
  );
}

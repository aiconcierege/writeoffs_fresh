// app/settings/banking/page.tsx
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { redirect } from "next/navigation";
import { createServerSupabase } from "../../../utils/supabase/server";
import BankConnect from "../../components/BankConnect";
import BankAccounts from "../../components/BankAccounts";

type PageProps = {
  // Next 15: searchParams is async
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function BankingSettings({ searchParams }: PageProps) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Await the async searchParams
  const sp = await searchParams;
  const connected = sp?.connected === "1";
  const bankError =
    typeof sp?.bank_error === "string" ? String(sp.bank_error) : null;

  const { data: conn } = await supabase
    .from("bank_connections")
    .select("token_json")
    .eq("user_id", user.id)
    .eq("provider", "teller")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const hasToken = !!(conn as any)?.token_json?.access_token;

  return (
    <main className="mx-auto max-w-2xl px-6 py-8 space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Bank connections</h1>
        <p className="text-sm text-neutral-600">
          Bank connections are temporarily unavailable while we update our banking infrastructure.
          Existing imported transactions remain available.
        </p>
      </header>

      {/* Status banners */}
      {connected && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Bank connected. Pulling accounts…
        </div>
      )}
      {bankError && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          There was an issue connecting your bank: <span className="font-mono">{bankError}</span>
        </div>
      )}

      {/* Always render Connect so you can relaunch the flow */}
      <div className="space-y-2">
        <BankConnect />
        <p id="bank-connect-status" className="text-xs text-neutral-500">
          New connections and reconnections are currently disabled.
        </p>
      </div>

      {/* Accounts list (only if a token exists) */}
      {hasToken && (
        <section className="pt-2">
          <BankAccounts />
        </section>
      )}
    </main>
  );
}

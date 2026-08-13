// app/settings/banking/page.tsx
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { redirect } from "next/navigation";
import { createServerSupabase } from "../../../utils/supabase/server";
import BankConnect from "../../components/BankConnect";

export default async function BankingSettings() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <main className="mx-auto max-w-2xl px-6 py-8 space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Bank connections</h1>
        <p className="text-sm text-neutral-600">
          Bank connections are temporarily unavailable while we update our banking infrastructure.
          Existing imported transactions remain available.
        </p>
      </header>

      <div className="space-y-2">
        <BankConnect />
        <p id="bank-connect-status" className="text-xs text-neutral-500">
          New connections and reconnections are currently disabled.
        </p>
      </div>
    </main>
  );
}

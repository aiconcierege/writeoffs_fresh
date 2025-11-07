// app/api/teller/enroll/route.ts
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createServerSupabase } from "../../../../utils/supabase/server"; // ← fixed path

/**
 * Accepts either:
 *  - { accessToken: string }  ← direct token from Teller Connect
 *  - { code: string }         ← auth code, which we exchange via /api/teller/token
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({} as any));
    let accessToken: string | undefined = body?.accessToken;
    const code: string | undefined = body?.code;

    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });

    if (!accessToken && code) {
      const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
      const res = await fetch(`${base}/api/teller/token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.data?.access_token) {
        return NextResponse.json(
          { error: "token_exchange_failed", details: json || null },
          { status: 500 }
        );
      }
      accessToken = json.data.access_token as string;
    }

    if (!accessToken) {
      return NextResponse.json({ error: "missing_access_token_or_code" }, { status: 400 });
    }

    const env = (process.env.NEXT_PUBLIC_TELLER_ENV || "sandbox").toLowerCase();

    const { error } = await supabase.from("bank_connections").insert({
      user_id: user.id,
      provider: "teller",
      status: "active",
      token_json: { access_token: accessToken, environment: env },
    } as any);

    if (error) {
      return NextResponse.json({ error: "db_insert_failed", details: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: "server_error", details: e?.message || String(e) },
      { status: 500 }
    );
  }
}

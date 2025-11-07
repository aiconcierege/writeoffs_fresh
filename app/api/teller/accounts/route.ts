// app/api/teller/accounts/route.ts
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { fetch as undiciFetch, type Dispatcher } from "undici";
import {
  getTellerAccessToken,
  tellerApiBase,
  tellerDispatcher,
} from "../../../lib/teller";

function basicAuthHeader(token: string) {
  // username = access_token, password = blank
  const base64 = Buffer.from(`${token}:`, "utf8").toString("base64");
  return `Basic ${base64}`;
}

export async function GET() {
  try {
    const token = await getTellerAccessToken();

    console.log(
      "[teller] masked token:",
      token ? token.slice(0, 8) + "…" + token.slice(-4) : "(none)"
    );

    const base = tellerApiBase();
    const dispatcher: Dispatcher = tellerDispatcher(); // mTLS (client cert + key)
    console.log("[teller] GET /accounts →", base);

    // Use Undici's fetch so we can pass { dispatcher }
    const res = await undiciFetch(`${base}/accounts`, {
      headers: {
        Authorization: basicAuthHeader(token),
        Accept: "application/json",
      },
      dispatcher,
    });

    const text = await res.text().catch(() => "");

    if (!res.ok) {
      console.error("[teller] HTTP error", res.status, text);
      return NextResponse.json(
        { error: "teller_http_error", status: res.status, body: text || null },
        { status: 500 }
      );
    }

    let data: any = [];
    try {
      data = text ? JSON.parse(text) : [];
    } catch {
      data = [];
    }

    return NextResponse.json({ accounts: data });
  } catch (e: any) {
    const cause = e?.cause
      ? {
          code: e.cause.code,
          errno: e.cause.errno,
          syscall: e.cause.syscall,
          hostname: e.cause.hostname,
        }
      : null;

    console.error("[teller] fetch failed →", e?.message || e, cause);

    return NextResponse.json(
      { error: e?.message || "fetch failed", cause },
      { status: 500 }
    );
  }
}

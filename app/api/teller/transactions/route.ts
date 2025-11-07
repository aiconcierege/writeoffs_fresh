// app/api/teller/transactions/route.ts
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

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const accountId = url.searchParams.get("account_id");
    const limit = url.searchParams.get("limit") ?? "25";

    if (!accountId) {
      return NextResponse.json({ error: "missing_account_id" }, { status: 400 });
    }

    const token = await getTellerAccessToken();
    const base = tellerApiBase();
    const dispatcher: Dispatcher = tellerDispatcher(); // mTLS (client cert + key)

    const qs = new URLSearchParams({ count: String(limit) });
    const endpoint = `${base}/accounts/${accountId}/transactions?${qs.toString()}`;

    console.log("[teller] GET /transactions →", endpoint);

    // Use Undici's fetch so we can pass { dispatcher }
    const res = await undiciFetch(endpoint, {
      headers: {
        Authorization: basicAuthHeader(token),
        Accept: "application/json",
      },
      dispatcher,
    });

    const text = await res.text().catch(() => "");

    if (!res.ok) {
      console.error("[teller] TXN HTTP error", res.status, text);
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

    return NextResponse.json({ transactions: data });
  } catch (e: any) {
    console.error("[teller] txns fetch failed →", e?.message || e);
    return NextResponse.json(
      { error: e?.message || "fetch failed" },
      { status: 500 }
    );
  }
}

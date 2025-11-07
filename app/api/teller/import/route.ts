// app/api/teller/import/route.ts
import { NextResponse } from "next/server";
import crypto from "crypto";

/**
 * POST /api/teller/import
 * Body: {
 *   accountId: string,           // Teller account id e.g. "acc_..."
 *   accessToken?: string,        // Teller Connect access token (Basic auth). If omitted, cert mode isn't wired here.
 *   from?: string,               // "YYYY-MM-DD" (default: 90 days ago)
 *   to?: string                  // "YYYY-MM-DD" (default: today)
 * }
 *
 * Maps into: posted_at, amount_cents, raw_description, normalized_description, source="teller",
 *            source_account_id, currency="USD", dedupe_hash.
 * Upserts via on_conflict=dedupe_hash (requires ux_transactions_dedupe_hash unique index).
 */

const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

// Teller REST base
const TELLER_BASE = "https://api.teller.io";

// ---------- helpers ----------
function sha1(s: string) {
  return crypto.createHash("sha1").update(s).digest("hex");
}
function normalizeDescription(raw: string) {
  const s = (raw || "").slice(0, 512);
  return s.toUpperCase().replace(/\s+#?\d{3,}\b/g, "").trim();
}
function toISO(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// ---------- route ----------
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const accountId = String(body.accountId || "");
    const accessToken = body.accessToken ? String(body.accessToken) : "";

    if (!accountId) {
      return NextResponse.json({ error: "accountId is required" }, { status: 400 });
    }
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: "Server not configured for Supabase." }, { status: 500 });
    }

    // Date range: default last 90 days
    const today = new Date();
    const fromDate = body.from ? String(body.from) : toISO(new Date(today.getTime() - 90 * 86400000));
    const toDate = body.to ? String(body.to) : toISO(today);

    // --- Fetch from Teller ---
    // Using Connect access token via Basic auth. (Cert mode not wired in this minimal route.)
    const authHeader = accessToken ? "Basic " + Buffer.from(`${accessToken}:`).toString("base64") : "";

    const tellerUrl = `${TELLER_BASE}/accounts/${encodeURIComponent(
      accountId
    )}/transactions?from=${fromDate}&to=${toDate}`;

    const tResp = await fetch(tellerUrl, {
      headers: accessToken ? { Authorization: authHeader } : undefined,
      cache: "no-store",
    });

    if (!tResp.ok) {
      const txt = await tResp.text().catch(() => "");
      return NextResponse.json(
        {
          error: `Teller fetch failed (${tResp.status})`,
          details: txt.slice(0, 1000),
          hint: accessToken
            ? "Check accessToken and accountId (and that they match)."
            : "No accessToken provided; this route expects a Teller Connect token.",
        },
        { status: 502 }
      );
    }

    type TellerTx = {
      id: string;
      description: string;
      details?: { counterparty?: { name?: string } } | null;
      date: string;   // YYYY-MM-DD
      amount: string; // "-12.34"
    };

    const tellerRows: TellerTx[] = await tResp.json();

    // Map to our schema + dedupe
    const prepared: Array<Record<string, any>> = [];
    const seen = new Set<string>();

    for (const tx of tellerRows) {
      const posted_at = tx.date;
      const amtNum = Number(String(tx.amount).replace(/[, ]/g, ""));
      if (!posted_at || Number.isNaN(amtNum)) continue;

      const amount_cents = Math.round(amtNum * 100);
      const raw_description =
        tx.description ||
        (tx.details?.counterparty?.name ?? "").toString() ||
        "TRANSACTION";
      const normalized_description = normalizeDescription(raw_description);
      const source_account_id = accountId;

      const dedupe_hash = sha1(`${posted_at}|${amount_cents}|${normalized_description}|${source_account_id}`);
      if (seen.has(dedupe_hash)) continue;
      seen.add(dedupe_hash);

      prepared.push({
        posted_at,
        amount_cents,
        currency: "USD",
        raw_description,
        normalized_description,
        source: "teller",
        source_account_id,
        dedupe_hash,
      });
    }

    if (prepared.length === 0) {
      return NextResponse.json(
        { ok: true, imported: 0, skipped: 0, range: { from: fromDate, to: toDate } },
        { status: 200 }
      );
    }

    // Upsert to Supabase (on_conflict requires full unique index on dedupe_hash)
    const sResp = await fetch(`${SUPABASE_URL}/rest/v1/transactions?on_conflict=dedupe_hash`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=representation",
      },
      body: JSON.stringify(prepared),
    });

    const text = await sResp.text();
    if (!sResp.ok) {
      return NextResponse.json(
        { error: `Supabase insert failed (${sResp.status})`, details: text.slice(0, 2000) },
        { status: 500 }
      );
    }

    const inserted = text ? JSON.parse(text) : [];
    return NextResponse.json(
      {
        ok: true,
        imported: inserted.length,
        skipped: Math.max(0, prepared.length - inserted.length),
        range: { from: fromDate, to: toDate },
      },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unexpected error." }, { status: 500 });
  }
}


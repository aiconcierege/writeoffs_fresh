// app/api/import/csv/route.ts
import { NextResponse } from "next/server";
import crypto from "crypto";
import {
  getAuthenticatedContext,
  unauthorizedResponse,
} from "../../../lib/auth/require-user";

type Mapping = { date: string | null; description: string | null; amount: string | null };
type Body = {
  pack?: "general" | "realtor";
  mapping: Mapping;
  rows: Record<string, string>[];
};

function normalizeDate(input: string): string | null {
  if (!input) return null;
  const t = input.trim();

  // YYYY-MM-DD
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  if (m) {
    const [, y, mo, d] = m;
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  // MM/DD/YYYY
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(t);
  if (m) {
    const [, mm, dd, rawYear] = m;
    let yy = rawYear;
    if (yy.length === 2) yy = `20${yy}`;
    return `${yy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  }

  // DD.MM.YYYY
  m = /^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/.exec(t);
  if (m) {
    const [, dd, mm, rawYear] = m;
    let yy = rawYear;
    if (yy.length === 2) yy = `20${yy}`;
    return `${yy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  }

  const d = new Date(t);
  if (!isNaN(d.getTime())) {
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, "0");
    const da = String(d.getDate()).padStart(2, "0");
    return `${y}-${mo}-${da}`;
  }

  return null;
}

function normalizeAmount(input: string): number | null {
  if (!input) return null;
  let s = input.trim().replace(/[, ]/g, "");
  const neg = /^\(.*\)$/.test(s);
  if (neg) s = s.slice(1, -1);
  const n = Number(s);
  if (isNaN(n)) return null;
  return neg ? -n : n;
}

function normalizeDescription(raw: string): string {
  const s = (raw || "").slice(0, 512);
  // strip trailing long digit tokens (e.g., #12345)
  return s.toUpperCase().replace(/\s+#?\d{3,}\b/g, "").trim();
}

function sha1(s: string): string {
  return crypto.createHash("sha1").update(s).digest("hex");
}

export async function POST(req: Request) {
  try {
    const { supabase, user } = await getAuthenticatedContext();
    if (!user) return unauthorizedResponse();

    const body = (await req.json()) as Body;

    if (!body?.rows?.length) {
      return NextResponse.json({ error: "No rows provided." }, { status: 400 });
    }
    if (!body.mapping?.date || !body.mapping?.description || !body.mapping?.amount) {
      return NextResponse.json(
        { error: "Mapping must include date, description, and amount." },
        { status: 400 }
      );
    }

    const dateKey = body.mapping.date!;
    const descKey = body.mapping.description!;
    const amtKey = body.mapping.amount!;

    const prepared: Array<Record<string, any>> = [];
    const errors: { row: number; reason: string }[] = [];
    const seen = new Set<string>();

    for (let i = 0; i < body.rows.length; i++) {
      const r = body.rows[i] || {};
      const rawDate = String(r[dateKey] ?? "").trim();
      const rawDesc = String(r[descKey] ?? "").trim();
      const rawAmt = String(r[amtKey] ?? "").trim();

      const posted_at = normalizeDate(rawDate);
      if (!posted_at) {
        errors.push({ row: i + 2, reason: `Invalid date: "${rawDate}"` });
        continue;
      }

      const amount = normalizeAmount(rawAmt);
      if (amount === null) {
        errors.push({ row: i + 2, reason: `Invalid amount: "${rawAmt}"` });
        continue;
      }

      const amount_cents = Math.round(amount * 100);
      const normalized_description = normalizeDescription(rawDesc);
      const source_account_id = "csv";
      // Keep the legacy hash stable; uniqueness is scoped by authenticated user.
      const dedupe_hash = sha1(`${posted_at}|${amount_cents}|${normalized_description}|${source_account_id}`);

      if (seen.has(dedupe_hash)) continue;
      seen.add(dedupe_hash);

      // Do NOT include fiscal_year (generated column).
      prepared.push({
        user_id: user.id,
        date: posted_at,
        vendor: rawDesc || normalized_description || "Imported transaction",
        description: rawDesc || normalized_description || null,
        amount,
        posted_at,
        amount_cents,
        currency: "USD",
        raw_description: rawDesc,
        normalized_description,
        source: "csv",
        source_account_id,
        dedupe_hash,
      });
    }

    const { data: inserted, error: insertError } = await supabase
      .from("transactions")
      .upsert(prepared, { onConflict: "user_id,dedupe_hash" })
      .select("id");

    if (insertError) {
      return NextResponse.json(
        { error: "Transaction import failed." },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { ok: true, mode: "db", imported: inserted?.length ?? 0, errors },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unexpected error." }, { status: 500 });
  }
}

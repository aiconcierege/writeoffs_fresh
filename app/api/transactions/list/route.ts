// app/api/transactions/list/route.ts
import { NextResponse } from "next/server";

const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

// GET /api/transactions/list?year=2025 | year=all
export async function GET(req: Request) {
  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json(
        { ok: false, error: "Supabase env vars not set. Nothing to list yet." },
        { status: 200 }
      );
    }

    const { searchParams } = new URL(req.url);
    const yearParam = (searchParams.get("year") || "").toLowerCase(); // "2025" | "all" | ""

    const select =
      "id,posted_at,amount_cents,raw_description,source";

    // Base URL + ordering
    let url =
      `${SUPABASE_URL}/rest/v1/transactions` +
      `?select=${encodeURIComponent(select)}` +
      `&order=posted_at.desc.nullslast` +
      `&limit=200`;

    // If a specific year is requested, filter by posted_at range
    if (yearParam && yearParam !== "all") {
      const y = Number(yearParam);
      if (!Number.isNaN(y)) {
        const from = `${y}-01-01`;
        const to = `${y}-12-31`;
        url += `&posted_at=gte.${from}&posted_at=lte.${to}`;
      }
    }

    const resp = await fetch(url, {
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
      cache: "no-store",
    });

    const text = await resp.text();
    if (!resp.ok) {
      return NextResponse.json(
        { ok: false, error: `Supabase error ${resp.status}`, details: text.slice(0, 1000) },
        { status: 200 }
      );
    }

    const data = text ? JSON.parse(text) : [];
    return NextResponse.json({ ok: true, rows: data }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Unexpected error" },
      { status: 200 }
    );
  }
}

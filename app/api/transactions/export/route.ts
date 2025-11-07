// app/api/transactions/export/route.ts
import { NextResponse } from "next/server";

const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

// GET /api/transactions/export?year=2025 | year=all
export async function GET(req: Request) {
  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json(
        { error: "Server is not configured for Supabase." },
        { status: 500 }
      );
    }

    const { searchParams } = new URL(req.url);
    const yearParam = (searchParams.get("year") || "").toLowerCase(); // "2025" | "all" | ""
    const select = "posted_at,raw_description,amount_cents,source";

    let url =
      `${SUPABASE_URL}/rest/v1/transactions` +
      `?select=${encodeURIComponent(select)}` +
      `&order=posted_at.asc.nullsfirst`;

    // Filter by date range if a specific year is requested
    if (yearParam && yearParam !== "all") {
      const y = Number(yearParam);
      if (!Number.isNaN(y)) {
        url += `&posted_at=gte.${y}-01-01&posted_at=lte.${y}-12-31`;
      }
    }

    const resp = await fetch(url, {
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
      cache: "no-store",
    });

    if (!resp.ok) {
      const txt = await resp.text().catch(() => "");
      return NextResponse.json(
        { error: `Supabase error ${resp.status}`, details: txt.slice(0, 1000) },
        { status: 500 }
      );
    }

    const rows: Array<{
      posted_at: string | null;
      raw_description: string | null;
      amount_cents: number | null;
      source: string | null;
    }> = await resp.json();

    // Build CSV
    const header = ["date", "description", "amount", "source"];
    const lines = [header.join(",")];

    for (const r of rows) {
      const date = r.posted_at ?? "";
      const desc = (r.raw_description ?? "").replace(/"/g, '""'); // escape quotes
      const amount = (typeof r.amount_cents === "number" ? r.amount_cents / 100 : "")
        .toString();
      const source = r.source ?? "";
      // Quote fields that may contain commas/quotes
      lines.push([
        date,
        `"${desc}"`,
        amount,
        source,
      ].join(","));
    }

    const csv = lines.join("\r\n");
    const y = yearParam && yearParam !== "all" ? yearParam : "all";
    const filename = `writeoffs-transactions-${y}.csv`;

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Unexpected error." },
      { status: 500 }
    );
  }
}

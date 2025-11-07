// app/api/mileage/export/route.ts
import { NextResponse } from "next/server";

const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

// GET /api/mileage/export?year=2025 | year=all
export async function GET(req: Request) {
  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: "Supabase not configured." }, { status: 500 });
    }

    const { searchParams } = new URL(req.url);
    const year = (searchParams.get("year") || "").toLowerCase();

    let url =
      `${SUPABASE_URL}/rest/v1/mileage_trips` +
      `?select=date,purpose,start_label,end_label,miles,client,notes` +
      `&order=date.asc.nullsfirst`;

    if (year && year !== "all") {
      const y = Number(year);
      if (!Number.isNaN(y)) {
        url += `&date=gte.${y}-01-01&date=lte.${y}-12-31`;
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
      date: string | null;
      purpose: string | null;
      start_label: string | null;
      end_label: string | null;
      miles: number | null;
      client: string | null;
      notes: string | null;
    }> = await resp.json();

    const header = ["date","purpose","from","to","miles","client","notes"];
    const lines = [header.join(",")];

    for (const r of rows) {
      const esc = (s: string | null) => `"${(s ?? "").replace(/"/g,'""')}"`;
      lines.push([
        r.date ?? "",
        esc(r.purpose),
        esc(r.start_label),
        esc(r.end_label),
        r.miles ?? "",
        esc(r.client),
        esc(r.notes),
      ].join(","));
    }

    const csv = lines.join("\r\n");
    const y = year && year !== "all" ? year : "all";
    const filename = `writeoffs-mileage-${y}.csv`;

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unexpected error." }, { status: 500 });
  }
}

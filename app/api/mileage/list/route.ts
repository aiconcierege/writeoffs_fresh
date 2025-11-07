// app/api/mileage/list/route.ts
import { NextResponse } from "next/server";

const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

// GET /api/mileage/list?year=2025 | year=all
export async function GET(req: Request) {
  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ ok: false, error: "Supabase not configured." }, { status: 200 });
    }

    const { searchParams } = new URL(req.url);
    const year = (searchParams.get("year") || "").toLowerCase();

    let url =
      `${SUPABASE_URL}/rest/v1/mileage_trips` +
      `?select=id,date,purpose,start_label,end_label,miles,client,notes,created_at` +
      `&order=date.desc.nullslast&limit=1000`;

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

    const text = await resp.text();
    if (!resp.ok) {
      return NextResponse.json(
        { ok: false, error: `Supabase error ${resp.status}`, details: text.slice(0, 1000) },
        { status: 200 }
      );
    }

    const rows = text ? JSON.parse(text) : [];
    return NextResponse.json({ ok: true, rows }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Unexpected error" }, { status: 200 });
  }
}

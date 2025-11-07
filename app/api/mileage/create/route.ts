// app/api/mileage/create/route.ts
import { NextResponse } from "next/server";

const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

type Body = {
  date: string;            // "YYYY-MM-DD"
  purpose: string;
  start_label: string;
  end_label: string;
  miles: number;           // e.g., 12.5
  client?: string | null;
  notes?: string | null;
};

export async function POST(req: Request) {
  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: "Supabase not configured." }, { status: 500 });
    }

    const b = (await req.json()) as Partial<Body>;

    // Minimal validation
    if (!b.date || !b.purpose || !b.start_label || !b.end_label || b.miles == null) {
      return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
    }
    const milesNum = Number(b.miles);
    if (Number.isNaN(milesNum) || milesNum < 0) {
      return NextResponse.json({ error: "Miles must be a non-negative number." }, { status: 400 });
    }

    const row = {
      date: String(b.date),
      purpose: String(b.purpose).slice(0, 500),
      start_label: String(b.start_label).slice(0, 250),
      end_label: String(b.end_label).slice(0, 250),
      miles: milesNum,
      client: (b.client ?? null) ? String(b.client).slice(0, 250) : null,
      notes: (b.notes ?? null) ? String(b.notes).slice(0, 1000) : null,
    };

    const resp = await fetch(`${SUPABASE_URL}/rest/v1/mileage_trips`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify([row]),
    });

    const text = await resp.text();
    if (!resp.ok) {
      return NextResponse.json(
        { error: `Supabase insert failed (${resp.status})`, details: text.slice(0, 1000) },
        { status: 500 }
      );
    }

    const inserted = text ? JSON.parse(text) : [];
    return NextResponse.json({ ok: true, inserted: inserted[0] ?? null }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unexpected error." }, { status: 500 });
  }
}

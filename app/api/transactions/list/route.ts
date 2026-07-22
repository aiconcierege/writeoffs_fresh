// app/api/transactions/list/route.ts
import { NextResponse } from "next/server";
import {
  getAuthenticatedContext,
  unauthorizedResponse,
} from "../../../lib/auth/require-user";

// GET /api/transactions/list?year=2025 | year=all
export async function GET(req: Request) {
  try {
    const { supabase, user } = await getAuthenticatedContext();
    if (!user) return unauthorizedResponse();

    const { searchParams } = new URL(req.url);
    const yearParam = (searchParams.get("year") || "").toLowerCase(); // "2025" | "all" | ""

    let query = supabase
      .from("transactions")
      .select("id,posted_at,amount_cents,raw_description,source")
      .eq("user_id", user.id)
      .order("posted_at", { ascending: false, nullsFirst: false })
      .limit(200);

    // If a specific year is requested, filter by posted_at range
    if (yearParam && yearParam !== "all") {
      const y = Number(yearParam);
      if (!Number.isNaN(y)) {
        const from = `${y}-01-01`;
        const to = `${y}-12-31`;
        query = query.gte("posted_at", from).lte("posted_at", to);
      }
    }

    const { data, error } = await query;
    if (error) {
      return NextResponse.json(
        { ok: false, error: "Could not list transactions." },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, rows: data }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Unexpected error" },
      { status: 200 }
    );
  }
}

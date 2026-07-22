// app/api/transactions/export/route.ts
import { NextResponse } from "next/server";
import {
  getAuthenticatedContext,
  unauthorizedResponse,
} from "../../../lib/auth/require-user";

// GET /api/transactions/export?year=2025 | year=all
export async function GET(req: Request) {
  try {
    const { supabase, user } = await getAuthenticatedContext();
    if (!user) return unauthorizedResponse();

    const { searchParams } = new URL(req.url);
    const yearParam = (searchParams.get("year") || "").toLowerCase(); // "2025" | "all" | ""
    let query = supabase
      .from("transactions")
      .select("posted_at,raw_description,amount_cents,source")
      .eq("user_id", user.id)
      .order("posted_at", { ascending: true, nullsFirst: true });

    // Filter by date range if a specific year is requested
    if (yearParam && yearParam !== "all") {
      const y = Number(yearParam);
      if (!Number.isNaN(y)) {
        query = query.gte("posted_at", `${y}-01-01`).lte("posted_at", `${y}-12-31`);
      }
    }

    const { data, error } = await query;
    if (error) {
      return NextResponse.json(
        { error: "Could not export transactions." },
        { status: 500 }
      );
    }

    const rows: Array<{
      posted_at: string | null;
      raw_description: string | null;
      amount_cents: number | null;
      source: string | null;
    }> = data ?? [];

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

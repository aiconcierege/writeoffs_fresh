// app/api/transactions/list/route.ts
import { NextResponse } from "next/server";
import {
  getAuthenticatedContext,
  unauthorizedResponse,
} from "../../../lib/auth/require-user";
import { listTransactionReadModel } from "../../../lib/bookkeeping/transaction-read-model";

// GET /api/transactions/list?year=2025 | year=all
export async function GET(req: Request) {
  try {
    const { supabase, user } = await getAuthenticatedContext();
    if (!user) return unauthorizedResponse();

    const { searchParams } = new URL(req.url);
    const yearParam = (searchParams.get("year") || "").toLowerCase(); // "2025" | "all" | ""

    let year: number | null = null;
    if (yearParam && yearParam !== "all") {
      const y = Number(yearParam);
      if (!Number.isNaN(y)) {
        year = y;
      }
    }
    const rows = await listTransactionReadModel({ supabase, userId: user.id, year, limit: 200 });
    return NextResponse.json({ ok: true, rows: rows.map((row) => ({
      id: row.id,
      posted_at: row.date,
      amount_cents: row.amountCents,
      raw_description: row.description,
      source: row.sourceModel,
      treatment: row.treatmentLabel,
      has_receipt: row.has_receipt,
    })) }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Unexpected error" },
      { status: 200 }
    );
  }
}

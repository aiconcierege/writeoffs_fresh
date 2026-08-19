// app/api/import/csv/route.ts
import { NextResponse } from "next/server";
import {
  getAuthenticatedContext,
  unauthorizedResponse,
} from "../../../lib/auth/require-user";
import {
  ingestCsvFinancialActivity,
  prepareCsvFinancialRows,
  type CsvColumnMapping,
} from "../../../lib/bookkeeping/csv-ingestion";

type Body = {
  pack?: "general" | "realtor";
  mapping: CsvColumnMapping;
  rows: Record<string, string>[];
};

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

    const prepared = prepareCsvFinancialRows({
      mapping: body.mapping,
      rows: body.rows,
    });
    const result = await ingestCsvFinancialActivity({
      supabase,
      rows: prepared.rows,
    });

    return NextResponse.json(
      {
        ok: true,
        mode: "db",
        imported: result.imported,
        duplicates: result.duplicates,
        errors: prepared.errors,
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unexpected error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

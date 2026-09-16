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
import { membershipErrorResponse, requireCapability } from "../../../lib/membership/entitlements";

import { containsDocumentBinaryText } from "../../../lib/documents/file-validation";

type Body = {
  mapping: CsvColumnMapping;
  rows: Record<string, string>[];
};

export async function POST(req: Request) {
  try {
    const { supabase, user } = await getAuthenticatedContext();
    if (!user) return unauthorizedResponse();
    try { await requireCapability(supabase, "import_csv") } catch (cause) {
      const denied=membershipErrorResponse(cause); return NextResponse.json({error:denied.error},{status:denied.status})
    }

    const body = (await req.json()) as Body;

    if (containsDocumentBinaryText(body)) return NextResponse.json({error:"This file needs document processing. Use Send Betti documents."},{status:400});
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
    if(prepared.errors.length) return NextResponse.json({error:"Some activity could not be read safely. Please check the document."},{status:400});
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
    const message = "The file could not be imported safely.";
    void error;
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

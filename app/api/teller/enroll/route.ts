import { NextResponse } from "next/server";
import {
  getAuthenticatedContext,
  unauthorizedResponse,
} from "../../../lib/auth/require-user";

export const dynamic = "force-dynamic";

/**
 * @deprecated Teller is retained only for temporary historical compatibility.
 * New bank connections are blocked while the provider-neutral banking model is
 * built. A future provider will use a new enrollment boundary.
 */
export async function POST() {
  const { user } = await getAuthenticatedContext();
  if (!user) return unauthorizedResponse();

  return NextResponse.json(
    {
      error: "bank_connections_unavailable",
      message: "New bank connections are temporarily unavailable.",
    },
    { status: 410, headers: { "Cache-Control": "no-store" } }
  );
}

// app/api/mileage/export/route.ts
import {
  getAuthenticatedContext,
  temporarilyUnavailableResponse,
  unauthorizedResponse,
} from "../../../lib/auth/require-user";

// GET /api/mileage/export?year=2025 | year=all
export async function GET(req: Request) {
  try {
    const { user } = await getAuthenticatedContext();
    if (!user) return unauthorizedResponse();

    void req;
    return temporarilyUnavailableResponse(
      "Mileage export is temporarily unavailable while account ownership is being added."
    );
  } catch {
    return temporarilyUnavailableResponse(
      "Mileage export is temporarily unavailable while account ownership is being added."
    );
  }
}

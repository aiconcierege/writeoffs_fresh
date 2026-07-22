// app/api/mileage/list/route.ts
import {
  getAuthenticatedContext,
  temporarilyUnavailableResponse,
  unauthorizedResponse,
} from "../../../lib/auth/require-user";

// GET /api/mileage/list?year=2025 | year=all
export async function GET(req: Request) {
  try {
    const { user } = await getAuthenticatedContext();
    if (!user) return unauthorizedResponse();

    void req;
    return temporarilyUnavailableResponse(
      "Mileage is temporarily unavailable while account ownership is being added."
    );
  } catch {
    return temporarilyUnavailableResponse(
      "Mileage is temporarily unavailable while account ownership is being added."
    );
  }
}

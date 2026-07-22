// app/api/mileage/create/route.ts
import {
  getAuthenticatedContext,
  temporarilyUnavailableResponse,
  unauthorizedResponse,
} from "../../../lib/auth/require-user";

export async function POST(req: Request) {
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

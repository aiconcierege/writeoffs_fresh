// app/api/teller/webhook/route.ts
import { NextResponse } from "next/server";
import crypto from "crypto";

function verifySignature(body: string, signature: string | null, secret: string) {
  if (!signature) return false;
  const expected = crypto.createHmac("sha256", secret).update(body, "utf8").digest("hex");
  // Teller typically sends a hex signature; constant-time compare:
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

export async function POST(req: Request) {
  const raw = await req.text();
  const sig = req.headers.get("teller-signature"); // header key per Teller docs
  const secret = process.env.TELLER_WEBHOOK_SECRET || "";

  if (!secret) {
    return new NextResponse("Webhook secret not configured", { status: 500 });
  }

  const ok = verifySignature(raw, sig, secret);
  if (!ok) {
    return new NextResponse("Invalid signature", { status: 400 });
  }

  // Parse after verifying
  const evt = JSON.parse(raw);

  // Minimal router — we’ll flesh out handlers next
  // Expected types you enabled: "transactions.processed", "enrollment.disconnected"
  switch (evt.type) {
    case "transactions.processed":
      // TODO: upsert transactions into Supabase
      break;
    case "enrollment.disconnected":
      // TODO: mark the bank connection as revoked
      break;
    default:
      // ignore for now
      break;
  }

  return NextResponse.json({ received: true });
}

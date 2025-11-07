// app/api/debug/env/route.ts
import { NextResponse } from "next/server";

function mask(v?: string | null) {
  if (!v) return "❌ missing";
  if (v.startsWith("sk_test_")) return "sk_test_…";
  if (v.startsWith("sk_live_")) return "sk_live_…";
  if (v.startsWith("pk_test_")) return "pk_test_…";
  if (v.startsWith("pk_live_")) return "pk_live_…";
  if (v.startsWith("price_")) return "price_…";
  return "✓ present";
}

export async function GET() {
  return NextResponse.json(
    {
      NODE_ENV: process.env.NODE_ENV ?? null,

      // Server secret
      STRIPE_SECRET_KEY: mask(process.env.STRIPE_SECRET_KEY),

      // Publishable key
      NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: mask(
        process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
      ),

      // Price IDs this build is using
      PRICE_STARTER_MONTHLY:
        process.env.NEXT_PUBLIC_STRIPE_PRICE_STARTER_MONTHLY || "❌ missing",
      PRICE_STARTER_ANNUAL:
        process.env.NEXT_PUBLIC_STRIPE_PRICE_STARTER_ANNUAL || "❌ missing",
      PRICE_PRO_MONTHLY:
        process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO_MONTHLY || "❌ missing",
      PRICE_PRO_ANNUAL:
        process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO_ANNUAL || "❌ missing",
      PRICE_PRO_PLUS_MONTHLY:
        process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO_PLUS_MONTHLY || "❌ missing",
      PRICE_PRO_PLUS_ANNUAL:
        process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO_PLUS_ANNUAL || "❌ missing",
    },
    { status: 200 }
  );
}

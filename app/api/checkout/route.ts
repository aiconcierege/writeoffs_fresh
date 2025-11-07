// app/api/checkout/route.ts
import { NextResponse } from "next/server"
import Stripe from "stripe"

export const runtime = "nodejs" // required: Stripe SDK needs Node runtime

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || ""
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"

// ✅ Correct ternary: create Stripe client only if key exists
const stripe = STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY) : null

export async function POST(req: Request) {
  try {
    if (!stripe) {
      return NextResponse.json(
        { error: "Stripe not configured. Set STRIPE_SECRET_KEY." },
        { status: 500 }
      )
    }

    const { priceId, email } = await req.json().catch(() => ({} as any))
    if (!priceId || typeof priceId !== "string") {
      return NextResponse.json({ error: "Missing priceId." }, { status: 400 })
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      allow_promotion_codes: true,
      billing_address_collection: "auto",
      automatic_tax: { enabled: true },
      customer_email: typeof email === "string" ? email : undefined,
      success_url: `${BASE_URL}/dashboard?cs={CHECKOUT_SESSION_ID}`,
      cancel_url: `${BASE_URL}/#pricing`,
    })

    return NextResponse.json({ url: session.url }, { status: 200 })
  } catch (e: any) {
    console.error("Stripe checkout error:", e)
    return NextResponse.json(
      { error: e?.message || "Unexpected Stripe error" },
      { status: 500 }
    )
  }
}

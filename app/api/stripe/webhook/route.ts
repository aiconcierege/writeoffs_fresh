// app/api/stripe/webhook/route.ts
import { NextResponse } from "next/server"
import { headers } from "next/headers"
import Stripe from "stripe"

export const runtime = "nodejs" // Stripe webhooks need Node runtime

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || ""
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || ""

const stripe = STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY) : null

export async function POST(req: Request) {
  if (!stripe) {
    console.error("Stripe not configured. Missing STRIPE_SECRET_KEY.")
    return NextResponse.json({ error: "Stripe not configured" }, { status: 500 })
  }

  if (!STRIPE_WEBHOOK_SECRET) {
    console.error("Missing STRIPE_WEBHOOK_SECRET env var.")
    return NextResponse.json(
      { error: "Webhook secret not configured" },
      { status: 500 }
    )
  }

  const body = await req.text()
  const sig = (await headers()).get("stripe-signature")

  if (!sig) {
    console.error("Missing Stripe signature header")
    return NextResponse.json(
      { error: "Missing Stripe signature" },
      { status: 400 }
    )
  }

  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(body, sig, STRIPE_WEBHOOK_SECRET)
  } catch (err: any) {
    console.error("❌ Error verifying Stripe webhook:", err?.message || err)
    return NextResponse.json(
      { error: `Webhook Error: ${err?.message || "invalid signature"}` },
      { status: 400 }
    )
  }

  // For now just log what we get. We’ll add Supabase writes later.
  console.log("✅ Stripe webhook received:", event.type)

  switch (event.type) {
    case "checkout.session.completed":
      // TODO: handle new subscription
      break
    case "customer.subscription.updated":
    case "customer.subscription.created":
    case "customer.subscription.deleted":
      // TODO: handle subscription changes
      break
    default:
      // Ignore other events for now
      break
  }

  return NextResponse.json({ received: true }, { status: 200 })
}

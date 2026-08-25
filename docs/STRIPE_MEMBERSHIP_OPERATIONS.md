# Stripe Membership Operations

This guide operates the membership model defined in [MEMBERSHIP_ARCHITECTURE.md](./MEMBERSHIP_ARCHITECTURE.md). Stripe collects payment; `business_memberships` is WriteOffs’ current product-access projection. Never grant access from a browser redirect, email address, legacy `subscriptions` row, or an unverified webhook.

## Architecture and environments

Each Business has at most one current membership, a separate Stripe customer/subscription link, append-only membership events, optional explicit grants, and replay-safe webhook receipts. Plans (`expenses`, `business`) are separate from lifecycle (`active`, `payment_issue`, `canceling`, `expired_read_only`). Entitlements are resolved centrally by `app/lib/membership/entitlements.ts`.

Required server configuration:

- `WRITEOFFS_STRIPE_MODE=test|live`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_EXPENSES_PRICE_ID`
- `STRIPE_BUSINESS_PRICE_ID`
- `NEXT_PUBLIC_BASE_URL`
- `MEMBERSHIP_PAYMENT_GRACE_DAYS` (default 7)
- `MEMBERSHIP_EXPENSES_PLAID_ITEM_LIMIT` (working default 3)
- `MEMBERSHIP_BUSINESS_PLAID_ITEM_LIMIT` (working default 8)

Outside production, live Stripe mode is rejected. Return URLs must be an HTTPS origin, except HTTP localhost. Plaid remains Sandbox-only. Do not place Stripe secrets in `NEXT_PUBLIC_*`, logs, client components, fixtures, or documentation.

## Stripe products and portal

Create two products with one recurring monthly Price each: WriteOffs Expenses and WriteOffs Business. Configure the Price IDs above. No annual price or trial is supported. Checkout may optionally enable Stripe promotion codes and Stripe Tax through `STRIPE_ALLOW_PROMOTION_CODES=true` and `STRIPE_TAX_ENABLED=true`; discounts never alter entitlements.

The Customer Portal should allow payment-method and billing-history management. Disable unrestricted subscription cancellation and plan switching in the Stripe Dashboard portal: WriteOffs owns period-end downgrade/cancellation intent and its explainable projection.

## Webhooks

Configure `POST /api/stripe/webhook` for:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.paid`
- `invoice.payment_failed`

The endpoint verifies the Stripe signature before parsing. It stores event identity, rejects duplicates, rejects provider events older than the latest applied event, fetches current subscription state for non-deletion subscription updates, and applies the provider state transactionally. Unsafe failures return a retryable HTTP response. Logs must contain no full payload, card data, or provider secrets.

For local Stripe CLI testing, source local-only test credentials, then run `stripe listen --forward-to localhost:3000/api/stripe/webhook` and place its temporary test signing secret only in the local environment. Never run this flow with a live key.

## Lifecycle behavior

- Upgrade: Stripe changes Expenses to Business immediately with invoice proration. Business access begins only after provider-confirmed webhook state.
- Downgrade: a Stripe Subscription Schedule keeps Business until current period end, then changes to Expenses. WriteOffs stores the customer-confirmed scheduled intent.
- Cancellation: `cancel_at_period_end`; paid capabilities remain until period end. It may be reversed before then.
- Failed renewal: Stripe retries payment; WriteOffs projects `payment_issue` and preserves capabilities through the configured grace deadline. Recovery restores `active`. Elapsed grace or paid access becomes `expired_read_only` through the service-only expiry RPC/scheduled maintenance invocation.
- Restart: an expired customer chooses a plan through Checkout. Historical records remain; new activity resumes after provider confirmation. No bulk historical reimport occurs.

Already accepted durable work may finish to a canonical terminal state after expiration so partial source evidence is not corrupted. New receipt, statement, CSV, Plaid, manual-money, mileage, invoice, contractor, deduction, OCR, and autonomous intake is denied. Historical reads, downloads, exports, security, billing, and deletion pathways remain available.

Stripe billing emails handle receipts and failed-payment notices at launch. WriteOffs supplies restrained in-app state. Disputes/chargebacks require operator review; never delete financial records in response.

## Local and prelaunch grants

Grants are explicit, Business-owned, auditable, and service-only. They do not create fake Stripe IDs. After a local Supabase reset and user/Business setup:

```sh
set -a
source .env.local
set +a
npm run grant:membership -- BUSINESS_UUID business
```

The helper refuses non-local Supabase hosts. Use `expenses` to test that plan and optionally add an ISO expiration. There is no public grant endpoint.

## Production rollout

1. Deploy and verify the additive schema without enabling route enforcement for real customers.
2. Create explicit grants for approved prelaunch Businesses and verify them.
3. Configure test Products, Prices, portal, webhook, and end-to-end test-mode lifecycle.
4. Configure production Products, monthly Prices, tax decision, portal restrictions, and webhook secret.
5. Deploy required environment configuration and verify fail-closed health.
6. Enable enforcement and monitor webhook duplicates, stale events, failures, payment issues, and expiry.
7. Remove all runtime dependency on legacy subscription paths; retain legacy data only as non-authoritative history.

Never manually change a Stripe subscription plan, schedule, cancellation state, Customer mapping, or metadata without reconciling the WriteOffs projection. Rollback should disable new checkout/mutations while retaining membership reads and historical access; never roll back financial data or delete provider event evidence.

## Troubleshooting

- Checkout unavailable: verify test/live mode, both Price IDs, return origin, authenticated Business, and server key.
- Webhook retries: verify signature secret, Business metadata, Customer mapping, and configured Price mapping.
- Membership still processing: inspect safe event ID/type/result metadata and canonical membership history; do not paste full payloads into logs.
- Local user has no access: create an explicit local grant; legacy plan rows intentionally grant nothing.

Production decisions still required: final prices, Plaid Item limits after Production economics, Stripe Tax configuration, Portal settings, Stripe retry schedule, billing email copy, and chargeback operator policy.

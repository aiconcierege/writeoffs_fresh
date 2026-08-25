# Stripe Membership Operations

Production activation is governed by `PRODUCTION_SECURITY_OPERATIONS.md` and `PRODUCTION_LAUNCH_GATE.md`. Set `STRIPE_MEMBERSHIP_ENABLED=true` only with live-mode credentials, both live monthly Price IDs, signed webhook secret, and the restricted live Portal configuration. Keep it false while the application is staged without live billing.

This guide operates the membership model defined in [MEMBERSHIP_ARCHITECTURE.md](./MEMBERSHIP_ARCHITECTURE.md). Stripe collects payment; `business_memberships` is WriteOffs’ current product-access projection. Never grant access from a browser redirect, email address, legacy `subscriptions` row, or an unverified webhook.

## Architecture and environments

Each Business has at most one current membership, a separate Stripe customer/subscription link, append-only membership events, optional explicit grants, and replay-safe webhook receipts. Plans (`expenses`, `business`) are separate from lifecycle (`active`, `payment_issue`, `canceling`, `expired_read_only`). Entitlements are resolved centrally by `app/lib/membership/entitlements.ts`.

Required server configuration:

- `WRITEOFFS_STRIPE_MODE=test|live`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_EXPENSES_PRICE_ID`
- `STRIPE_BUSINESS_PRICE_ID`
- `STRIPE_PORTAL_CONFIGURATION_ID`
- `NEXT_PUBLIC_BASE_URL`
- `MEMBERSHIP_PAYMENT_GRACE_DAYS` (default 7)
- `MEMBERSHIP_EXPENSES_PLAID_ITEM_LIMIT` (working default 3)
- `MEMBERSHIP_BUSINESS_PLAID_ITEM_LIMIT` (working default 8)

Outside production, live Stripe mode is rejected. Return URLs must be an HTTPS origin, except HTTP localhost. Plaid remains Sandbox-only. Do not place Stripe secrets in `NEXT_PUBLIC_*`, logs, client components, fixtures, or documentation.

## Stripe products and portal

Create two products with one recurring monthly Price each: WriteOffs Expenses and WriteOffs Business. Configure the Price IDs above. No annual price or trial is supported. Checkout may optionally enable Stripe promotion codes and Stripe Tax through `STRIPE_ALLOW_PROMOTION_CODES=true` and `STRIPE_TAX_ENABLED=true`; discounts never alter entitlements.

The Customer Portal configuration is explicit and server-selected. It should allow payment-method and billing-history management. Disable unrestricted subscription cancellation and plan switching: WriteOffs owns period-end downgrade/cancellation intent and its explainable projection. A missing Portal configuration fails closed.

## Test-mode activation findings (August 2026)

The local lifecycle was validated against real Stripe test objects and Stripe CLI 1.31.1 using API version `2025-09-30.clover` for forwarded events. The canonical test catalog contains one active monthly USD Price for each product:

- WriteOffs Expenses — $19/month — “Expenses, deductions and documentation.”
- WriteOffs Business — $29/month — “Income, expenses and tax-ready business records.”

Product and Price IDs remain local environment configuration and are not committed. Both hosted Checkout journeys, signed webhook activation, Customer reuse, immediate upgrade, period-end downgrade, cancellation reversal, failed-payment recovery, expiration, read-only access, and restart were exercised with synthetic local Businesses. The upgrade generated and paid a prorated invoice for the remaining period; the observed test amount depended on the time remaining and is not product authority.

Subscription Schedules are suitable for the bounded period-end downgrade. The current phase preserves Business and the next phase changes to Expenses. Cancellation takes precedence: WriteOffs releases an existing downgrade schedule before setting `cancel_at_period_end`. A downgrade request is rejected while cancellation is already scheduled. Releasing a scheduled downgrade leaves Business active.

Stripe Test Clocks successfully exercised the scheduled plan boundary and cancellation expiration. A provider-generated failed subscription invoice exercised `invoice.payment_failed`; payment recovery exercised `invoice.paid`. WriteOffs retained entitlements during `payment_issue`, set a configurable grace deadline, and cleared it after recovery.

## Webhooks

Configure `POST /api/stripe/webhook` for:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.paid`
- `invoice.payment_failed`

The endpoint verifies the Stripe signature before parsing. It stores event identity, rejects duplicates, rejects provider events older than the latest applied event, fetches current subscription state for non-deletion subscription updates, and applies the provider state transactionally. Unsafe failures return a retryable HTTP response. Logs must contain no full payload, card data, or provider secrets.

For local Stripe CLI testing, use the actual local app port:

```sh
stripe listen --forward-to http://127.0.0.1:3000/api/stripe/webhook
```

Place the temporary signing secret only in the effective ignored local environment file, then restart Next.js. `.env.development.local` takes precedence over `.env.local` for variables defined in both. Never source staging credentials or run this flow with a live key. Forward at least the six events listed above; unrelated forwarded events are acknowledged and ignored.

## Lifecycle behavior

- Upgrade: Stripe changes Expenses to Business immediately with invoice proration. Business access begins only after provider-confirmed webhook state.
- Downgrade: a Stripe Subscription Schedule keeps Business until current period end, then changes to Expenses. WriteOffs stores the customer-confirmed scheduled intent.
- Cancellation: `cancel_at_period_end`; paid capabilities remain until period end. It may be reversed before then. Cancellation supersedes and releases a pending downgrade; a downgrade cannot be scheduled while cancellation is pending.
- Failed renewal: Stripe retries payment; WriteOffs projects `payment_issue` and preserves capabilities through the configured grace deadline. Recovery restores `active`. Elapsed grace or paid access becomes `expired_read_only` through the service-only expiry RPC/scheduled maintenance invocation.
- Restart: an expired customer chooses a plan through Checkout. Historical records remain; new activity resumes after provider confirmation. No bulk historical reimport occurs.

Already accepted durable work may finish to a canonical terminal state after expiration so partial source evidence is not corrupted. New receipt, statement, CSV, Plaid, manual-money, mileage, invoice, contractor, deduction, OCR, and autonomous intake is denied. Historical reads, downloads, exports, security, billing, and deletion pathways remain available.

Stripe billing emails handle receipts and failed-payment notices at launch. WriteOffs supplies restrained in-app state. Disputes/chargebacks require operator review; never delete financial records in response.

Recommended production Billing configuration:

- Keep promotion codes disabled at launch unless a specific campaign requires them; discounts never affect entitlements.
- Decide whether to enable Stripe Tax before live Checkout. The existing Checkout flag is compatible with automatic tax, but test activation did not enable live tax collection.
- Let Stripe send receipts, failed-payment reminders, and payment-method notices. Avoid duplicate WriteOffs email until transactional messaging is deliberately implemented.
- Configure Stripe retries within the seven-day WriteOffs grace window. Product access remains during grace; Stripe retry timing must not extend an unpaid membership indefinitely beyond the canonical grace decision.

## Local and prelaunch grants

Grants are explicit, Business-owned, auditable, and service-only. They do not create fake Stripe IDs. After a local Supabase reset and user/Business setup:

```sh
set -a
source .env.local
set +a
npm run grant:membership -- BUSINESS_UUID business
```

The helper refuses non-local Supabase hosts. Use `expenses` to test that plan and optionally add an ISO expiration. There is no public grant endpoint.

## Production activation checklist

1. Create live WriteOffs Expenses and WriteOffs Business Products with monthly USD Prices only.
2. Set the live Price IDs; never reuse the test IDs.
3. Set `WRITEOFFS_STRIPE_MODE=live` and the live server secret only in Production.
4. Create the live webhook endpoint at `POST /api/stripe/webhook` and subscribe to the six canonical event types.
5. Set the live webhook signing secret independently of local/staging secrets.
6. Create a restricted live Customer Portal configuration and set its ID; disable plan switching and cancellation there.
7. Configure Stripe billing receipts, failed-payment reminders, and payment-method notices.
8. Configure retry/dunning behavior to complement the canonical grace period.
9. Decide whether Stripe Tax is required and configure Checkout deliberately.
10. Verify Production rejects test keys/Prices and non-Production rejects live mode.
11. Apply and verify the additive membership schema through the authorized deployment process.
12. Create and verify explicit grants for approved prelaunch Businesses before enabling enforcement.
13. Verify server-side entitlement enforcement and historical read-only access.
14. Perform an authorized low-risk live smoke test with a designated internal Business.
15. Monitor webhook application, duplicate/stale results, payment issues, grace expiry, and provider mismatches.
16. Verify cancellation retains access through period end and transitions to read-only afterward.

Never manually change a Stripe subscription plan, schedule, cancellation state, Customer mapping, or metadata without reconciling the WriteOffs projection. Rollback should disable new checkout/mutations while retaining membership reads and historical access; never roll back financial data or delete provider event evidence.

## Troubleshooting

- Checkout unavailable: verify test/live mode, both Price IDs, return origin, authenticated Business, and server key.
- Webhook retries: verify signature secret, Business metadata, Customer mapping, and configured Price mapping.
- Competing subscription: do not choose one implicitly. Cancel/reconcile the unintended Stripe subscription, confirm the canonical provider link, then replay the intended event.
- Customer/Business mismatch: verify Stripe Customer metadata and `membership_provider_links`; never move a Customer by email alone.
- Membership still processing: inspect safe event ID/type/result metadata and canonical membership history; do not paste full payloads into logs.
- Local user has no access: create an explicit local grant; legacy plan rows intentionally grant nothing.

Production decisions still required: final prices, Plaid Item limits after Production economics, Stripe Tax configuration, Portal settings, Stripe retry schedule, billing email copy, and chargeback operator policy.

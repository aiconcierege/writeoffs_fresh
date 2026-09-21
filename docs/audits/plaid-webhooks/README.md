# Plaid webhook setup certification — September 21, 2026

## Existing architecture and findings

- Public receiver: `POST https://writeoffs-fresh-staging.vercel.app/api/plaid/webhook`.
- New and update-mode Link requests already pass server-controlled `PLAID_WEBHOOK_URL` to Plaid. A real public staging Link token was inspected with `/link/token/get`: it contained exactly this public URL.
- Signature verification uses Plaid's ES256 verification key, a five-minute JWT age limit and a timing-safe comparison of the SHA-256 digest of the exact raw body. Missing signatures return 401. Expired verification keys are now rejected explicitly.
- Item lookup uses the provider Item ID **and environment**. Customers cannot supply a business identifier. Credentials remain encrypted/server-only. Customer Link/sync routes retain MFA and membership enforcement.
- Existing transaction ingestion uses Item leases, cursor validation, immutable source versions and unique source hashes. Canonical ingestion/reassessment is reused; no second importer was created.
- Before this change, NEW_ACCOUNTS_AVAILABLE only set `needs_attention`; update mode did not enable account selection. LOGIN_REPAIRED and USER_ACCOUNT_REVOKED had no specific handlers.
- Before this change, event insertion could succeed before a state write failed; ignored write errors and deduplication could lose the retry. Background `after()` sync also had no scheduled inbox recovery.

## Focused corrections

1. The existing webhook inbox and Item changes now commit in one service-only database function. The signed-delivery hash stays unique. Storage failures return 503 for retry, not success or malformed-request status.
2. `NEW_ACCOUNTS_AVAILABLE` sets a separate durable account-selection flag and a customer review prompt. It does **not** enqueue transaction sync. Ordinary sync cannot dismiss the prompt.
3. Existing Link update mode enables Account Select when that flag is present, retaining the same Item and credential. It uses the same supported checking/savings/credit-card filters as initial Link.
4. Completing update mode verifies authenticated ownership and provider access before clearing the prompt. It syncs only the newly authorized Item, avoiding an unrelated broken Item blocking completion.
5. Shared sync retains canonical autonomous-processing entitlement checks, including pending deletion, for both immediate and scheduled delivery.
6. Transactions notifications return promptly, with sync in `after()`. An event is completed only after successful sync; events arriving during sync remain pending. The existing scheduled processing route retries bounded pending deliveries through the same leased sync implementation. This does not add periodic transaction refresh for Items without pending notifications.
7. Logs contain fixed messages, internal Item IDs, flags and timing—not tokens, signatures, credentials or raw request bodies.

## Event behavior

| Event | Handling |
|---|---|
| ITEM / NEW_ACCOUNTS_AVAILABLE | Account-selection prompt; no transaction sync |
| TRANSACTIONS / SYNC_UPDATES_AVAILABLE | Durable pending delivery; leased cursor sync; completed after success |
| ITEM / ERROR | Existing error/reconnect state, with checked transactional persistence |
| ITEM / LOGIN_REPAIRED | Clears login-required error only; does not restore revoked consent or dismiss new-account prompt |
| ITEM / PENDING_DISCONNECT or PENDING_EXPIRATION | Connection needs attention/update mode |
| ITEM / USER_PERMISSION_REVOKED | Consent revoked; autonomous sync remains blocked |
| ITEM / USER_ACCOUNT_REVOKED | Connection needs attention; does not revoke unaffected accounts on the Item |
| Unrecognized/legacy notifications | Recorded and acknowledged; no speculative imports |

## Real public staging certification

A synthetic customer completed real MFA and real Plaid Link at `/settings/banking` using Plaid's documented Sandbox credentials. No real bank credentials or Rick's manual customer were used.

The initial `/sandbox/public_token/create` shortcut was unsuitable for this specific test: Plaid returned `SANDBOX_ACCOUNT_SELECT_V2_NOT_ENABLED`. The final test instead used an Item created through real Link Account Select.

- Synthetic real-Link Item record: `1e084a5a-72d1-40b7-9c0b-30126b8a1d14`.
- Provider `/item/get` confirmed the public staging receiver URL.
- `ITEM / NEW_ACCOUNTS_AVAILABLE`: `webhook_fired: true`; signed delivery recorded against that Item; `new_accounts_available=true`; `needs_attention`; no sync request or transaction import.
- `TRANSACTIONS / SYNC_UPDATES_AVAILABLE`: `webhook_fired: true`; delivery received and completed by existing canonical sync. Transaction version count remained **342 before/after repeated deliveries**.
- New-account prompt survived ordinary transaction sync.
- Receiver-handler measurements in captured logs: **198–219 ms** for new-account notifications; **238 ms** for a sync notification. These are handler measurements, not end-to-end network latency. Vercel's streaming function logs expose `responseStatusCode=-1`; they do not independently measure the final wire status. The successful receiver path returns HTTP 200 / `{"received":true}`, and durable database receipt plus logs confirm this path was reached.
- Exact safe Plaid responses: [sandbox-responses.json](sandbox-responses.json).
- Database receipt/sync observations: [receiver-observations.json](receiver-observations.json).
- Completing real update mode returned **HTTP 200** after the Item-specific completion correction; an unrelated broken test Item no longer blocks it.
- Real update-mode account selection: [screenshot](update-account-selection.png). Only supported account types appear.
- Two initial automated attempts to open update-mode Link timed out; a subsequent real walkthrough succeeded. This is not counted as a first-attempt browser reliability pass.

## Existing Item/configuration audit limitations

Nine pre-existing dedicated-staging Items were inventoried; all were Sandbox. Three could be inspected through Plaid with available local test credentials:

- `b1057929-32f9-4107-8b38-3bb278332dba`: correct staging webhook.
- `bc40db9c-9991-4de1-ab4d-f09adffaf521`: correct staging webhook.
- `b160d1e4-ef8e-4816-b1d1-76ea23876b15`: **empty webhook URL**.

Six other stored test Items could not be verified with the available local credentials. No existing Item was repaired or reconfigured. Real Production's runtime webhook configuration and Items were not accessed or certified. Code uses environment-specific `PLAID_WEBHOOK_URL`; this Sandbox result is not Production enablement approval.

Plaid's existing consent copy said financial data would help the customer invest and pay down debt. That dashboard use-case configuration does not match WriteOffs' bookkeeping purpose. It was **not changed** and should be corrected separately before Production approval.

## Validation

- Full tests: **1,779 passed**, 143 environment-gated skips; 244 passing files. Focused Plaid suite: **50 passed**, two local-integration skips, including the additional pending-deletion regression.
- Additional focused durable-recovery checks cover busy leases, failed sync retryability, safe logging and not completing notifications received during an in-flight sync.
- TypeScript: pass.
- Lint: zero errors; 16 pre-existing warnings.
- Optimized local webpack build and hosted Next.js/Turbopack build: pass.
- Production dependency audit: zero vulnerabilities. Full dependency audit: two existing moderate development-tool findings (Vitest / @vitest/mocker), no high or critical findings.
- Sanitized source secret scan: no leaks.
- Staging transaction/role tests: pass for Item/environment isolation, replay, account-selection durability, errors, login repair, revocation and service-only function access. Tests ran in a rolled-back transaction: [SQL](transaction-checks.sql).
- Existing source idempotency/cursor/immutable-transaction behavior is retained. Local Supabase ingestion tests remain environment-gated, not counted as live passes.

## Scope and deployment

Migration: `supabase/migrations/20261005000100_plaid_webhook_delivery.sql` (additive; dedicated staging only).

Final public staging deployment: `https://writeoffs-fresh-staging-51z0v8z6n-ricks-projects-3ba59ab5.vercel.app` (`dpl_E2wuWbSfZw2nTBFmPNGiq3dx6ELv`), promoted to `https://writeoffs-fresh-staging.vercel.app`.

Final Plaid request IDs: `badbf13a2a28eb8` (new accounts), `97c6728dc50ef8a` (sync); both returned `webhook_fired: true`.

No main/real Production changes, dependency changes, Rick-customer repairs or unapproved Betti assets were included. No new webhook endpoint or bookkeeping architecture was introduced.

The **Sandbox “Set up webhooks” test requirement is satisfied** by the successful real Plaid trigger and receiver processing. This does not certify Production configuration, fix every legacy Item URL, or approve the existing Plaid use-case disclosure.

## Official API references

- [Plaid Sandbox webhook trigger](https://plaid.com/docs/api/sandbox/#sandboxitemfire_webhook)
- [NEW_ACCOUNTS_AVAILABLE semantics](https://plaid.com/docs/api/items/#new_accounts_available)
- [Update mode with account selection](https://plaid.com/docs/link/update-mode/#using-update-mode-to-request-new-accounts)

## Changed implementation files

- `app/api/plaid/webhook/route.ts`
- `app/lib/plaid/webhooks.ts`
- `app/lib/plaid/webhook-verification.ts`
- `app/lib/plaid/client.ts`
- `app/lib/plaid/service.ts`
- `app/api/plaid/sync/route.ts`
- `app/api/internal/processing/drain/route.ts`
- `app/components/BankConnect.tsx`
- `supabase/migrations/20261005000100_plaid_webhook_delivery.sql`
- Plaid Link, webhook route, update completion, sync route and recovery regression tests.
- `scripts/certify-staging-plaid-webhooks.mjs` and this certification directory.

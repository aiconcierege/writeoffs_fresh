# WriteOffs Staging Operations

Status: production-shaped staging authority. Rehearsal date: 2026-08-25.

## Fresh-customer Phase 1 certification — 2026-09-15

Scope: `v2-onboarding-staging`, dedicated `writeoffs-fresh-staging` Vercel project,
Supabase `sgrqrrxrlglhjuetdtps`, Stripe Sandbox and Plaid Sandbox only. Production
and main are unchanged. The earlier Plaid and Check-in repairs remain in history.

### Audit and implementation

The audit found obsolete waitlist CTAs, an ambiguous successful-signup form, an
administrative MFA gate, the old $19/$29 Stripe catalog, and onboarding dependencies
on materials tax-treatment history and a weekly day. Business-start storage already
supported month precision. Mileage deductions existed canonically but were absent
from business expense/profit totals; Phase 1 connects that existing calculation to
the shared report projection. No vehicle election or meal-evidence rule changed.

The implemented product decisions are authoritative in
[WORKFLOW_SPECIFICATION.md](WORKFLOW_SPECIFICATION.md#phase-1-fresh-customer-experience).
One $39 monthly test Price and one $20 one-time historical-month Price were added;
old products and subscriptions were retained. Sandbox Checkout initially offered
Cash App/Klarna. New staging Checkout sessions use cards without changing
account-wide payment-method settings.

Migrations `20260915000200` through `20260915000700` add explicit setup completion,
consented/paid catch-up coverage, historical-mileage fact history, verified-session
read policies, legacy materials-history compatibility, and safe checkout retries.
Existing scope is grandfathered and completed customers stay complete. Old materials
and cadence facts are retained; no customer is silently repriced. Supabase CLI
commands stalled before execution; the staging management API applied the remaining
migrations. Rollback-only integration checks passed afterward.

### Certified behavior and artifacts

- Public signup replaces its form with email confirmation. Synthetic email verification
  was completed by the test operator through Auth administration; delivery and clicking
  a real inbox link were not claimed as automated proof. Real TOTP enrollment passed.
- The public-flow synthetic customer paid $39 in Stripe Sandbox, activated membership,
  selected January in September, explicitly agreed to seven paid months, and paid the
  separate $140 one-time charge. Current/prior-month quotes were free. A retry reused
  Checkout; changed months expired old payment pages without another payment.
- Consumer product fit, March 2022 business start, materials facts, welcome summary,
  optional receipts and removal of weekly-day setup passed. No historical tax-method
  choice was shown.
- First Platypus Link opened and connected four Sandbox accounts. Both account-use
  choices saved; incomplete selections blocked setup; completion reached Home.
- Historical mileage deferral persisted with no zero value. Returning and entering
  recorded test totals preserved history; missing vehicle facts stayed unresolved.
  Calculation tests cover rate periods, annual allocation, overlap and one-time inclusion.
- Small, empty/current and large historical queues were inspected. The Sandbox backlog
  grew from 52 to 72 questions during certification without becoming the headline.
  Ongoing questions lead the page; older meals remain unresolved in separate catch-up
  review. No answers were fabricated for Rick's manual customer.
- A separate fixture added a canonical question while Check-in was open. Three answers
  committed exactly once; double-click, stale retry, interrupted queue read, refresh,
  leave/return and deferral passed. Resolved questions did not return. Deferral produced
  a skipped event, not an answer or resolution, and does not increase the answered count.
- Existing ready/corrected/vehicle-review/read-only fixtures still downloaded Tax-Time
  PDFs and transaction/mileage exports. Pending-deletion downloads followed existing
  policy while mutations were rejected; the synthetic deletion was canceled immediately.
  Arbitrary Business ID requests were rejected.
- Layouts were inspected at 390, 430, 768 and 1280 pixels with overflow assertions.
  The final smoke test found a connected-account timestamp hydration mismatch;
  the display now hydrates deterministically before using the browser timezone,
  and certification rejects browser errors. Representative PNGs are in `/private/tmp/writeoffs-phase1-proof/` and the final
  signup/MFA/membership PNGs in `/private/tmp/writeoffs-phase1-proof-secondary/`.
  Share only PNG/PDF artifacts, never the private fixture or browser-session files.

Reproduction tools: `certify-fresh-customer-phase1.mjs`,
`certify-staging-check-in.mjs --phase1` (Node `--conditions=react-server --import tsx`),
`validate-phase1-staging.mjs` (rollback-only), and
`certify-tax-time-browser.mjs --phase1-regression`. These require explicitly selected
staging configuration and isolated fixture manifests.

Validation: full suite 1,240 passed / 143 environment-dependent skipped; TypeScript
passed; ESLint zero errors / 30 existing warnings; local production webpack build
and Vercel production Turbopack build passed; Gitleaks and whitespace checks passed.
Dependency audit retains two moderate development-test-tool findings in Vitest and
its mocker; no high/critical findings and zero runtime dependency vulnerabilities. No dependency upgrade was mixed into this phase.

Phase 2 still owns full bulk/grouped Transactions review, Reports visual refinement,
and the receipt/statement manual-test batch. Plaid launch administration remains
separate. This phase does not provide a complete historical bulk-review editor.

## Environment identity

The verified staging Supabase project is named `writeoffs-staging`, project reference `sgrqrrxrlglhjuetdtps`, hosted at `sgrqrrxrlglhjuetdtps.supabase.co` in `us-east-2`. Both public and server staging URLs resolve to that host, and the repository's Supabase link points to the same reference. This identifier is safe to record; credentials are not.

Staging is not production. It uses a dedicated Supabase project, Stripe TEST, Plaid Sandbox, non-production OCR credentials, unique worker/cron secrets, and an HTTPS staging origin. `WRITEOFFS_ENVIRONMENT=staging` is mandatory. Production Supabase, Stripe live, Plaid Production, and production webhook/service credentials are prohibited.

The signup proxy deliberately permits `/signup` only when the validated application environment is `staging` (or when the legacy local-development flag is explicitly enabled). `production` remains waitlist-only even if `NEXT_PUBLIC_ENABLE_SIGNUP` is accidentally set. Keep staging behind Deployment Protection while allowing invited testers to exercise the real Auth signup path.

The local `.env.staging.local` is an operator convenience file, not a Vercel deployment source. Never commit it. Next.js production/staging deployments receive variables from Vercel environment configuration.

## Configuration checklist

| Variable | Status | Staging rule |
| --- | --- | --- |
| `WRITEOFFS_ENVIRONMENT` | REQUIRED | `staging` |
| `WRITEOFFS_EXPECTED_SUPABASE_HOST` | REQUIRED | exact staging host |
| `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_URL` | REQUIRED | matching staging HTTPS project URLs |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | REQUIRED | staging publishable/anon credential |
| `SUPABASE_SERVICE_ROLE_KEY` | REQUIRED | staging-only, server-side |
| `NEXT_PUBLIC_BASE_URL` | REQUIRED | canonical staging HTTPS origin, no path |
| `MFA_ENFORCEMENT_MODE` | REQUIRED | `required` |
| `CRON_SECRET` | REQUIRED | staging-only random value, at least 32 characters |
| `BOOKKEEPING_WORKER_SECRET` | OPTIONAL | separate operator invocation credential if retained |
| `DOCUMENT_EXPENSIVE_PROCESSING_ENABLED` | REQUIRED | explicit `true` or emergency `false` |
| `GCV_API_KEY` | REQUIRED when processing is on | non-production project/key, server-side |
| receipt/OpenAI variables | OPTIONAL | required only when receipt understanding is enabled |
| `WRITEOFFS_STRIPE_MODE` | REQUIRED | `test` |
| `STRIPE_MEMBERSHIP_ENABLED` | REQUIRED | explicit; when true all test billing values below are required |
| Stripe secret/webhook/Price/Portal IDs | REQUIRED when Stripe is enabled | TEST objects only; server-side except no publishable key is currently needed |
| `PLAID_ENV` | REQUIRED | `sandbox` |
| `PLAID_PRODUCTION_ENABLED` | REQUIRED | `false` |
| `PLAID_SANDBOX_LINK_ENABLED` | REQUIRED | explicit; credentials required when true |
| Plaid client/secret/encryption/webhook | REQUIRED when Sandbox Link is enabled | staging-only; secret/encryption server-side |
| grace and connected-Item limits | REQUIRED | centralized staging values matching launch hypotheses |

Current local staging configuration is incomplete: Supabase host/credentials and a Plaid client identifier are present, but the explicit environment/host, HTTPS origin, mandatory MFA, Stripe TEST objects, Plaid server credentials/encryption/webhook, worker/cron secret, OCR key, processing switch, and membership limits are not fully configured. The strengthened environment validator now fails the staging build on these omissions.

## Vercel staging project

No Vercel CLI or `.vercel/project.json` linkage was present during rehearsal, so no staging deployment was performed. Before deployment:

1. Create or identify a Vercel Preview/Staging project that cannot resolve to the production domain.
2. Pin Node 22.x, use `npm ci` and `npm run build`, and configure at least the worker route's 60-second duration.
3. Configure the variables above in the staging scope and validate a build before exposing routes.
4. Protect the deployment with Vercel Deployment Protection. Add narrowly scoped provider bypasses for Stripe TEST webhook, Plaid Sandbox webhook, and Vercel cron; do not disable protection globally.
5. Configure the one-minute `/api/internal/processing/drain` cron with bearer `CRON_SECRET` and alert on missed drains.
6. Configure Vercel Firewall rate rules for Auth and billing request bursts plus cost-sensitive endpoints. Test normal bulk uploads separately from automated request abuse.

## Supabase and test users

Enable TOTP, exact staging Site/redirect URLs, recovery callback, and staging SMTP. Use synthetic addresses only. Create staging users through Auth administration or normal signup; do not commit passwords. Each user receives a separate auto-created Business.

Create plan access through `npm run grant:membership -- --business-id <staging-business-id> --plan expenses|business --reason "Staging rehearsal"`. The script must be run with staging server credentials in a controlled operator environment. Grants are Business-owned and must not fabricate Stripe identifiers. Create expired/no-membership fixtures through approved lifecycle fixtures, not by editing canonical tables.

Remote Auth tests must be paced and sequential. The first rehearsal launched many local-oriented suites in parallel and hit the staging Auth rate limiter. Production-shaped staging E2E should reuse a small set of fixtures or create users serially, then remove them.

### Reusable UX test customer

After a reset, Codex can populate the designated customer with the deterministic six-month realtor scenario by running `npm run staging:fixture:realtor` from a controlled staging operator environment. The command requires the explicit staging marker, exact designated-user allowlist, exact staging Supabase host, server credentials, and password. It rejects local/production hosts, non-designated users, and any Business that already has financial transactions.

The fixture uses canonical CSV ingestion and append-only decisions, real factual review issues, private synthetic receipt objects and receipt-only records, mileage and invoice RPCs, and the normal weekly-review cadence. It creates no fake receipt-to-bank matches, Home counters, Stripe objects, or UI-only states. Reset the designated customer before rerunning it.

Codex can verify the populated customer with `npm run staging:fixture:realtor:report`. That read-only command signs in as the designated customer and runs the same current-record financial-summary, potential-writeoff, and question selectors used by the application; it also fails unless RLS exposes exactly one Business.

For cadence-independent weekly-review QA, Codex may run the operator-only `npm run staging:review:open -- --email <designated-email> --as-of YYYY-MM-DD --confirm-open`. The date must be today through seven days ahead. The utility resolves the Business only from the exact `WRITEOFFS_STAGING_TEST_USERS` Auth identity, requires its `staging_test_user` marker, hard-checks the dedicated staging Supabase hostname, and invokes the existing canonical weekly-review worker scoped to that one Business. It accepts no Business ID, exposes no HTTP route, is absent from customer UI, cannot run outside `WRITEOFFS_ENVIRONMENT=staging`, and verifies that existing immutable review events remain unchanged. Repeating it for the same cadence date is safe: the worker reuses the deterministic period identity rather than creating a duplicate.

The reusable-customer utility is operator-only; there is no HTTP route or customer UI. Configure an exact, comma-separated allowlist in `WRITEOFFS_STAGING_TEST_USERS`. Optional ordinary-UX MFA bypass additionally requires `WRITEOFFS_STAGING_MFA_BYPASS_ENABLED=true`. Both controls are ignored by application policy unless `WRITEOFFS_ENVIRONMENT=staging`, and environment validation rejects them outside staging. The bypass does not forge or alter Supabase AAL: it is a centralized prerequisite-policy exception for the exact authenticated staging email. Turn it off to run the real MFA enrollment/challenge journey; normal staging users always retain mandatory MFA.

Canonical data is deliberately append-only and extensively protected by `ON DELETE RESTRICT`. A reset therefore does not partially purge tables. It archives the entire old Auth/Business aggregate, including onboarding and business facts; financial accounts and source observations; transactions and canonical bookkeeping decisions/history; receipts, documents, imports and processing jobs; invoices, mileage and contractors; questions and answers; review cadence, periods, snapshots, items and events; deduction/tax records; membership/grant/provider/event history; and tenant-owned Storage paths. The archived Business loses no evidence and is no longer owned by the newly provisioned identity.

If the archived Business has a Stripe membership, the utility first cancels its Stripe TEST subscription. It retains the TEST Customer and canonical provider/event history for auditability. Late signed webhooks still resolve only to the archived Business. The old Auth email is moved to a unique invalid staging archive address, then a new email-confirmed Auth user is created with the designated reusable email. The normal signup trigger creates a genuinely empty Business. No production Stripe object is accepted, no canonical row is deleted, and no service-role credential reaches a browser.

Run from a controlled operator shell loaded with the complete staging server environment. Supply the new password without placing it in shell history, for example:

```sh
read -s WRITEOFFS_STAGING_TEST_PASSWORD
export WRITEOFFS_STAGING_TEST_PASSWORD
npm run staging:test-user:reset -- --email ux-tester@example.test --confirm-reset
unset WRITEOFFS_STAGING_TEST_PASSWORD
```

Before confirming, verify `WRITEOFFS_ENVIRONMENT=staging`, `WRITEOFFS_EXPECTED_SUPABASE_HOST` names the dedicated staging project, Stripe mode is `test`, and the email is present exactly in `WRITEOFFS_STAGING_TEST_USERS`. Then log in with the new password. With bypass enabled the sequence begins at Membership, followed by onboarding, Get Started and Home. With bypass disabled it begins at real MFA enrollment, then follows the same sequence. Real signup and confirmation email testing remains available through `/signup` using a separate synthetic address.

This archive strategy intentionally trades a small amount of staging-only retained data for canonical safety. Periodically inventory archived synthetic tenants and Stripe TEST Customers; any eventual purge must be a separately reviewed retention operation, not an extension of this reset command.

## Stripe TEST and Plaid Sandbox

Stripe staging requires canonical TEST monthly Prices, a restricted TEST Portal configuration, a staging HTTPS signed webhook, and webhook event subscriptions from the membership runbook. Checkout is enabled only after a signed staging event is observed and invalid signatures are rejected. Deployment Protection must permit only the webhook path/provider mechanism.

Plaid remains Sandbox. Link, exchange, sync, update/reconnect, Item limit and signed webhook behavior must be exercised after the HTTPS staging deployment exists. Do not configure Production credentials. Statements/CSV remain valid alternatives.

## Processing, OCR, and circuit breaker

Use synthetic native-text and scanned statements and synthetic receipts. Verify native text avoids OCR, OCR chunks persist/reuse, duplicate bytes do not re-extract, and browser departure does not interrupt work. To rehearse the circuit breaker, set `DOCUMENT_EXPENSIVE_PROCESSING_ENABLED=false`, confirm intake/queued jobs persist and drains report paused expensive work, then restore `true` and observe completion.

## WAF, monitoring, and alerts

Configure staging dashboards in Vercel, Supabase, Stripe, Plaid, and the OCR provider. Logs alone are not alerts. Active destinations must cover application 5xx, signed-webhook failures, no successful drain for five minutes, oldest queue age over fifteen minutes, dead-letter increases, stuck leases, and provider failure/cost spikes. No destination was configured in this rehearsal because no Vercel staging project was linked.

WAF rules should limit request bursts—not receipt counts—on login, signup, recovery, Checkout/Portal, receipt/statement intake, and Plaid Link token creation. Exclude valid Stripe/Plaid webhooks and cron by narrow verified routes/mechanisms. Validate ordinary login and large chunked intake after publishing staging-only rules.

## Backup, restore, and Storage

Supabase reported completed daily physical staging backups, WAL backup enabled, PITR disabled. The latest verified checkpoint preceded the migration run. This proves a backup artifact exists, not that it can be restored correctly.

A complete rehearsal requires a separate temporary Supabase rehearsal project/database. Restore the staging artifact there, then verify migrations, two-tenant RLS, membership state, current canonical totals, queue state, and document metadata. Supabase's physical restore command targets a project and was intentionally not run against active staging.

Database backup does not prove private Storage recovery. Inventory private bucket objects and metadata, copy encrypted evidence to an approved recovery destination or use supported provider backup tooling, restore into the rehearsal environment, and verify owner-scoped DB paths reconnect. Detect missing/orphaned objects without deleting them. Until both exercises pass, backup/restore proof remains incomplete and is P0 for paid production.

## Smoke, browser, and security checks

After deployment run the canonical staging checks: landing/login/recovery; mandatory MFA enrollment/challenge/removal; Home/Transactions/Reports/Settings/Security/Billing; Expenses/Business/read-only boundaries; receipt/statement/CSV/manual spend; Business income/invoice; mileage/contractors; 2025/2026/unsupported-2027 readiness; Stripe TEST webhook/Checkout; Plaid Sandbox; and worker drain.

At 390px repeat login/MFA, Home, statement history/upload, Billing, and read-only mode. Check focus visibility, labels, keyboard operation, touch targets, wrapping, and horizontal overflow.

Verify deployed CSP, frame denial, MIME protection, referrer and permissions headers; unauthenticated private Storage access; cross-tenant signed/object access; unauthenticated and wrong-secret worker rejection; correct cron success; secure cookies/logout/proxy refresh; and absence of server secrets in browser bundles/network.

Record acceptance latency for Home, Transactions, Reports, receipt intake, and statement intake. Use synthetic scale for current-record pagination without invoking expensive OCR. Investigate timeouts and missing indexes, but do not broadly optimize healthy queries.

## Rollback

Application rollback redeploys the previous tested commit. The new migrations are additive/history-preserving and normally remain; do not attempt destructive DOWN migrations after staging writes. Disable new provider entry points or expensive processing first when necessary, preserve signed webhook idempotency, and forward-fix schema defects. The actual Vercel rollback could not be rehearsed without a linked deployment.

## Tax-Time Report certification — 2026-09-14

The dedicated application target is `writeoffs-fresh-staging` (`prj_o56739F1pzd0TjFirEYoLMaa6oIJ`), at `https://writeoffs-fresh-staging.vercel.app`. Its Vercel primary deployment slot is named Production by Vercel; it is the **dedicated staging application**, separate from the WriteOffs production project. This certification did not deploy to or change the production project. Source deployment uses the staging project's existing server-side environment. No environment-secret export is needed.

The Tax-Time Report consumes the canonical annual report, current decision-linked Schedule C assessments, and vehicle read models. The PDF is generated on demand, streamed with `private, no-store`, and never written to public Storage. Existing transaction and mileage exports remain available. Canonical workflow authority is section 11 of `WORKFLOW_SPECIFICATION.md`.

### Reproducible proof tools

Run with the existing local **staging-only** credentials. Each database tool hard-checks `WRITEOFFS_ENVIRONMENT=staging` and the exact staging Supabase hostname before accessing data.

- `scripts/validate-staging-tax-time.ts`: creates isolated general-business synthetic tenants for ready, asset review, missing facts, correction, and read-only cases. Uses canonical ingestion/decisions/processing and compares annual totals, category totals, vehicle read models, exports, and RLS. Claims only jobs belonging to tenants created in that invocation; never globally drains the staging queue.
- The same tool with `--new-blocker` creates a fresh missing-facts case without resetting the earlier tenant. The browser tool’s `--resolve-blocker` option answers that fixture’s real Betti question and verifies automatic readiness.
- The same tool with `--extend` adds an asset-plus-leased-vehicle fixture, verifies two genuine review items, and preserves the corrected fixture.
- The same tool with `--delete-proof` creates one new synthetic tenant, proves report availability, then completes the existing canonical deletion process for **only that new tenant** and verifies report access fails. It does not change retention rules or claim other deletion requests.
- `scripts/certify-tax-time-browser.mjs`: uses real MFA on the synthetic identities; checks Reports, Check-in routing, PDF downloads at 1280px and 390px, detailed transaction/mileage exports, repeated generation, arbitrary Business ID rejection, and private response headers. It schedules and immediately cancels deletion on its synthetic grant-only tenant to prove retained downloads and blocked mutations. Cleanup is limited to MFA factors created by this proof on verified synthetic identities.
- `scripts/render-tax-time-proof.ts`: writes one-page and multi-page representative PDFs and rasterized page previews for visual inspection. Text remains selectable in the PDF; the raster previews are QA artifacts only.

Example invocation: `WRITEOFFS_ENVIRONMENT=staging node --env-file=.env.staging.local --conditions=react-server --import tsx scripts/validate-staging-tax-time.ts`. Run the browser tool with `node --env-file=.env.staging.local` and the same explicit staging marker. Run the rendering tool with `node --import tsx`.

Proof output is local under `/private/tmp/writeoffs-tax-time-proof/`. The synthetic fixture credential file is mode 0600 and must not be committed or published. User B and existing staging financial data are preserved. Partial fixture attempts remain isolated synthetic tenants; no existing customer is reset.

### Results and limits

Live checks passed for ready/no-review, asset and vehicle review without blocking readiness, missing-fact Check-in routing, corrected purchase removing its former flag, historical read-only access, pending-deletion download/mutation boundaries, permanent-deletion access denial, tenant isolation, annual/category/vehicle reconciliation, repeated PDFs, and both secondary exports. Representative PDF pages were rendered and visually inspected; automated PDF extraction checks searchable text, Letter dimensions, clipping bounds, long names, multiple pages, zero/negative values, and absent empty sections.

Desktop/mobile browser proof uses Chromium at desktop and phone viewport sizes; it is not a physical iPhone/Android device certification. The full default unit suite passes; database suites gated on local integration credentials are skipped, with the dedicated staging proof providing the live checks above. Lint retains existing source warnings. The default local Turbopack build encounters the environment's process/port restriction; the local webpack build and remote staging Turbopack build pass.

Final validation: 1,174 automated tests passed; 143 environment-gated integration tests skipped. Typecheck passed. Lint: zero errors and 30 existing warnings. The live Check-in answer-to-ready transition passed after fixing answer-time completion of an empty supported category. The final application build was deployed successfully to the dedicated staging alias above. No production deployment, remote Git push, or merge was performed.

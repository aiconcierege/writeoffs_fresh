# WriteOffs Production Security and Operations

Status: internal production-operations authority. Last reviewed: 2026-08-25.

Framework security gate: `NEXT SECURITY GATE CLEAR`. The official August 25, 2026 release identifies 16.3.3 (installed) as the Active LTS fix for the announced critical issues. Recheck official advisories immediately before every production release.

This guide describes how to operate WriteOffs safely. It does not authorize a deployment, remote migration, live Stripe activation, or Plaid Production activation.

## Environment model and secrets

| Environment | Supabase | Stripe | Plaid | Intended use |
| --- | --- | --- | --- | --- |
| Local | local project | test mode or disabled | Sandbox or disabled | development and synthetic QA |
| Staging | dedicated staging project | test mode | Sandbox | production-shaped validation |
| Production | dedicated production project | live only when enabled | Production only after approval; otherwise disabled | customers |

`WRITEOFFS_ENVIRONMENT` is authoritative. Remote environments bind both Supabase URLs to `WRITEOFFS_EXPECTED_SUPABASE_HOST`. Production requires an HTTPS `NEXT_PUBLIC_BASE_URL`, `MFA_ENFORCEMENT_MODE=required`, explicit Stripe/Plaid enabled states, an explicit expensive-processing state, and a strong `CRON_SECRET`. The application fails its configuration check on dangerous mode or host mismatches.

Next.js loads variables in this order: process environment, `.env.$NODE_ENV.local`, `.env.local` (except test), `.env.$NODE_ENV`, then `.env`. WriteOffs uses `.env.local` for ordinary local values. A developer who also uses `.env.development.local` must remember that it wins. Staging and production secrets belong in Vercel environment configuration, not committed env files. `.env.staging.local` is local operator configuration, not a production secret source.

Never use `NEXT_PUBLIC_` for service-role, Stripe secret/webhook, Plaid secret/token encryption, OCR/provider, cron, or worker credentials. Do not print secret values during validation. Rotate a credential after suspected exposure and follow the incident runbook.

### Production configuration groups

- Identity: `WRITEOFFS_ENVIRONMENT=production`, `WRITEOFFS_EXPECTED_SUPABASE_HOST`, `NEXT_PUBLIC_BASE_URL`.
- Supabase: public URL/anon key plus server-only URL/service-role key.
- Authentication: `MFA_ENFORCEMENT_MODE=required`.
- Processing: a random `CRON_SECRET` of at least 32 characters; `DOCUMENT_EXPENSIVE_PROCESSING_ENABLED=true|false`; OCR/provider keys only when enabled.
- Stripe: `STRIPE_MEMBERSHIP_ENABLED`; when true, live mode, live secret, webhook secret, both monthly Price IDs, and restricted Portal configuration.
- Plaid: `PLAID_PRODUCTION_ENABLED`; when true only after approval, Production environment, credentials, token-encryption key, and HTTPS webhook. Sandbox Link must be off in production.

## Vercel project requirements

- Pin Node.js 22. `package.json` uses `22.x`; do not let a broad minimum silently select a later major.
- Build with `npm ci` and `npm run build`. Do not source local or staging files in production.
- Keep Route Handlers on the Node runtime where declared. Preserve Stripe's raw request body before signature verification.
- Configure the canonical production domain to match `NEXT_PUBLIC_BASE_URL` exactly.
- Configure the cron in `vercel.json`. Vercel calls `/api/internal/processing/drain` once per minute with `Authorization: Bearer <CRON_SECRET>`.
- Keep function duration at or above the route's 60-second `maxDuration`. The worker bounds its claims and is safe to invoke again; Vercel cron does not retry failed invocations, so alerting is required.
- Configure deployment protection so provider webhooks and the authenticated cron remain reachable where appropriate; never exempt the entire application.
- Configure Vercel Firewall rate rules before public launch. Use IP-oriented limits for login/signup/recovery and Checkout/Portal session creation. For authenticated upload and Link-token routes, combine edge protection with user/Business observability; do not impose low receipt or statement quotas.

## Production access control

Use separate named operator accounts, least privilege, and provider MFA. Roles are responsibilities rather than shared credentials:

- Deployment operator: Vercel releases and rollback; no routine database data access.
- Database/security operator: Supabase migrations, RLS review, Auth recovery; service-role use only through controlled server operations.
- Billing operator: Stripe configuration and mismatch investigation; no raw customer card data.
- Financial-source operator: Plaid configuration and Item troubleshooting after approval.
- Incident lead: containment, evidence log, communication decision, and follow-up.

Require MFA for Vercel, Supabase, Stripe, Plaid, source control, domain/DNS, and OCR/provider consoles wherever supported. Review access monthly and remove departed or unnecessary users immediately.

## Authentication and mandatory MFA rollout

Production Supabase must enable TOTP enrollment/challenge and configure the exact production Site URL, allowed redirect URLs, recovery URL, secure SMTP, and Auth rate limits. Roll out in this order:

1. Verify enrollment, six-digit verification, AAL2 challenge, factor removal, recovery, and session refresh in staging.
2. Deploy routes and Security settings with `enrolled` behavior if existing accounts need an enrollment window.
3. Communicate the enforcement date and require enrollment during authenticated use.
4. Set production `MFA_ENFORCEMENT_MODE=required` only after the enrollment route and support process are verified.
5. Confirm unenrolled customers reach `/settings/security?enroll=required`, enrolled AAL1 sessions reach `/mfa/challenge`, and neither path loops.

Factor removal requires AAL2. Password recovery does not remove MFA. There is no email-based bypass or knowledge-question recovery.

### Lost authenticator

Support must verify identity using the approved, separately reviewed procedure and record the case. An authorized Supabase Auth operator may remove only the affected verified TOTP factor using provider administrative tooling. The operator must not request or receive a password, one-time code, TOTP secret, token, or service key. Revoke active sessions, require password recovery when compromise is suspected, require immediate TOTP re-enrollment, and record factor-reset/re-enrollment evidence without secrets. Ambiguous identity becomes a security incident; no factor is reset.

## Supabase production gate

- Use a dedicated production project with RLS enabled and tested on every Business-owned table/view.
- Keep service-role clients server-only. Never use service role as a fallback for an authenticated customer request.
- Keep receipt/statement buckets private and access them through owner checks or short-lived signed access.
- Configure Auth redirect allowlists narrowly, TOTP, SMTP, and rate limits.
- Confirm plan capacity, database connections, Storage limits, log retention, daily backup availability, and PITR. Provider plan capabilities must be checked in the dashboard; this repository cannot prove they are enabled.
- Enable PITR when the chosen plan and RPO require it.
- Monitor database/storage growth, connection pressure, query latency, and RLS errors.

## Migration inventory and rollout

Never assume remote migration state. Compare `supabase migration list` against the target under an approved, read-only production change window. The recent dependency chain is:

| Migration | Character | Runtime dependency / rollback |
| --- | --- | --- |
| `20260824000500_add_deduction_intelligence_foundation.sql` | additive tables/views/policies | required before deduction code; application rollback can leave schema |
| `20260824000600_add_contractor_awareness.sql` | additive | required before contractor code; leave schema on app rollback |
| `20260825000100_add_durable_document_processing.sql` | additive queue/document model and functions | required before bulk intake/worker; forward-fix preferred after writes |
| `20260825000200_add_statement_intelligence.sql` | additive | required before statement ingestion; leave schema on app rollback |
| `20260825000300_add_statement_ocr_account_links.sql` | additive OCR/link history | required before OCR/link code; preserve history |
| `20260825000400_add_canonical_memberships.sql` | additive membership authority/RLS/functions | must precede entitlement enforcement; forward-fix after provider events |
| `20260825000500_correct_2026_contractor_awareness.sql` | bounded data/config correction | apply after contractor foundation; verify affected catalog rows |

If the target is missing older migrations, apply the entire ordered chain from its last known migration rather than cherry-picking this table. Review locks and transactions in each SQL file, snapshot/backup first, test the identical sequence on staging, and stop on any checksum/state discrepancy. There are no safe general-purpose DOWN migrations: additive schema may remain if application code rolls back; data-bearing/event migrations are normally forward-fixed.

Safe production order: verify backup and restore checkpoint; set non-exposing environment identity; apply and verify migrations; create approved prelaunch membership grants; deploy with expensive processing/Stripe/Plaid disabled; smoke-test Auth, membership reads, RLS, and history; enable and observe cron; configure and prove Stripe webhook/Portal; enable Checkout only after webhook synchronization; activate Plaid separately only after approval and Production tests; perform synthetic smoke tests; hold a rollback observation window.

## Durable processing and emergency cost control

The authenticated cron drains bounded document (8), bookkeeping (12), and receipt-understanding (3) batches. Database claims, leases, retries, terminal states, fingerprinting, extraction reuse, and idempotency make overlapping/repeated invocations safe. Processing never depends on a browser.

Set `DOCUMENT_EXPENSIVE_PROCESSING_ENABLED=false` to pause new OCR/document and receipt-understanding claims during an outage, bug, or cost spike. Intake remains stored and queued; deterministic bookkeeping processing continues; no job is deleted. Deploy the setting, verify the drain response reports `expensiveProcessingEnabled:false`, investigate, then restore `true`. This is an emergency operational switch, not a customer quota.

Launch investigation thresholds (operational guidance, tune after observed traffic):

- urgent: cron produces no successful drain for 5 minutes, processing leases are stuck for 15 minutes, or queue age rises continuously across three runs;
- prompt investigation: oldest queued document over 15 minutes, retryable failures over 10 or over 10% of a batch, any dead-letter count increase, or max attempts reaches the configured cap;
- provider incident: OCR/provider failure category exceeds 20% for 10 minutes;
- normal customer attention: an individual unreadable document is not an operational page.

Recovery: pause expensive processing if failures can multiply cost; confirm cron/auth/database/provider health; use queue health and bounded job identifiers; let expired leases be reclaimed; retry only jobs whose error category is retryable; preserve extraction artifacts and idempotency keys; never edit canonical financial rows by hand; record dead-letter reason and operator action; resume gradually and watch age/error trends.

## Abuse, upload, and cost controls

Existing controls include authenticated Business ownership, membership entitlements, private storage, deterministic MIME/magic validation, 20 MiB receipt and 100 MiB/500-page statement bounds, 25-page statement chunks, smaller OCR chunks, cryptographic fingerprints, exact duplicate suppression, extraction reuse, bounded claims/concurrency, provider timeout, and retry/dead-letter caps. No monthly receipt/statement/OCR quota exists.

Before public launch configure distributed Vercel WAF rules for public Auth pages and billing session endpoints. Supabase Auth has provider-side email/OTP limits; confirm their production values and CAPTCHA decision. Protect authenticated cost endpoints against automated request rates at the edge while preserving large, chunked legitimate uploads. Alert on queue depth, OCR calls/cost, Plaid Items, Storage/database growth, and provider spend. Process-local counters are not sufficient for serverless rate limiting.

Upload checks must remain fail closed: supported type, size, content signature, private path, Business ownership, sanitized object identity, and bounded provider processing. Never serve uploads as executable/public content. Do not aggressively delete an orphan until database history and source-evidence retention have been reconciled.

## Provider outage behavior

- Supabase: fail authenticated and mutation requests safely; never fall back to service role or another project.
- Stripe: no membership is granted from redirects; webhook failures return retryable non-2xx and current canonical membership remains authoritative.
- Plaid: keep the Item/source facts, show safe reconnect/delayed states, and retry sync idempotently; statements/CSV remain available.
- OCR: keep files/jobs durable; retry bounded failures, use the emergency pause, and surface processing/needs-help states.
- Vercel cron: queued work remains durable; restore invocation and allow leases/retries to recover.

## Stripe production activation

Real test-mode lifecycle is validated; live mode is not activated. Follow `STRIPE_MEMBERSHIP_OPERATIONS.md`. Create live monthly Products/Prices, configure the live secret and signing secret, restrict Customer Portal plan/cancellation changes, configure billing emails and retries, reconcile the seven-day product grace, decide Stripe Tax with qualified tax/legal advice, apply membership schema/grants first, prove webhooks, then expose Checkout. A webhook/membership mismatch fails closed and is investigated; never grant via browser redirect or email identity.

Promotion codes should remain disabled at launch for simplicity. Stripe Tax should remain unactivated until nexus/product-taxability and registrations are professionally reviewed; keep Checkout architecture compatible. Stripe should handle receipts and payment-retry messages; WriteOffs supplies restrained in-app status.

## Plaid production boundary

Sandbox validates Link, token exchange, Item/account ownership, sync cursor/pagination, canonical idempotency, modifications/removals, reconnect states, and membership Item limits. Production is externally blocked pending Plaid approval, profile/security review, credentials, production webhook, and institution tests. Before activation implement/verify Plaid webhook JWT verification (recommended by Plaid), then test a real institution: Link/OAuth, accounts, initial/historical sync, cursor restart, webhook delivery, updates/removals, duplicate suppression, update mode, institution outage, disconnect/reconnect, and limits. Access tokens stay encrypted/server-side and never enter logs or clients.

If approval is delayed, WriteOffs can stage or launch a non-Plaid model using statements, CSV, receipts, manual money, mileage, and Business invoices, subject to explicit product/commercial approval.

## Backups, restore, and disaster recovery

Required before production: verify the Supabase plan's database backup schedule and retention, choose PITR based on RPO, document Storage backup/retention separately, preserve source and infrastructure configuration in version control/provider consoles, and export an encrypted configuration inventory without values.

Initial launch recommendation: RPO at most 24 hours with daily verified backups (lower through PITR when affordable); RTO one business day for a regional/provider incident, with authentication and read-only historical access restored before autonomous processing. This is a target, not a current guarantee.

Quarterly restore exercise: restore a recent backup into an isolated nonproduction project; verify schema/migration checksums, two synthetic tenants and RLS, membership current state/history, canonical current records and totals, receipt/statement database-to-private-object linkage, queue/job consistency, and exports. Record duration, gaps, and cleanup. Never overwrite production to test restoration.

## Logging, monitoring, and alerting

Logs may contain bounded request/job/event/Business identifiers and error categories. They must not contain secrets, tokens, passwords, MFA data, full account numbers, raw provider payloads, full statement/receipt text, or signed URLs. Membership events, factor-provider evidence, account-link corrections, grants, and processing histories provide bounded auditability.

Minimum dashboards: 5xx and latency, Auth failures, Stripe webhook failures/staleness, Plaid webhook/sync errors, queue age/dead letters/stuck leases, OCR/provider errors, database/storage errors, and growth/cost. Use Vercel/Supabase/Stripe/Plaid/provider-native monitoring first.

Page an operator for sustained outage, suspected tenant crossover, database unavailability, webhook failure spike, or a fully stalled queue. Ticket nonurgent individual unreadable documents, isolated payment issues, and one-off provider retries. Review queues/providers weekly, dependencies/access/backups/cost monthly, and restore/RLS/runbooks quarterly.

## Support and account security

Support may guide customer actions, inspect bounded status/history, retry eligible durable jobs through approved functions, and escalate provider mismatches. Support must never request passwords, MFA codes/secrets, bank tokens, card data, or edit canonical financial tables. Lost MFA and suspected takeover follow the security process; duplicate-financial-activity reports preserve evidence and go to engineering review.

On suspected account takeover: preserve evidence, revoke sessions, require password recovery, reset a factor only after verified identity, review recent security/account-link/membership changes, pause affected external integrations when justified, rotate provider tokens if exposure is credible, notify the customer according to the incident plan, and require MFA re-enrollment.

Membership expiration is not deletion. The repository has no complete self-service deletion workflow. Before public launch, approve retention/deletion policy with privacy/legal review and implement or operationalize a reauthenticated request that cancels billing, disconnects providers, applies a documented delay/hold, preserves legally required security evidence, and deletes/anonymizes scoped data and private objects. Until then, support records requests but must not manually hard-delete canonical rows.

## Production smoke test and change management

Every meaningful release: reviewed change and migrations; local/full tests; production-shaped staging; backup checkpoint; deploy; then synthetic smoke tests for landing/login, MFA enrollment/challenge, Home, Transactions, Reports, Settings/Security, membership/Billing, one controlled receipt and statement/CSV, worker drain/queue completion, Stripe webhook health, and—only after authorization—Plaid. Confirm mobile navigation and no tenant crossover. Observe before proceeding or roll back application code; normally leave additive schema and forward-fix.

Production is never a development database. Never reset it, point local defaults at it, create destructive fixtures, use real customer files in tests, or run ad hoc canonical-table edits.

## Recurring checklist

- Weekly: 5xx/provider errors, Stripe/Plaid webhook failures, queue age/dead letters, unusual cost, support security cases.
- Monthly: `npm audit`, official Next.js advisories, provider/admin access, MFA coverage, backup/PITR status, Storage/database growth, WAF/rate rules, grants.
- Quarterly: isolated restore, RLS/tenant suite, incident exercise, runbook/contacts, dependency major-version planning.
- Annually: new tax-year catalog/source review; 2025 and 2026 are supported, 2027 fails closed. Recheck final 2026 Schedule C instructions before form-level filing-season claims.

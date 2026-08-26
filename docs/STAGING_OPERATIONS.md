# WriteOffs Staging Operations

Status: production-shaped staging authority. Rehearsal date: 2026-08-25.

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

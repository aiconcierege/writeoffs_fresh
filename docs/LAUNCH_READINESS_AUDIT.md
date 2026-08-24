# WriteOffs Launch Readiness Audit

Status: repository audit completed 2026-08-24. This document assesses launch readiness; it does not replace canonical product, bookkeeping, tax, security, or legal specifications.

## A. Executive summary

WriteOffs is **not yet ready for a paid public launch**, but its core architecture is substantially stronger than a typical pre-launch bookkeeping product. The repository has a coherent Business-scoped canonical bookkeeping model, immutable source observations, append-only decisions and corrections, current-record resolution across receipt convergence, manual activity, and compound reconciliation, conservative tax treatment, extensive PostgreSQL integration coverage, and a polished authenticated shell. Authentication, TOTP MFA, recovery, and representative RLS protections are implemented and recently validated in a real local browser journey.

The remaining launch work is concentrated rather than foundational:

1. the existing Stripe code does not implement membership state, entitlement enforcement, cancellation, failed-payment handling, or read-only historical access;
2. durable queues exist, but no production scheduler/runner is configured, and canonical receipt extraction still depends on a browser keepalive request;
3. the approved tax catalog supports federal tax year 2025 only, so a 2026 launch cannot describe 2026 deductions or readiness as complete;
4. Plaid is correctly Sandbox-only and Production access remains an external dependency;
5. several canonical read paths are correct at ordinary volume but use unbounded event loading or apply limits before current-record suppression, creating completeness and scaling risks;
6. launch operations still need monitoring, recovery, rate/cost controls, support/account-closure procedures, and a small real-browser critical-journey suite.

The right launch path is to finish operational execution, subscription entitlements, current-year tax rules, and production verification around the architecture already present. The canonical bookkeeping model should not be rebuilt.

## B. Launch readiness scorecard

| Area | Status | Evidence and launch consequence |
| --- | --- | --- |
| Public shell, legal routes, canonical navigation | READY | Public/authenticated shells and compatibility redirects are tested; key workflows are discoverable from Home, Reports, Settings, or transaction context. |
| Authentication, recovery, TOTP MFA | READY | Supabase Auth is authoritative; enrollment, QR/manual secret, verification, AAL2 challenge, sign-out/sign-in, and removal have been browser-validated. Mandatory launch enforcement still needs configuration and an operational recovery policy. |
| Tenant isolation and service-role boundary | READY | Representative RLS/integration tests cover major canonical domains; service-role usage is server-only and protected internal routes use a worker secret. Continue expanding adversarial coverage as new tables are added. |
| Canonical bookkeeping and convergence | READY | Immutable financial sources, append-only decisions/corrections, receipt convergence, manual-source current leaves, and compound reconciliation share current-record semantics and exact-cent tests. |
| CSV/manual/mileage/invoice/contractor/deduction verticals | READY | Bounded canonical implementations and focused local PostgreSQL tests exist. Some UI and browser coverage remains P1/P2. |
| Receipt customer flow | NEEDS WORK | Upload is zero-friction and poor extraction fails closed, but canonical OCR/finalization starts through a browser keepalive request. PDFs are accepted while the current canonical Google Vision image path is not a dependable multipage PDF reader. |
| Durable background processing | NEEDS WORK | Bookkeeping and receipt-understanding queues have leases, retry, idempotency, and dead-letter states, but no production Cron/runner or alerting is configured. Receipt-understanding is shadow-only by design. |
| Tax treatment and 2026 readiness | NEEDS WORK | Unsupported years fail closed correctly. Only federal tax year 2025 is approved; 2026 readiness is therefore intentionally `Incomplete` and estimated deductions are suppressed. |
| Reporting consistency | NEEDS WORK | Home, Reports, Schedule C, readiness, and exports use the canonical reporting service. Transactions uses the same resolution model, but applies a database limit before suppressing absorbed/inactive history, which can omit older current rows at scale. |
| Plaid Sandbox | READY | Link, exchange, sync cursor, webhook verification, modifications/removals, idempotency, and tenant behavior have focused tests. Sandbox-only product language is explicit. |
| Plaid Production | BLOCKED EXTERNALLY | Requires Plaid approval, Production credentials/products, webhook registration, Production institution testing, and operational monitoring. Current customer Link enablement deliberately permits Sandbox only. |
| Subscription and paid lifecycle | NEEDS WORK | Existing checkout/webhook files are prototypes: checkout accepts a caller-supplied price, is not bound to an authenticated Business, and webhook handlers are TODOs. No entitlement/read-only lifecycle exists. |
| Mobile and visual system | NEEDS WORK | Shared tokens and responsive compositions are strong, but comprehensive authenticated browser QA exists only for MFA/onboarding. Dense forms and long record lists need device-level verification. |
| Accessibility | NEEDS WORK | Focus styles, semantic state messaging, touch sizing, and most labels are good. Login labels are not programmatically associated; application-wide screen-reader and keyboard journeys are not automated. |
| Legal/operations | NEEDS WORK | Terms, Privacy, tax disclaimer, and contact email are public and reachable. Billing/cancellation explanation, account closure/data deletion workflow, support runbooks, incident response, and MFA-loss recovery need launch decisions. |

## C. P0 launch blockers

### P0.1 Paid membership lifecycle is not implemented

`app/api/checkout/route.ts` and `app/api/stripe/webhook/route.ts` are prototypes, not an entitlement system. Checkout accepts an arbitrary client-provided Stripe price ID and optional email without binding the session to an authenticated user or Business. Subscription webhooks verify signatures but only log event types; lifecycle handlers are TODOs. There is no durable Stripe customer/subscription identity, webhook-event idempotency, access-period calculation, cancellation-at-period-end behavior, failed-payment policy, Customer Portal, or read-only historical mode.

Do not expose paid checkout until the bounded Stripe milestone establishes server-owned price configuration, authenticated ownership, durable subscription state, webhook replay safety, entitlement enforcement, cancellation behavior, and post-membership read-only access.

### P0.2 Production background execution is absent

`bookkeeping_processing_jobs` and `receipt_processing_jobs` have appropriate durable queue primitives, but the repository contains no production Cron/scheduler. The only drains are worker-secret-protected internal routes. Without an external runner, queued bookkeeping and shadow understanding work can remain pending indefinitely.

Canonical receipt extraction is a separate, more immediate gap: `ReceiptUploadAction` calls `/api/receipts/ocr` from the browser with `keepalive`. Receipt registration is durable, but the canonical OCR/finalizer is not driven by the durable receipt queue. Closing a tab in the narrow registration-to-request interval can leave a receipt indefinitely unfinished. A launch milestone must make canonical receipt processing durable and monitorable while preserving upload idempotency and current canonical authority.

### P0.3 Current-year tax rules are unavailable

`SUPPORTED_TAX_YEARS` and the approved tax catalog cover 2025 only. The readiness system correctly refuses to reuse those rules for 2026, marks 2026 `Incomplete`, and suppresses estimated deduction totals. That fail-closed behavior is correct. A paid launch in 2026 needs a reviewed, versioned 2026 federal rule catalog and regression fixtures before tax-time/deduction claims can be marketed as current-year complete.

### P0.4 Production connected banking is externally blocked

Plaid is intentionally Sandbox-only. Production launch with connected banking requires Plaid Production approval and credentials, registered Production webhooks, institution coverage testing, reconnect/update-mode exercises, and monitoring. If the launch proposition requires connected accounts, this is a blocker. A deliberately CSV/manual-only launch would require explicit product and marketing decisions rather than silently degrading the experience.

## D. P1 required before paid public launch

1. **Production environment gate (Medium).** Require environment-specific Supabase hosts and required variables; make Production fail closed for missing/incorrect Supabase, worker, Stripe, base URL, and approved Plaid configuration. Complete `.env.example`, which currently omits active variables including `NEXT_PUBLIC_BASE_URL`, signup configuration, Google Vision, Stripe, and waitlist mail settings.
2. **MFA launch policy and recovery operations (Small).** Change from the current enrolled-user policy to the approved mandatory policy at launch, with no silent Production bypass. Document identity-verification and Supabase-admin recovery for a lost authenticator; do not build insecure recovery codes or email-based disabling.
3. **Canonical read completeness (Medium).** In `transaction-read-model.ts`, resolve/filter inactive and absorbed canonical records before applying the customer-visible limit or implement stable cursor pagination. Today a large number of historical/suppressed records can consume the query limit and hide older current activity. Make exports and contractor candidate selection use complete, year-scoped current data rather than fixed 500/1000-row application slices.
4. **Queue operations (Medium).** Add scheduled drains, bounded concurrency, dead-letter alerts, age/backlog metrics, replay tooling, and documented recovery for both bookkeeping and receipt processing. Separate provider failures from semantic terminal outcomes as the queues already do.
5. **Receipt production reliability (Large).** Move canonical extraction/finalization behind a durable job, add explicit supported MIME/file-size/page policies, timeouts, retry/backoff, terminal customer-visible states, and a deliberate decision on when multimodal shadow quality is sufficient to replace brittle regex semantics. Do not add a second upload/Keep step.
6. **Current-year tax catalog (Large).** Review and activate versioned 2026 rules, authorities, thresholds, and test fixtures. Preserve unsupported-year fail-closed behavior.
7. **Critical browser journeys (Medium).** Add stable local browser tests for signup/login/recovery/MFA, onboarding, CSV import, receipt upload/terminal state, questions, manual money, mileage, invoice/payment linkage, Reports/tax-time downloads, and mobile navigation.
8. **Abuse and cost controls (Medium).** Add upload/request limits by authenticated Business, file bounds, queue quotas, AI/OCR spend telemetry/alerts, and safe throttling. Protect expensive endpoints without customer-hostile arbitrary limits.
9. **Operational/legal product surfaces (Medium).** Provide coherent billing/cancellation terms approved by counsel, account closure/data deletion request flow, support contact expectations, privacy/security review, backups/restore verification, incident response, and data-retention policy.
10. **Legacy mutation retirement (Small).** Prove old `app/review` components and `/api/tx/*` mutation routes are unreachable, retain `AttachReceipt` while it is used by transaction detail, then disable/delete only the obsolete legacy endpoints. Current tests protect some destructive behavior, but latent duplicate write paths increase launch risk.

## E. P2 high-value polish shortly after launch

- Add cursor pagination and search across Transactions, receipts, invoices, and contractor payment selection; avoid fixed recent-row caps.
- Finish visual/browser QA for invoice, contractor, deduction, long receipt history, and error states at 320/375/768/1024+ widths.
- Standardize remaining older utility styles on Schedule C, auth, public/legal, and long single-file form components without changing workflows.
- Add small brand illustrations only where they improve comprehension: no activity, no receipts, all caught up, and annual records ready.
- Expand CSP with a report-only rollout, add HSTS at the deployment edge, and document dependency/security-update cadence.
- Add self-service device/session visibility when Supabase capabilities and support policy are ready.
- Replace application-memory full-history resolution queries with database-backed current projections where measurement demonstrates a need.
- Retire legacy `transactions` reporting fallback only after a measured migration/compatibility plan proves no customer history depends on it.

## F. External dependencies

| Dependency | Status | Required evidence before launch |
| --- | --- | --- |
| Plaid Production | BLOCKED EXTERNALLY | Approval, Production products/credentials, webhook endpoint registration, real institution tests, update mode/reconnect, removal/modification behavior, monitoring, and Production-only configuration gate. |
| Stripe | External configuration plus substantial internal work | Products/prices, webhook endpoint/secret, Customer Portal configuration, tax/business decisions, test-clock lifecycle tests, and production keys only after the entitlement implementation is complete. |
| OpenAI receipt understanding | Optional for initial canonical operation; not production-approved | R1 remains shadow-only. Production use requires provider privacy/retention review, synthetic/approved evaluation set, acceptance metrics, spend controls, and an R2 activation decision. |
| Google Vision | Configuration/operations dependency | Credential scoping, quota/budget alerts, timeout/retry behavior, supported document policy, privacy review, and monitoring. |
| Resend/waitlist email | Optional acquisition dependency | Verified sender/domain, deliverability, rate/abuse controls, and non-secret environment configuration. It is not invoice sending infrastructure today. |
| Legal/privacy review | External professional review | Terms, Privacy, tax disclaimer, billing/cancellation disclosures, data retention/deletion, subprocessors, and tax-claim language. Repository audit does not establish legal sufficiency. |

## G. Security findings

### Sound; do not rebuild

- Supabase Auth is the identity authority. SSR middleware refreshes sessions and preserves refreshed cookies on redirects.
- Public/authenticated route policy and MFA challenge routing are centralized and covered by focused tests.
- TOTP enrollment, QR rendering, manual secret, six-digit verification, AAL2 challenge, removal protection, recovery/reset, and sign-out have bounded customer-facing errors and recent real-browser validation.
- Service-role construction is in a `server-only` module. No `NEXT_PUBLIC` service-role variable or client-side service key was found. Worker routes require `BOOKKEEPING_WORKER_SECRET`.
- Representative RLS and cross-Business PostgreSQL tests cover businesses, financial observations, bookkeeping, receipts, manual money, mileage, invoices, contractors, deduction facts, and processing tables.
- Basic headers include frame denial, MIME-sniffing protection, referrer policy, permissions policy, and a bounded CSP baseline.

### Launch gaps

- Mandatory MFA is not yet the default enforcement mode. Production activation must be explicit and tested against recovery, signup, and subscription state.
- Lost-authenticator recovery is an operational Supabase-admin process; there are no recovery codes. A verified, auditable support runbook is required. Never add an unauthenticated factor-reset shortcut.
- Environment validation blocks accidental remote Supabase only for local development. It does not enforce staging/production host identity or complete required configuration.
- The Stripe checkout prototype is unauthenticated and accepts a client-selected price ID. It must remain unavailable until replaced.
- No application-level throttling or upload quota was found for expensive authenticated endpoints. Supabase Auth rate limits do not cover receipt/OCR/import/worker abuse.
- The CSP is intentionally minimal. Roll out a stricter policy using report-only telemetry; do not destabilize Supabase, Plaid, or QR/data-image flows.
- Login's visible Email and Password labels are not programmatically associated with their inputs. This is a bounded accessibility defect, not an auth-logic flaw.
- Keep checking Supabase SSR release notes: build output currently includes Edge-runtime dependency warnings, and local logs have emitted Supabase guidance about trusting `getSession` user objects. Application authorization paths inspected use `getUser`; the warning should be traced before dependency upgrades.

## H. Canonical bookkeeping integrity findings

### Sound; do not rebuild

- `financial_transactions` and manual/receipt sources are immutable observations with Business ownership and stable identities.
- Canonical `bookkeeping_records`, append-only decisions, allocations/tax treatments, corrections, and evidence links preserve provenance and current-leaf history.
- Receipt-financial convergence, manual-source supersession/removal, and compound reconciliation resolve through `loadCurrentRecordConvergences`; exact signed cents, currency, uniqueness, tenant, idempotency, reversal, and dependent-state safeguards have focused PostgreSQL tests.
- Invoices do not create cash-basis income. An invoice becomes paid through a canonical income link; later bank convergence does not duplicate manual income.
- Contractor associations target current canonical expenses rather than creating a second expense ledger.
- Deduction facts and tax conclusions are separate from immutable bookkeeping amounts and are re-evaluated append-only.

### Risks requiring bounded work

- `listTransactionReadModel` limits `bookkeeping_records` before removing absorbed/inactive records. At sufficient history volume, Transactions can omit legitimate older current rows. Contractor association candidates inherit a separate `limit: 500` completeness risk.
- Current-record resolution loads whole Business histories for convergence, receipt lifecycle, compound components, and manual corrections into application memory. Correctness is good, but repeated unbounded reads will become a latency/cost risk.
- Home, readiness, Reports, and Transactions share concepts but perform separate repository orchestration. Home loads report/readiness/receipt attention sequentially and readiness can repeat reporting work. Cache/request composition can improve this without changing truth.
- A legacy `transactions` fallback remains in reporting and transaction reads. It preserves historical compatibility, but it is a second read path whose retirement conditions are not yet measured.
- Authenticated legacy `/api/tx/*` routes and unused Review components remain. They mutate legacy rows and should not survive launch merely because their pages redirect. Prove reachability before removal; preserve `AttachReceipt`, which is still used by transaction detail.
- Readiness queries all receipt events to calculate current leaves and counts uploaded roots by event creation year. A receipt's upload year is not necessarily the economic tax year, and an `uploaded` current leaf can represent stalled canonical processing. Durable processing and a bounded current projection should replace this heuristic.

## I. Customer journey, mobile, and design findings

### Canonical route/discoverability map

- Acquisition/auth: `/`, `/signup` (when enabled), `/login`, `/recover`, `/reset-password`, `/auth/callback`, `/mfa/challenge`.
- Setup: `/onboarding`.
- Primary product: `/home`, `/transactions`, `/transactions/[id]`, `/reports`, `/settings`.
- Contextual workflows: `/receipts`, `/money?direction=received`, `/money?direction=spent`, `/mileage`, `/invoices`, `/invoices/[id]`, `/invoices/[id]/print`, `/questions`, `/deductions`, `/contractors`, `/import`, `/export`, `/reports/tax-time`, `/reports/schedule-c`, `/settings/banking`, `/settings/security`.
- Compatibility redirects: `/dashboard` to `/home`, `/review` to `/transactions`, `/realtor` to `/`, `/settings/profile` to `/settings`, `/reports/summary` to `/reports`, `/waitlist` to `/#waitlist`.

No major current capability requires a guessed URL: Home's Add menu exposes manual money, mileage, invoices, receipts, deductions, and contractors; Home has immediate receipt upload; Reports exposes tax-time and contractors; Settings exposes banking/security/business setup; transaction detail links to questions and receipts. Keep primary navigation restrained.

### Journey/state findings

- **Landing/signup/login:** coherent public shell and legal links. Signup availability is configuration-driven. Login retains older styling and has label association defects. Recovery intentionally avoids account enumeration.
- **Onboarding:** progressive factual intake, unsupported Schedule C/entity cases fail clearly, and browser coverage exists. The end route chooses receipts/import; ensure that choice remains understandable for a first-time empty account.
- **Banking/import:** Sandbox notice is explicit. CSV import has mapping/error states and canonical ingestion tests. Real-browser malformed/large CSV and session-expiry coverage is missing.
- **Questions:** the calm caught-up state, progress, and Finish later route are good. Browser tests should cover every answer control and stale/conflict response.
- **Receipts:** immediate upload and responsive cards are good. A technically successful registration can outlive browser-driven OCR initiation; incomplete/unsupported files can remain quiet too long. Accepted PDF behavior is broader than dependable canonical parsing. File-size/page bounds and terminal/retry states need launch work.
- **Manual money/mileage/invoices:** workflows are reachable and mobile grids stack. Invoice creation and contractor management are dense all-in-one client forms; they need real-device keyboard/input/validation QA. Mileage first-use framing is clear.
- **Transactions:** responsive row markup avoids a forced desktop table and the empty state has connect/import actions. No pagination means large accounts can appear incomplete.
- **Reports/tax-time:** plain-language hierarchy and downloads are present. Schedule C retains older utility styling. Unsupported-year behavior is safe but means 2026 cannot be Ready.
- **Settings/security:** coherent sections and proven MFA. Bank Connections is clear and Sandbox-specific. Account closure/data export/deletion and membership state are absent.
- **Errors/loading:** a global customer-safe error boundary exists, but only onboarding/questions have route loading files. Data-heavy Home, Transactions, Reports, receipts, invoices, and contractors rely on full-page navigation without route-specific skeletons. Error handling is inconsistent between polished notices and older technical API error shapes.
- **Mobile:** static responsive contracts are generally sound, with 44px-class actions and stacked layouts. The launch gap is evidence: only onboarding/MFA have real browser E2E. Test 320/375px for Home menus, receipt input, manual/mileage forms, invoice form/detail/print, contractor forms, report downloads, long merchant text, and MFA QR/manual-secret wrapping.
- **Illustration:** no stock imagery should be added. Future small brand illustrations could improve no-transactions, no-receipts, all-caught-up, and ready-for-tax-preparation states, but are not launch blockers.

## J. Cost-risk findings

| Risk | Why it can grow unexpectedly | Bounded control |
| --- | --- | --- |
| Receipt OCR and multimodal understanding | Every upload can invoke Vision and later an AI image/PDF call; retries and duplicate uploads compound cost. | Business-scoped SHA-256 idempotency, hard MIME/byte/page bounds, durable retries, per-Business rate/quota, provider budget alerts, model/version cache, and shadow/canonical call accounting. |
| Multipage PDFs | Up to 10 pages are supported in multimodal shadow, but the canonical path lacks a consistent bounded PDF policy. | Retain source, process at most approved pages, expose partial/help terminal state, meter page count, and reject oversized uploads before provider calls. |
| Unbounded current resolution | Whole-Business event histories are repeatedly transferred and reduced in application memory. | Cursor/year bounds, indexed database current projections, request-scoped reuse, and query telemetry before redesign. |
| Reporting/readiness duplication | Readiness invokes reporting and Home can invoke both again. | Compose once per request, cache only immutable/versioned inputs, and measure queries. Never cache across tenants. |
| Plaid | Per-item sync/webhook/retry volume and institution reconnects can grow. | Durable idempotent signals, cursor monitoring, bounded retries, connection health alerts, plan-level connected-account limits justified by Plaid cost. |
| Supabase Storage/database | Original receipts/PDFs, OCR text, append-only histories, and audit rows accumulate permanently. | Retention policy, object-size limit, storage metrics, indexed current views, audit payload bounds, and documented archive/deletion rules. |
| AI bookkeeping shadow | Disabled by default, but enabling it without a runner budget can generate repeated model calls. | Existing evidence/model identity dedupe plus monthly spend guard, batch/concurrency limit, circuit breaker, and evaluation sampling. |
| Email and Stripe | Waitlist/email abuse and webhook retry volume can create cost/noise. | Verified sender, rate limit, webhook idempotency, event retention, server-owned prices, and alerts. |

The largest cost risk is unmetered document processing, especially images/PDF pages combined with provider retries. Control it before canonical multimodal activation.

## K. Testing gaps

### Strong existing coverage

The repository has broad Vitest coverage for schema contracts, auth/MFA, routing, canonical bookkeeping decisions, processing queues, receipt lifecycle and understanding shadow, CSV/Plaid normalization and ingestion, manual money, mileage, invoices, contractor awareness, deduction intelligence, tax treatments/readiness, reporting, convergence, corrections, RLS, and service-role boundaries. Many high-risk canonical behaviors also have local PostgreSQL integration suites.

### Minimum launch browser suite

1. Signup enabled/disabled, email confirmation/callback, login, recovery/reset, MFA enrollment/challenge/removal, expiry, and sign-out.
2. Onboarding eligible/unsupported/correction journey and first-source choice.
3. CSV template upload, mapping, invalid row, duplicate import, success, and resulting Transaction/Report consistency.
4. Plaid Sandbox Link, initial sync, webhook sync, modified/removed transaction, reconnect/update mode, and duplicate signal.
5. Receipt image upload from Home and `/receipts`, immediate departure, durable completion, duplicate, bad extraction, PDF limit, discard, financial-first match, and later convergence.
6. Question answer, stale answer, correction, and caught-up state.
7. Manual income/expense creation/correction/removal and later bank convergence.
8. Vehicle first-use and mileage add/correct/export on a phone viewport.
9. Invoice create/print/cancel/link payment and later manual-to-bank convergence.
10. Reports, Schedule C, tax-time readiness, every download, unsupported year, and no double counting.
11. Cross-tenant browser/API attempts using two users across representative routes.
12. Responsive/keyboard smoke at 320, 375, 768, and desktop widths with automated overflow detection.

Mock/static tests should remain fast gates, but Plaid, Storage, Auth, RLS, queue claims, and canonical convergence need local-service or Sandbox evidence before release.

## L. Legacy and dead-code findings

- Teller is retired from runtime; references are historical documentation/migrations rather than active ingestion.
- Realtor-specific routing is retired through `/realtor` to `/`; vertical values remain historical compatibility data.
- `Dashboard`, `Review`, profile Settings, report summary, and waitlist paths are intentional compatibility redirects.
- `app/review/BulkTable.tsx`, `CategorySelect.tsx`, and `ApproveNotesModal.tsx` reference legacy `/api/tx/*` routes and appear superseded by canonical Transactions/Questions. `AttachReceipt` is still used and must not be removed wholesale.
- `/api/tx/category`, `/bulk-category`, `/receipt-waiver`, `/delete`, `/approve`, and `/undo-ocr` remain an authenticated legacy mutation surface. Disable only after import/reachability analysis and historical-data compatibility tests.
- `app/lib/supabaseServer.ts` uses older `SUPABASE_URL`/`SUPABASE_ANON_KEY` naming and appears separate from current SSR utilities. Confirm import reachability before retiring it.
- Workflow documentation still contains old Dashboard/Realtor/Weekly Review language. Treat canonical product/reference documents as authority; update stale operational docs in a dedicated cleanup.
- TODOs in Stripe webhook handlers are launch blockers, not harmless cleanup.

## M. Recommended milestone sequence to paid launch

1. **Durable processing and receipt production reliability — Large.** Schedule queue drains; make canonical receipt extraction/finalization durable; add terminal/retry states, supported file policy, monitoring, and cost controls.
2. **Paid membership, entitlement, cancellation, and read-only history — Large.** Replace Stripe prototypes with authenticated server-owned checkout, durable idempotent webhooks, portal/cancellation, failed-payment policy, access-through-period-end, and read-only former-customer mode.
3. **2026 tax catalog and tax-language review — Large.** Research, approve, version, and test current-year rules; review product claims and annual outputs with qualified tax/legal review.
4. **Production security/environment/operations gate — Medium.** Enforce environment identity and required config, mandatory MFA policy, recovery/account-closure runbooks, backup/restore, incident response, rate limits, secret/headers review, and observability.
5. **Plaid Production and launch browser certification — Large / BLOCKED EXTERNALLY.** Complete approval and Production setup, then run institution/webhook/reconnect tests plus the critical multi-tenant mobile browser suite. In parallel, correct current-read pagination/limit ordering.

After launch: visual/accessibility polish, database current projections based on measured load, broader document understanding activation, and carefully proven legacy-route retirement.

## N. DO NOT REBUILD

- Canonical `financial_transactions` to `bookkeeping_records` architecture.
- Immutable source observations and append-only provenance/correction history.
- Shared current-record resolution concepts for receipt convergence, manual corrections, and compound reconciliation.
- Exact signed-cent, currency, Business-scope, idempotency, and fail-closed reconciliation safeguards.
- Consolidated customer question/attention queue.
- Separation of bookkeeping facts from tax treatment and deductible amounts.
- Receipt-only expense and later financial convergence semantics.
- Manual money, mileage, invoice-context, contractor-awareness, and deduction-fact bounded models.
- Cash-basis invoice behavior.
- Supabase Auth, SSR session refresh, TOTP/AAL2 design, and RLS-first tenant model.
- Restrained primary navigation and contextual workflow discovery.
- Landing-page-derived design system and mobile-first application shell.
- Plaid cursor/idempotency/canonical ingestion architecture; Production enablement is an operational milestone, not a replacement.

## O. Scope of recommended milestones

| Milestone | Scope | Why |
| --- | --- | --- |
| Durable queue operations | Medium | Scheduler, bounded runners, metrics, alerts, replay/runbooks around existing queue primitives. |
| Canonical receipt durability and supported-document policy | Large | Changes orchestration and customer terminal states while preserving canonical authority. |
| Stripe membership/read-only lifecycle | Large | Schema/state, webhooks, entitlements, cancellation, portal, failures, security, and browser tests. |
| 2026 tax rules | Large | External research/review plus versioned rules and regression cases; no architecture replacement. |
| Environment/security launch gate | Medium | Configuration validation, MFA policy, recovery/closure operations, throttling, backups, and headers. |
| Plaid Production certification | Large / externally blocked | Approval, credentials, webhooks, institution behavior, monitoring, and production verification. |
| Current-read pagination/completeness | Medium | Fix limit ordering, stable cursors, contractor candidate completeness, and canonical consistency tests. |
| Critical browser/mobile E2E | Medium | Existing infrastructure can be expanded without a new platform, but fixtures and reliable local services are needed. |
| Legacy mutation retirement | Small | Reachability proof, targeted disable/removal, compatibility tests; do not delete `app/review` wholesale. |
| Accessibility/visual QA R3 | Medium | Route-by-route keyboard, screen-reader, responsive, error/loading, and print verification. |
| Multimodal receipt canonical activation | Very Large | Requires privacy approval, gold-set metrics, cost controls, safe precedence, and staged rollout beyond shadow R1. |

## Audit boundaries and evidence

This audit inspected the route tree, customer links and redirects, middleware/auth policy, environment validation, Supabase admin boundary, Stripe prototypes, Plaid routes/services/tests, receipt upload/OCR/understanding flows, current-record resolution, transaction/report/readiness consumers, tax-year support, design-system/customer pages, migrations, documentation, and test inventory. It did not call Production services, make OpenAI calls, apply migrations, alter environment files, or establish legal/tax correctness. Responsive findings are based on code/static contracts and existing browser coverage; the recommended launch browser suite is required to close the device-level evidence gap.

# Transactions completion certification — September 21, 2026

## Decision

**PASS — Rick can mark “Build product-specific core workflows” complete.** The explicitly approved one-off Sandbox Refresh call produced three genuine provider removals. Real webhook receipt, sync ingestion, cursor advancement, replay, action-index publication and public customer reads passed. Refresh was not added to WriteOffs or enabled as a product feature.

Public staging: https://writeoffs-fresh-staging.vercel.app

Receiver: https://writeoffs-fresh-staging.vercel.app/api/plaid/webhook

Deployed build: `dpl_CG48jHiabLWQgMeFjY86J4dSnCj1` — https://writeoffs-fresh-staging-p5b8cute3-ricks-projects-3ba59ab5.vercel.app

Current branch: `v2-onboarding-staging`, base `5014662a503c328b6aabfcb5ce3806f9394b3635`. The accumulated readiness changes are approved for commit and non-forced push after this passing certification. No main or real Production change. Unapproved Betti assets excluded.

## Requirement matrix

| Requirement | Result | Evidence |
|---|---|---|
| Keep history request at 730 | PASS | `newItemLinkRequest` unchanged; existing focused configuration tests |
| Real fresh Link/Item/initial sync | PASS | Fresh synthetic owner, real onboarding and public Plaid Link, Item `97b3fe3b-5c16-4cf5-9e37-9bb72e6694b8`; encrypted token exchange; persisted cursor |
| Scope older than available bank records | PASS | Authorized start 2024-01-01; both connected accounts first show bank activity 2026-03-21; scope not truncated |
| Per-account missing-period disclosure | PASS | Shared authenticated coverage read; Home, completion-stage Check-in and period-specific Reports; statement-upload link |
| No false completeness from absence of bank rows | PASS | Availability and confirmed statement intervals separated; no complete-source assertion; no bank-lookback restriction on authorized scope |
| Real statement fill-in | PASS | Public upload of January 2024 PDF, validated period, explicit account confirmation; checking gap advances to February, credit-card gap remains January |
| Identical statement replay | PASS | Same uploaded PDF returns same document ID; `statement-fill-in.json` |
| Bank/statement overlap safety | PASS — REAL UPLOAD | Properly column-aligned duplicate debit held as needs_attention; exactly one matching debit source remains; `overlap-protection.json` |
| Real added and modified updates | PASS | Provider-origin 158 added and 155 modified immutable versions in final observation; public webhook sync |
| Genuine provider removed[] | PASS — REAL PLAID SANDBOX | Three pending-to-posted removals, delivered through public webhook and sync; `real-removal-verified.json` |
| Posted removal bookkeeping consequences | PASS — INTERNAL DETERMINISTIC | $104 expense removed; Reports delta exactly $104; Home equals Reports; Transactions excludes removed sources |
| Removal question/index/stale safety | PASS — INTERNAL DETERMINISTIC + UNIT | Historical question excluded, index refresh publishes successfully, obsolete-source correction rejected, history retained |
| Removal replay/history | PASS — INTERNAL DETERMINISTIC | Two replayed removals produce two duplicates, no extra versions; four original/removal versions retained |
| Fractional-cent rejection without rounding | PASS — REAL SANDBOX | 35 distinct provider transactions; exact parsed source values retained; null canonical amount/id; CSV lists every offending transaction |
| Valid update after malformed data | PASS — REAL SANDBOX | `/sandbox/transactions/create` produced an exact $12.34 update; imported once after quarantine; cursor continued |
| Quarantine correction/retry | PASS — DATABASE ROLLBACK | Malformed + valid neighbor commit together; replay creates no duplicates; corrected provider revision clears current rejection |
| Pagination/cursor/mutation restart | PASS | Complete-page accumulation, pre-pagination cursor restart; new malformed-first-page/valid-next-page test; atomic SQL rollback cases |
| Webhook correctness | PASS — REAL SANDBOX | fire request `345646b75cb5664`, `webhook_fired:true`; durable validated Item-specific event processed |
| Tenant isolation/MFA | PASS — LIVE | Other tenant cannot read coverage accounts or quarantined records; AAL1 RPC rejected; anonymous endpoint 401; cross-tenant disconnect rejected |
| Pending deletion | PASS — DATABASE ROLLBACK | Claim/commit blocked, cursor unchanged; previous real disconnect test retained |
| Disconnect | PASS — FRESH LIVE CERTIFICATION | After removal tests, public disconnect returned 200 and subsequent sync claim returned no rows; `disconnect-proof.json` |
| Home/Reports arithmetic | PASS — INTERNAL DETERMINISTIC | Existing canonical arithmetic untouched; exact expense delta and matching totals |
| UI coverage consistency | PASS — LIVE | Reports sourceCoverage equals standalone coverage for same period; January fill-in reflected by shared read |

## Changes

1. Preserve prior revision/idempotency correction and deletion guard in migration `20261005000200`.
2. Quarantine identifiable invalid source revisions in the existing immutable Plaid version chain (`20261005000300`). Preserve full parsed transaction evidence; create no canonical money row. Cursor and valid neighboring events commit atomically. A corrected provider revision can supersede the rejection. No token/request payload is stored in this source evidence.
3. Fix a discovered live regression: `listCurrentWeeklyReviewItems` treated a **superseded Plaid source** as broken evidence and threw, causing Reports to return HTTP 500. It now omits removed/superseded questions from current work while preserving history. Actually missing financial rows still fail closed. The live canonical report and public route both pass after correction.
4. Add a tenant/MFA-bound account coverage read (`20261005000400`) and shared projection. Validated statement intervals can fill gaps only for their own or explicitly confirmed linked account. Bank observations describe available activity, never guaranteed completeness. Home, Reports and Betti completion use the same disclosure component.
5. Restore the existing statement-account confirmation path in unified document upload. It uses the existing canonical account-link endpoint; it does not guess account identity or create a second matching engine.

## Fractional-cent findings

Examples actually delivered by the dynamic Sandbox persona:

- `3egLbr6wBRSbx34P7danTnJD4B9arQiGXdb9X`, **10.021521 USD**, `70252237 AMAZON - LEN N`.
- `3egLbr6wBRSbx34P7danTnJD4B9arQiGXdbkX`, **52.34218 USD**, `Uber Eats`.

There were 35 distinct rejected transactions, 70 historical rejected revisions at the sampled point, and 35 current rejections. See `sandbox-rejected-transactions.csv`. No rounded cents were invented. These records previously poisoned the Item's atomic sync; they no longer block subsequent valid updates. Source identities that cannot be safely associated still fail closed.

Plaid documents synthetic Sandbox behavior but no explicit guarantee or warning about fractional-cent USD was found. Do not claim that Plaid has documented these exact values as intended behavior. They no longer prevent the removal test.

## Genuine provider removal — approved one-off test

Rick explicitly approved the Sandbox-only call. Exactly one `/transactions/refresh` call was made outside application code; request ID `504b0355588d1d3`. No Production call or product integration was made.

Plaid produced **9 added / 0 modified / 3 removed** in this update. Earlier genuine modified events remain covered by the previous run. All three removals were observed in `/transactions/sync` and stored as immutable current removal versions by the real public webhook path. The Item cursor exactly matched the provider's final cursor.

`SYNC_UPDATES_AVAILABLE` event `961ed7e8-8906-4f92-9192-301841e6cbb4` was received at `18:17:16.884643Z` and processed at `18:17:18.052Z`. This is processing duration, not an HTTP response-latency measurement.

A repeated sync webhook produced **zero additional versions** (325 before and after). Home and Reports amounts agreed; `/home`, `/transactions`, `/reports`, `/api/reports/summary` and `/api/bookkeeping/work` all returned 200. The canonical action index published with zero failures. The fresh Item was then disconnected successfully and cannot acquire another sync lease.

**Evidence distinction:** Plaid's real removals were pending-to-posted transitions; those pending records had never contributed to working income/expense or customer questions. The separate internal deterministic test proves removal of an already-booked $104 expense and an existing question, including exact report change, history retention, replay and stale-write rejection. We do not claim that this latter scenario was generated by Plaid.

Sources: [Plaid transaction states and dynamic Sandbox testing](https://plaid.com/docs/transactions/transactions-data/), [Sandbox create-transactions API](https://plaid.com/docs/api/sandbox/#sandboxtransactionscreate).

## Validation

- Full suite: **1,795 passed; 143 skipped** (environment-gated). No skipped test is represented as a live pass.
- TypeScript: PASS.
- Lint: PASS, **16 pre-existing warnings**, zero errors.
- Optimized local Webpack build: PASS. Dedicated staging default Next/Turbopack build: PASS.
- Runtime dependency audit: **0 vulnerabilities**.
- Full dependency audit: **2 moderate development-tool findings**, no high/critical; dependencies unchanged.
- Gitleaks redacted candidate scan: **no leaks**, approximately 6.6 MB scanned.
- `git diff --check`: PASS.
- Staging SQL rollback: PASS (revisions, removals, replay, quarantine/recovery, deletion/cursor protection).
- Migrations 002, 003 and 004 applied to dedicated staging only.

Screenshots: [gallery files](screenshots/), with Home, Check-in and Reports at 390, 768 and 1280px. Mobile Home and Reports and expanded desktop Home were visually inspected; screenshots are real public staging, not fabricated states. The active Check-in question is preserved; coverage is displayed when no ready action is active.

No accounting/tax policy, financial arithmetic, days_requested, ordinary-answer architecture, main, Production or Rick customer data changed.

## Overlap fixture qualification

The first two artificial PDFs put an entire table row into a single text object. Their amount was extracted on the credit side, so they were not valid duplicate-debit test cases. They are excluded from the passing overlap evidence. The final fixture uses separately positioned date, description, credit and debit cells. Its exact matching debit was held for review, with no second debit import. No automatic merge or completed coverage is claimed for a held overlap document.

## Files and migrations

- `app/api/reports/summary/route.ts`
- `app/components/guided/GuidedWork.tsx`
- `app/documents/DocumentIntake.tsx`
- `app/home/page.tsx`
- `app/lib/bookkeeping/supabase-repository.ts`
- `app/lib/plaid/normalize.ts`
- `app/lib/plaid/service.ts`
- `app/lib/plaid/types.ts`
- `app/reports/ReportsSummary.tsx`
- `tests/bookkeeping/betti-work.test.ts`
- `tests/bookkeeping/review-queue-batching.test.ts`
- `tests/plaid/normalization.test.ts`
- `app/api/bookkeeping/source-coverage/route.ts`
- `app/components/SourceCoverageNotice.tsx`
- `app/components/StatementAccountLinks.tsx`
- `app/components/source-coverage.css`
- `app/lib/bookkeeping/source-coverage-loader.ts`
- `app/lib/bookkeeping/source-coverage.ts`
- `scripts/certify-staging-plaid-completion.mjs`
- `scripts/certify-staging-plaid-transactions.mjs`
- `scripts/certify-staging-plaid-transactions.sql`
- `supabase/migrations/20261005000200_plaid_transactions_certification.sql`
- `supabase/migrations/20261005000300_plaid_source_quarantine.sql`
- `supabase/migrations/20261005000400_customer_source_coverage.sql`
- `tests/bookkeeping/source-coverage.test.ts`
- `tests/plaid/historical-scope.test.ts`
- `tests/plaid/pagination.test.ts`
- `docs/audits/plaid-transactions/` — prior proof retained, completion matrix, sanitized JSON/CSV and public staging screenshots.

TypeScript initially encountered duplicate generated `.next/types/* 2.ts` files. Removing only those generated duplicates and regenerating route types restored a clean pass; no application workaround was introduced.

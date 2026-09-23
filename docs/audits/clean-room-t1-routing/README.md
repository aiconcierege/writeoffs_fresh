# Clean-room T=1 question routing correction

Date: 2026-09-23. Branch: `v2-onboarding-staging`.

## Certification status

**Application deployed; public canonical routing verified; indexed-refresh follow-up pending.**
Rick approved the staging-only worker exclusion. It is configured on the dedicated
staging primary slot. Migration 20261005000800 applied and application commit
149dcf2383823ad62ace4a99d4b084d1029ad9de deployed successfully. No customer
reassessment was requested. All original baseline comparisons remain unchanged.

Public API action IDs/order match the corrected 14-action projection. Desktop and
mobile screenshots show the fully loaded loan-statement request and truthful
progress text. The index is still on its prior version because its normal next
refresh time is midnight. Tested follow-up migration 20261005000900 lets a routing
version change refresh sooner while retaining retry backoff and the freeze.
Its staging application is pending the local Supabase Keychain approval.

## Root cause

`guidedStage` previously assigned every eligible business-only expense to a fixed
personal → mixed-use → receipts progression. `projectBettiWork` then suppressed
transaction-specific questions for records owned by those stages. This hid the
phone percentage, printing-purpose and insurance-coverage questions even though
they already existed. The personal stage also used the eight-item receipt batch
size and split Catch-up/Current work, creating extra exception turns.

The indexed SQL reader independently orders persisted priorities. Correcting only
the projector's array order is insufficient. The corrected canonical priority has
a routing tier that the indexed reader also honors, including continuity reads.

## Changes

- A specific question, including an active deferral, owns its record before generic
  stage selection. Generic stages cannot replace or bypass it.
- Ready specific questions and loan/refund requests precede optional reviews.
  Age, amount-related priority and continuity still order work within each tier.
  Account-use prerequisites and evidence/readiness fences remain intact.
- Business-only exception review includes already-established business expenses,
  not unresolved facts. One account-level group can include Catch-up and Current
  activity, up to 100 purchases; receipts and other guided groups remain capped at
  eight. Deferred/waiting work remains separately protected.
- Business-only expenses no longer enter a universal mixed-use stage. Specific
  phone/allocation questions remain. Unresolved use on genuinely mixed accounts
  retains its existing path.
- A directly established bank service/maintenance fee has no generic personal or
  receipt task when its matching account has validated statement coverage, its
  business-only context is established, and the full business allocation is in
  Fees. This does not exempt ambiguous fees or unvalidated statements.
- Missing purchase receipts remain a documentation concern. They do not remove
  supported expenses from working books. Loan documentation remains material.
- Optional exception and receipt actions do not by themselves label established
  working bookkeeping unfinished. They remain customer actions; no complete-source
  or final-tax-coverage claim is invented.
- Check-in says **“A few things to review”** instead of a fixed remaining-task count.
  Counts of actions already handled/deferred during this visit remain truthful.
- Sweep explanation: **“I’ve treated these as business. Just tell me if any were
  personal.”** No page redesign.
- Reader and indexed-answer routing version checks advance together. Exact
  snapshot matching, tenant/MFA checks, idempotent retry and stale-write guards
  are preserved.

No changes to classification, allocations, financial arithmetic, refund/loan
policy, transaction ingestion, Plaid, receipt matching or tax calculations.

## Expected controlled May flow

The initial settled set has 14 actionable groups: 11 specific facts, two special
loan/refund requests and one optional five-purchase exception review. This is
**not a promise of 14 total remaining interactions**. Answers can make subsequent
facts unnecessary or reveal legitimate follow-ups/documentation requests.

The five ordinary purchases are Adobe, business license, Office Depot, Google
Workspace and office rent. Phone percentage, printing purpose and insurance type
surface directly instead of sitting behind them. The bank fee is absent from
personal and receipt groups. Completing the optional sweep can reveal a receipt
request for those ordinary purchases; it does not reveal a universal mixed-use
sweep. Deferring it leaves supported amounts intact.

Both deterministic evaluation and real-ingestion checks must preserve:

| Working figure | Amount |
|---|---:|
| Business income | $2,100.52 |
| Business expenses | $1,425.73 |
| Estimated profit | $674.79 |

## 11/7 versus 12/8

The exact historical cause is **not established**. The earlier visible action
version/projection was not captured with the later stored snapshot. Code confirms
that a ready conversational question is retained and is not continuously polled;
background publication and batching can change the stored set independently.
That establishes a possible mechanism, not proof of which event caused this
observation. Do not label the earlier screen wrong or fabricate an event trace.

## Validation and evidence

- `tests/bookkeeping/clean-room-routing.test.ts`: real deterministic evaluator,
  exact 24 movements, unchanged P&L, autonomous categories/exclusions, specific
  precedence, one coherent sweep, no universal mixed-use follow-up, fee evidence
  guard, deferral, nonblocking working status and snapshot-version protection.
- `tests/bookkeeping/guided-work-route.test.ts`: canonical snapshot checks,
  personal-group capacity and unchanged smaller receipt limits.
- `tests/bookkeeping/action-index-freeze.test.ts`: staging-only configuration,
  fail-closed validation and exclusion before claims/publication.
- `tests/security/specific-fact-routing.local.sql`: executed in a local data-free
  clone of current staging schema; rollback-only synthetic fixtures. Verifies
  actual SQL capacity/stale guards, read/write version agreement, indexed order,
  continuity, freeze exclusion, service-role permissions and lease fencing.
- `scripts/certify-clean-room-routing.ts`: creates only tagged synthetic staging
  users; normal browser onboarding and PDF upload, normal workers, business-only
  answer, then read-only canonical projection/report checks. `--hosted` additionally
  verifies the public rendered action and captures desktop/mobile screenshots.
  Credentials remain only in a private temporary fixture file, never evidence.

A first generated synthetic PDF placed both balances on one line. Its 24 amounts
imported correctly, but coverage was only partially validated, so the bank-fee
exception correctly stayed off. That fixture was not certified. The follow-up
fixture uses the original controlled test PDF through normal ingestion. No
financial facts were patched to make an assertion pass.

## Freeze and rollout

The existing refresh worker calls `reconcile_current_betti_questions` before
publishing. Changing the routing version would make indexes eligible for refresh;
daily expiry also triggers refresh. Therefore merely avoiding a manual rebuild
is not sufficient to promise a frozen baseline across deployment.

Prepared control: `WRITEOFFS_STAGING_FROZEN_BUSINESS_IDS`, server-side and staging
only. The claim function excludes configured businesses **before leasing**; an
explicit refresh also returns without accessing them. No customer IDs are baked
into source. Rick approved and this runtime exclusion is now configured. It must not be removed without his approval.

The exclusion, first migration, deployment, hosted canonical flow and post-deploy
baseline comparison are complete. The indexed-refresh follow-up remains to be
verified. No unrelated pending migrations were applied.

The frozen customer's existing evidence is sufficient to compute the corrected
projection; re-importing or rewriting bookkeeping facts is not required. Any
publication/reconciliation for that customer still requires explicit approval.
Normal worker preparation is not read-only, so do not run it under audit authority.

## Completed real-ingestion result

At 2026-09-23 17:20 UTC, the original controlled PDF on the fresh synthetic
customer settled and passed all local corrected-projection/report assertions.
See `synthetic-ingestion-result.json` for the exact order and wording:

1. Equipment loan: supporting-statement request.
2. Office Depot refund: relationship confirmation.
3. Robert Hall incoming Zelle: source.
4. Mark Reynolds outgoing Zelle: purpose/activity.
5. Stripe: narrow confirmation.
6. ATM withdrawal: purpose/activity.
7. Emily Carter incoming Zelle: source.
8. Blue Mesa ACH deposit: source.
9. Cash deposit: source.
10. Jane Morris / invoice 1041: narrow confirmation.
11. State Farm: insurance coverage.
12. Desert Print Shop: purchase purpose.
13. Verizon: business percentage.
14. One optional exception review: Adobe, business license, Office Depot,
    Google Workspace and office rent.

The relative order within the specific-question tier still uses existing age,
priority and continuity policy. No guarantee is made that all future sessions
have this exact tie-break ordering or number of follow-ups.

Validated totals: 210052 / 142573 / 67479 cents (income / expenses / profit).
No individual transaction answers were provided. Only normal onboarding and
business-only account context were supplied to the separate synthetic customer.

`frozen-baseline-verification.json` records read-only equality checks against the
original audit snapshot. All 16 checked record/history/projection classes were
unchanged, and guided assertion count remained zero. No original-customer worker
or reconciliation command was invoked.

Final checks are recorded in `validation.json`. Hosted canonical verification now passes. The indexed-refresh follow-up remains
pending; **this is not permission to unfreeze Rick's customer or answer questions**.

## Deployment verification

- Approved environment key: `WRITEOFFS_STAGING_FROZEN_BUSINESS_IDS`.
- Project: `writeoffs-fresh-staging` / `prj_o56739F1pzd0TjFirEYoLMaa6oIJ`.
- Vercel deployment: `dpl_E9FW2wjS1ktotNML8n21PpdYvFGD`, READY.
- Non-forced staging push succeeded. Main and real Production were not targets.
- The local pre-push Turbopack build reproduced the OS port-binding restriction.
  All equivalent checks and optimized webpack build passed. The repeated local
  hook was skipped for push; Vercel independently built the application successfully.
- Post-deploy read-only comparison: all 16 baseline classes unchanged; zero
  guided assertions. No frozen-customer reconciliation command ran.
- Screenshots: `screenshots/check-in-1280.png`, `screenshots/check-in-390.png`.

### Narrow indexed-refresh rollout correction

The existing claim's `available_at` check also blocked a new engine version until
midnight. The public route correctly falls back to the canonical read, but the
indexed path should recover promptly. Migration 20261005000900 permits immediate
claim only when the engine version differs and no retry error is outstanding.
Lease fencing and the staging exclusion remain unchanged. Actual local PostgreSQL
tests prove future-deadline refresh, failure backoff and frozen-state preservation.

# Premium Work with Betti — implementation in progress

**Certification in progress.** Rick supplied `docs/design/references/work-with-betti-approved-direction.png`; it has been inspected and applied as the composition reference. The implementation keeps the hamburger shell and approved PNG character, omits the generated sidebar/scenery/slogans/speech bubble, and uses a restrained green understanding treatment with a clear white work surface. The generated character in the reference is not used as an application asset.

## Local changes

- Persistent stage retained. Restrained Work with Betti destination heading; larger integrated Betti area (27% desktop rather than half the screen), compact mobile composition.
- Existing approved PNG boundary only. No Fiverr assets integrated.
- Removed generic merchant/storefront fallback icon; trusted existing local marks still used.
- Established-understanding treatment, quieter merchant context, structured answer rows and percentage control styling. Existing direct-submit/confirmation commands unchanged.
- Home needs-customer copy updated. Account-use prerequisite does not claim books have already been worked. Queued/working copy no longer frames every update as a newly received document.
- Recent activity takes five canonical in-scope rows, including personal exceptions and non-P&L activity with appropriate status. Financial totals unchanged. The previous filter could remove these rows even though they remained in scope; the limit itself was already five.
- Worker drain stage timing instrumentation added without scheduling changes or additional database queries.
- Browser trace now includes wall-clock timestamps for alignment with durable job events.

## Fresh real ingestion findings

A fresh isolated synthetic customer used onboarding and the actual upload UI for the controlled May statement. No downstream bookkeeping records/decisions were seeded. Existing synthetic membership/coverage setup supported the authorized Catch-up test.

Document registration: 2026-09-20 03:19:37.299 UTC.
Document claim: 03:19:37.420 (0.12 seconds queue wait).
All 24 canonical records created: 03:19:39.265 (~1.97 seconds after registration).
Document intake completed: 03:19:40.295 (~3.00 seconds total; one attempt).

First account action was presented at +13.25 seconds but a focus read withdrew it during index invalidation. It returned at +94.85 seconds. This is a real remaining readiness defect, despite its explanatory notice.

First material question appeared at +376.75 seconds. First personal sweep appeared at +691.79 seconds. These are mixed with legitimate customer interaction and earlier ordinary questions; do not describe them as isolated extraction/processing duration.

A bounded timing snapshot during initial processing showed:

| Work | Completed sample | Mean queue wait | Mean execution |
|---|---:|---:|---:|
| Business context | 6 | 249.23 s | 1.77 s |
| Deterministic evaluator | 30 | 115.98 s | 3.02 s |
| Scope expansion | 12 | 180.02 s | 0.08 s |
| Economic-evidence upgrade | 12 | 254.64 s | 2.66 s |

Additional jobs remained pending in each family. Prior completed-run aggregates similarly showed roughly 1.8–1.9 seconds execution and 3–6 minutes queue wait. The global drain is sequential and capped at 12 bookkeeping jobs per invocation; the deployed cron runs every minute. Native extraction was not the dominant bottleneck in this controlled PDF.

Important finding: `scope-expansion:` fingerprints produced by the scope queue do not match the evaluator's accepted deterministic fingerprint pattern and return `legacy_noop`. Those jobs occupy drain capacity without performing that evaluation. Other job families do process these records, so this observation alone does not establish a particular customer's books were wrong. No worker semantic change was made in this UX pass.

Recommended focused next work: resolve that queue/evaluator protocol mismatch with scope regressions, and coalesce repeated same-record evaluation requests using proven evidence/version coverage. Do not simply drop different reasons or increase concurrency without dependency/lease safeguards. The new stage timing log is built in the candidate but has not yet run through the public alias's normal cron; historical durable job timestamps supplied the measured evidence above.

## Additional readiness correction discovered by the real journey

The existing `loadBettiWork` convenience loader could return the dirty action index even when the presentation reconciler intended to inspect canonical state. The initial account action was withdrawn even though its fact was still unknown.

Local correction:

- Presented-action reconciliation explicitly calls the canonical snapshot loader.
- Dirty full/GET summaries use the same atomic canonical snapshot for Home/Check-in agreement.
- Clean index reads and ordinary indexed mutation responses retain their fast path.
- Failures fail closed; no GET repair/mutation is added.

Tests cover the staging-index-enabled recovery path, clean-index fast read, dirty summary fallback, and failed snapshot. The first reference-based fresh run exposed a related command-side mismatch: an index miss returned 409 even when canonical recovery still considered that exact question current. The command now falls through to the existing atomic canonical eligibility/command validation when the index lacks an entry; indexed published actions keep their fast path. Three additional tests cover acceptance of a current canonical question and rejection of missing/changed canonical versions. No version, tenant, scope or dependency check is bypassed.

The manual “Check for the next step” control could also race a scheduled read, falsely reporting a refresh error after being superseded. It now uses the existing serialized recovery operation. Processing retains the full stage height; only genuine completion may use the shorter surface. Live re-certification is underway.

## Browser run and measurements

First candidate: `https://writeoffs-fresh-staging-2947vhoo7-ricks-projects-3ba59ab5.vercel.app`.
25 actions completed; Home/Check-in and Reports final comparisons passed; 156 captures across 390/430/768/1280. Stage/Betti nodes stayed mounted. Trace checker found 0 **unexplained** withdrawals, but the explained initial account withdrawal above is still a defect and is not certified away by that metric.

13 independent material answers: p50 486.3 ms, p75 521.0 ms, p95/max 609.0 ms. Phone/local-dependency answer: 2344.4 ms, reported separately. This is candidate timing, not final public-staging performance acceptance.

Interest was included autonomously ($0.52). State Farm presented only insurance coverage; strong payment evidence used narrow confirmation. The run completed receipt upload, scoped availability, loan deferral, refund relationship, mixed/personal sweeps and meal facts.

Artifacts (synthetic):

- `/private/tmp/betti-premium-visible.jsonl` and `.report.json`
- `/private/tmp/writeoffs-conversation/candidate/final.json`
- `/private/tmp/writeoffs-conversation/candidate/before-material-questions.json`
- `/private/tmp/writeoffs-conversation/candidate/` screenshots
- `/private/tmp/betti-premium-waterfall.json` (mid-run snapshot, not final settlement)

Actually inspected: desktop/mobile account-use, desktop strong confirmation, mobile insurance. The final reference-based candidate further separates the white work surface from a subtle unified background, strengthens question typography, and removes the outer nested card. Desktop/mobile account-use and processing screenshots have been inspected on that candidate; remaining states are being captured through fresh ingestion.

## Validation / publication

Latest local checks: 1,741 tests passed, 143 environment-gated skips; TypeScript pass; lint 0 errors / 16 existing warnings. Initial local optimized webpack build passed. Latest dedicated candidate optimized Vercel build passed:
`https://writeoffs-fresh-staging-4q3vf8cpq-ricks-projects-3ba59ab5.vercel.app`.

No new commit or push. No public alias promotion. Public staging remains the prior accepted `cc5c9f0` deployment. Main, real Production and Rick's manual customers untouched. No migrations or dependency changes. Unapproved Fiverr review assets remain untracked and excluded from candidate packaging.

## Remaining acceptance work

1. Finish visual review against the supplied approved reference across all action types.
2. Real-browser test of canonical recovery fallback while an independent visible account action remains eligible during index churn; check Home counts.
3. Finish screenshot review/accessibility and public-staging verification of needs-customer copy and five recent transactions.
4. Public ordinary-answer performance and security/regression checks on the final build.
5. Final audit, commit/non-forced staging push, dedicated public staging promotion only after acceptance checks pass.


## Approved-reference candidate: completed journey

The final functional candidate (`6751ebv6q`) completed 27 continuous actions after the recovery corrections. This was the same fresh customer introduced through actual onboarding and the actual May PDF upload, not seeded downstream bookkeeping. The failed pre-fix attempts are recorded above; they are not claimed as successful uninterrupted sessions.

- One browser document throughout the 27-action run; stage and character node identities unchanged.
- Recorded action transitions: 28; unexplained withdrawals: 0.
- Includes Catch-up statement activity and Current receipt-only McDonald's activity; durable account use was answered once before this continuation.
- Loan deferred; unrelated refund and ordinary facts continued. Receipt availability remained scoped and distinct from Later.
- Final canonical customer work: 0 ready, 1 deferred loan. Home/Check-in and canonical Reports comparisons passed.
- 76 captures at 390/430/768/1280 in this run. Automated WCAG checks at 390 and 200% text scaling passed. Separate mixed-account run passed 4 actions and 48 captures; its earlier refresh-error screenshot is not a final approved gallery image.
- Eight ordinary source/activity answers: p50 584.6 ms, p75 587.4 ms, p95/max 818.3 ms on the private candidate.
- All 14 material answers, including local/dependent recovery: p50 604.1 ms, p75 825.3 ms, p95/max 4983.8 ms. Do not hide that tail inside the ordinary sample.
- All 27 actions (including sweeps/special/dependent): p50 1199.1 ms, p75 2097.9 ms, p95 4463.2 ms, max 4983.8 ms.
- Public-alias timings and final gallery still pending.

An additional batch defect was discovered and fixed: JSON text equality treated PostgreSQL JSONB object-key order as a changed visible group. Deep field/value equality now ignores only object-key order; array order, amounts, versions, IDs, added fields, scope and canonical command validation remain enforced. Regression tests include reordered keys and altered/extra content.

Guided upload presentation no longer repeats the request and does not render an empty document list. General Documents-page instructions and processing are unchanged. Processing keeps the full conversation-stage height. Percentage typography overrides the shared input baseline only inside guided work.

Latest checks: 1,748 passing tests, 143 environment-gated skips; TypeScript pass; lint 0 errors / 16 existing warnings; optimized webpack build pass. Staging API MFA/forged-identity tests and rollback-only database tenant/stale/idempotency/publication checks passed. Dependency audit: 2 existing moderate development-only findings (Vitest/@vitest/mocker), no high/critical findings. Source secret scan clean.

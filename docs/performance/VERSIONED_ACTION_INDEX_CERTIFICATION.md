# Versioned action index — dedicated staging certification

Runtime: `fffe012fa0ff6dfd359200f9d406949527807ffe`.
Final dedicated deployment: `dpl_6R8hdQJ9gwPpGZR2zPLLFddMFUFF`.
Application code matches `fffe012`; final release additionally includes recovery
migration 009. Documentation/certification-only follow-ups do not change runtime.
Public URL: https://writeoffs-fresh-staging.vercel.app.
Project: `writeoffs-fresh-staging` / `prj_o56739F1pzd0TjFirEYoLMaa6oIJ`.
Database: dedicated staging `sgrqrrxrlglhjuetdtps`.

## Architecture and equivalence

The existing TypeScript `projectBettiWork` remains the sole eligibility and
priority engine. A leased worker publishes versioned derived actions. PostgreSQL
selects those actions; it does not reimplement the bookkeeping rules. Both Home's
full work projection and guided continuation use that selector.

An ordinary indexed answer performs four route-level DB/auth calls: authenticate,
membership, current indexed command lookup, and the atomic canonical command plus
next-action selector. The existing command still validates evidence/version and
persists its canonical facts/history. Transactional invalidation removes affected
actions; unrelated ready questions can continue. Exact retries use the original
receipt and deferral deadline. Only a confirmed deadlock rollback gets one retry.

Full canonical reconstruction moves to explicit workers, not GET/render. Missing
indexes use the existing read-only canonical bootstrap path. Dirty summaries never
justify completion/current-through claims. Actual durable refresh state explains
waiting; worker leases and revision compare-and-swap prevent stale publication.

Eight synthetic tenants passed indexed/full/narrow comparison against an
independently recomputed canonical projection at the same settled revision. The
long-session tenant additionally matched with 40 ready actions. Unit coverage
includes continuity priority, shared actions, deferrals, scope and time boundaries,
processing deadlines, and more than 1,000 actions. All sweeps refresh after local
changes because group membership can change; known independent questions remain.

### What no longer happens on each ordinary answer

- No repeated full canonical eligibility load followed by another full projection.
- No per-candidate scope/view/function reconstruction on the conversation path.
- No Home financial/document/progress universe reconstruction to return one action.
- No duplicate proxy remote auth/membership checks on the two explicitly guarded
  indexed endpoints; handlers and SQL still enforce ownership, MFA and membership.
- No request waiting for background workers.

The builder resolves canonical inputs once per publication and runs two projection
passes for base/continuity ranking, rather than one per action. Existing canonical
scope authority is unchanged. This does not relocate tax or eligibility policy to SQL.

## SQL plan evidence

Bounded read-only EXPLAIN ANALYZE, same synthetic tenant; one sample per path:

| Path | Planning | Execution | Shared buffer hits |
|---|---:|---:|---:|
| Canonical reconstruction | 0.027 ms | 606.125 ms | 24,323 |
| Indexed guided selector | 0.014 ms | 27.779 ms | 1,383 |

Both had zero physical/temp reads or writes. The outer function plan is opaque;
these are component samples, not SQL percentiles. No speculative source-table
indexes were added. The new derived entries have a tenant/priority/action ordering
index and primary keys supporting revision/identity checks.

## Dependency classes and boundaries

- **Independent next action:** commit and return a still-valid indexed action.
- **Affected/local action:** invalidate it; existing local guarded processing or
  normal reassessment establishes its follow-up. Never show an obsolete follow-up.
- **Background dependency:** return truthful pending work immediately when no
  independent action is ready. Existing bounded client continuation remains.

Contractor/deduction/reusable-fact commands retain their existing guarded paths.
Account-use and multi-record sweeps can invalidate broad dependencies and are not
misrepresented as ordinary single-record subsecond operations. Expense enrichment
moves after the response only when the matching deterministic job already exists
durably. A lost `after()` callback cannot lose the answer or its reassessment.

## Worker latency and prior service incident

The previous approximately 50-second wait included 40.56 seconds queued and 8.21
seconds executing; a dependent job then waited 3.77 seconds and ran for 2.62.
Another sample waited 15.25 seconds, ran for 5.31, then had a dependent 2.67/2.85
second wait/run. The minute cron and sequential batches of up to 12 bookkeeping
jobs contribute. Heavy synthetic initial ingestion/account setup still took
minutes; that is not included in ordinary interaction percentiles.

This change schedules the lightweight index refresh promptly after commit and
before/after heavy worker drains, with durable lease/retry recovery. It does not
claim to make OCR, account-wide reassessment or ingestion instantaneous, nor does
it change canonical bookkeeping job fan-out.

The earlier DB/Auth/REST outage cause remains **unknown**. Available provider logs
did not establish connection exhaustion, locks, CPU, memory or an experimental
query as the cause. Later healthy counters cannot prove conditions during the
incident. No restart was performed as part of this implementation.

## Measurement methodology

Only explicitly marked synthetic customers were used. Browser performance runs use
actual Chromium requests, not intercepted Node-side `route.fetch`. `renderedMs`
measures click to changed action/version DOM; `persistedMs` is click to response,
not an internal database commit timestamp. `nextVisibleMs` includes diagnostic
cross-surface reads and is deliberately not used as conversation latency.

Percentiles use nearest rank, no outliers removed. First-touch is not proof of a
Vercel cold start. Server-Timing spans overlap and must not be summed. Concurrency
tests are bounded request bursts across synthetic tenants, not claims about
100/750-customer production capacity.

## Validation and release boundary

- Full suite: **1,663 passed; 143 environment-dependent skips**.
- TypeScript passed. ESLint: zero errors, 16 existing warnings.
- Optimized local webpack and cloud Turbopack builds passed. Local pre-push
  Turbopack hit a sandbox port-binding restriction; completed separate validation
  is used instead of treating that environment failure as a passing hook.
- Deployment-archive Gitleaks passed. Dependency audit: two moderate development
  findings in Vitest/@vitest/mocker; zero high/critical. Major test-runner upgrade
  is outside this performance change.
- SQL migration rollback/security validation passed; nine additive migrations,
  `20260930000100` through `20260930000900`, applied only to dedicated staging.
- Main remains `b5712c4595d22f4be6b3866371fb9109fb21aadb`.
- Real Production unchanged. No Rick customer answers, resets, uploads, Plaid
  connections or manual bookkeeping repairs. Normal canonical background work
  remains active; certification mutations belong only to synthetic customers.

Detailed architecture/recovery contract: [VERSIONED_ACTION_INDEX.md](VERSIONED_ACTION_INDEX.md).

## Public performance results

Milliseconds; p50/p75/p95/max; no outliers excluded from their stated population.

| Measurement | n | p50 | p75 | p95 | Max |
|---|---:|---:|---:|---:|---:|
| Prior ordinary answer → next | 22 | 2,289 | 2,466 | 3,160 | 3,180 |
| Indexed ordinary answer → next independent action | 30 | **525** | 610 | **711** | 731 |
| Indexed ordinary answer → HTTP response | 30 | 536 | 626 | 722 | 735 |
| Ordinary deferral → next | 8 | 466 | 504 | 584 | 584 |
| Refund relationship steps → next | 2 | 1,074 | 1,250 | 1,250 | 1,250 |
| All 41 session actions, including shared deduction fact | 41 | 525 | 610 | 1,074 | 3,120 |
| Prior full projection | 23 | 698 | 740 | 781 | 832 |
| Indexed full projection | 23 | **288** | 326 | **390** | 401 |
| Selector RPC transport, inside projection | 23 | 39 | 43 | 46 | 50 |
| Authenticated invalid-command floor | 20 | 182 | 231 | 558 | 794 |
| Home rendered action-count marker | 7 | 1,727 | 2,054 | 2,191 | 2,191 |
| Check-in rendered action-count marker | 7 | 563 | 582 | 789 | 789 |

Ordinary acknowledgment: p50 14.5 ms, p95 16.2 ms, max 16.3 ms. The ordinary
median is **25 ms above**, not below, the 500 ms target; p95 is below one second.
The floor probe is the current authenticated stack, not a physical infrastructure
minimum. These results approach the conversation target without claiming 100 ms
end-to-end performance or hiding the remaining slower classes.

The final reusable phone-percentage answer took **3,120 ms** and 35 route calls,
then required derived recovery. It used the preserved synchronous deduction path
and had no independent next action. It is included in the all-actions row, excluded
from the explicitly independent ordinary population. That path is not converted
to the indexed canonical review-command envelope. Refund work also remains slower
than ordinary review answers; two samples are not a stable p95 estimate.

Receipt Later, measured after the recovery release: **944 ms**, seven route calls;
documentation and expenses unchanged; final 0 ready / 13 deferred actions. Account
use was measured on the candidate at approximately 730–773 ms for two answers.
Candidate loan deferrals were approximately 615/974 ms. These are **candidate**
samples, not newly repeated public answers. Public loan probes correctly declined
to bypass already-deferred synthetic work; retained principal safeguards passed.
Candidate multi-record sweep/receipt-availability steps ranged about 0.96–4.43 s.
No claim is made that all broad/shared commands now meet the ordinary budget.

### First-touch and platform overhead

First projection: 1,449 ms (application timing 362 ms); first Home: 3,522 ms;
first Check-in: 745 ms; first floor probe: 281 ms. No provider trace proves these
were cold starts. They are reported separately, not discarded as irrelevant.

The five-concurrent burst's slowest read took 1,510 ms while its application span
was 314 ms; another took 1,438 ms with a 241 ms application span. This localizes
much of those outliers outside measured handler execution, but does not prove
whether platform scheduling, connection setup or transport caused it.

### Before/after waterfall

Before: duplicate proxy authorization → handler authorization → full canonical
eligibility/context → guarded command → reconciliation → full work reconstruction
→ trimmed guided response. Approximately 12 route DB/auth calls, previously ~80
before the earlier passes; repeated per-record view/scope work dominated SQL.

Previous measured representative route (1,968 ms; nested spans not additive):

| Stage | Duration | Transport calls |
|---|---:|---:|
| Auth/business/membership | 128 ms | 3 |
| Canonical eligibility snapshot | 561 ms | 1 |
| Legacy deduction dispatch | 37 ms | 1 |
| Canonical answer transaction | 118 ms | 1 |
| Committed result hydration | ~88 ms | 4, partly parallel |
| Explicit question reconciliation | 568 ms | 1 |
| Fresh next-action input snapshot | 458 ms | 1 |

The dominant avoidable costs were eligibility reconstruction, reconciliation and
the second input snapshot, followed by duplicate authorization and hydration.
The indexed command retains the canonical commit while removing those broad reads
from the ordinary conversation path.

Representative indexed ordinary sample:

| Span | Time |
|---|---:|
| Auth | 45 ms |
| Membership | 48 ms |
| Indexed action lookup | 56 ms |
| Canonical atomic commit/history/invalidation/next selector | 199 ms |
| Entire measured handler | 361 ms |
| Actual click → next rendered | 538 ms |

These spans include nested transport and overlap. There is no separate post-answer
full projection. Across ordinary samples, handler p50/p95 were 361/502 ms. Internal
SQL persistence, trigger and selector times are not individually inferred from the
single atomic RPC; the measured SQL selector sample is in the plan section above.

## Controlled concurrency and health

Each stage was bounded and followed by provider DB/Auth/REST health checks before
increasing load. Per-tenant warm-up precedes the rows below. No 50-request
concurrency test was attempted.

| Concurrent reads | Total measured requests | p50 | p75 | p95 | Max | Errors |
|---:|---:|---:|---:|---:|---:|---:|
| 1 | 8 | 305 | 363 | 413 | 413 | 0 |
| 5 | 20 | 325 | 405 | 1,438 | 1,510 | 0 |
| 10 | 30 | 330 | 408 | 467 | 1,259 | 0 |
| 25 | 50 | 372 | 475 | **1,357** | 1,424 | 0 |

Previous 25-concurrent p95: **5,473 ms**. All sampled services remained healthy.
An initial one-request stage before per-tenant warm-up had p95/max 1,009 ms and
is retained separately. Health checks are point samples, not continuous CPU/memory
monitoring or a production-capacity guarantee. A recovery diagnostic sampled 32
connections and zero lock waiters. No evidence justifies a 100/750-user capacity claim.

## Cost and work movement

| Item | Previous path | Indexed path |
|---|---|---|
| Ordinary critical-path DB/auth calls | ~12 | 4 |
| Full projection route calls | 3 in the previous snapshot pass | 3; substantially less work inside the RPC |
| Ordinary measured handler duration | full reconstruction dominated | p50 361 ms / p95 502 ms |
| Same comparison-tenant full response | 10,259 bytes | 10,428 bytes |
| 40-action tenant full vs guided response | full universe required | 68,698 vs 2,898 bytes |
| Additional HTTP request to show returned next action | no longer needed after prior pass | none |
| Polling | existing bounded processing behavior | preserved; no faster polling loop |

This reduces **critical-path** work. Index refresh is real background work: normally
claim/prepare/read/publish plus an empty follow-up claim, with another bounded pass
if evidence changed. Leases coalesce concurrent refreshes. The endpoint's `after()`
work may still contribute to billed Vercel duration; handler response timing is not
total billed execution. No billing export was collected, so dollar savings or total
database-query reductions across all workers are not claimed. Source bookkeeping
jobs remain unchanged; the index adds derived refresh work and storage.

## Continuous session and recovery issue found during certification

The public browser handled **41 actions** without a page reload, navigation,
duplicate handled version, artificial quota stop or client error:

- 22 Current structured income answers.
- Catch-up ordinary answers and eight deferrals, naturally interleaved.
- Two refund relationship steps, followed directly by another question.
- A final reusable phone percentage followed by truthful processing.

At every action the harness compared Home/Check-in counts and Reports arithmetic.
The document time origin remained unchanged. Final processing was bounded; after
195 seconds the test recorded a truthful processing exit, **not settled success**.

Investigation found 156 unbuilt indexes ahead of the established conversation.
More importantly, project metadata proved the public alias pointed to the candidate
while the cron's deploymentId still referenced the prior `c268477` build. Alias-only
promotion had not released workers. `vercel promote` returned an already-current
409 without changing those pointers; an ordinary dedicated-staging release fixed
both. The final project target and cron now both name
`dpl_6R8hdQJ9gwPpGZR2zPLLFddMFUFF`.

Migration 009 prioritizes refreshing established indexes before dormant bootstrap,
without changing action priority or eligibility. Its rollback test proves that
ordering, active lease fencing and explicit bootstrap access. Normal cron then
published revision 2183 at 03:49:50 UTC without manually rebuilding this customer.
The recovered projection correctly exposed one new receipt opportunity and twelve
deferred actions. The public receipt-Later follow-up settled normally, without
navigation, at zero ready/thirteen deferred; no availability or expense change.

This is a corrected release/recovery defect, not evidence that a 195-second wait
is acceptable ordinary performance. Initial heavy ingestion/account reassessment
and minute-cron recovery still have separate latency budgets.

## Regression and equivalence matrix

| Contract | Evidence | Result |
|---|---|---|
| Narrow = full = independently recomputed canonical next action | Eight isolated tenants, same settled revision; repeated after migration 009 | PASS |
| Catch-up + Current, continuous 20+ actions | 41-action public browser session, unchanged document | PASS |
| Ordinary deferral continues unrelated work | Eight public deferrals | PASS |
| Personal/mixed/receipt-complete sweeps | Candidate browser sequence plus scoped SQL/unit regressions | PASS |
| Receipt Later differs from unavailable | Public follow-up; snapshot and expense equality | PASS |
| McDonald's food evidence/meal safeguards | Shared-evidence full-suite regressions; retained synthetic state | PASS |
| Client payment, transfers, card payment | Public read-only canonical inspection of 70-row synthetic ledger | PASS |
| Refund relationship reverses expense, no income | Public workflow plus both linked-refund allocation checks | PASS |
| Loan principal not expensed | Both retained synthetic loan records checked; candidate deferrals | PASS |
| Missing receipt does not remove expense | Both synthetic software expenses retained without receipt | PASS |
| Out-of-scope May evidence | Eight-fixture cross-surface harness: zero active rows/questions/P&L for excluded fixture | PASS |
| Home/Check-in agreement and Reports exact cents | Public eight-fixture harness and per-action checks | PASS |
| Account fact deduplication | Existing scoped tests and retained account-use history | PASS |
| Tenant/RLS/MFA and spoofed headers | Real public APIs, direct views/RPCs, SQL rollback tests | PASS |
| Stale write/publication and exact/changed retries | Atomic SQL rollback plus real guided API security harness | PASS |
| GET/render does not mutate canonical facts | Snapshot comparison and indexed revision comparison | PASS |
| Background index recovery | Initial failure investigated; release/priority fix and normal cron recovery verified | PASS after correction |

These evidence labels distinguish public journeys, candidate journeys, retained
state inspection and automated tests. They do not pretend every previously
completed synthetic action was answered again on public staging.

## Files and artifacts

Implementation is in `fffe012` (40 files): action-index model/worker/reader and
command adapter; guarded question route; shared work loader/response; worker drain;
proxy route policy; recovery/tenant/idempotency tests; and eight migrations.
Follow-up adds migration 009, its rollback test, certification harness options and
this report. No bookkeeping policy, report arithmetic, scope or UX redesign changed.

Private local evidence (synthetic credentials are kept out of this report):

- `/private/tmp/writeoffs-phase3-index-long/continuity-result.json`: full 41-action sequence/timings.
- `/private/tmp/writeoffs-phase3-index-public/measurements.json`: public reads/pages.
- `/private/tmp/writeoffs-phase3-index-public/receipt-later.json`: final deferral/recovery.
- `/private/tmp/writeoffs-phase3-index-ramp-{1-warm,5,10,25}/measurements.json`: load stages.
- `/private/tmp/writeoffs-phase3-index-security/browser/`: security/cross-surface assertions.
- `/private/tmp/action-index-public-final-equivalence.log`: eight-fixture equivalence.
- `/private/tmp/writeoffs-phase3-index-long/economic-regression.json`: 70-row canonical checks.
- `/private/tmp/writeoffs-phase3-index-long/browser/`: 390/430/768/1280 screenshots.
- `/private/tmp/writeoffs-phase3-index-public/receipt-later-completion-{390,430,1280}.png`.

Mobile and desktop screenshots were inspected for layout regression. There was no
visual redesign. Existing touch controls, Betti composition and merchant context
remain. Test fixture setup had two earlier failed certification attempts (processing
timeout and a concurrent-upload stale 409); neither is counted as a passing session.

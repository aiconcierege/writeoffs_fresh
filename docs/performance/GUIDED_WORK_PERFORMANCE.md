# Guided-work performance — staging investigation

Status: final-candidate functional journey passed; performance targets remain unmet.
This is an improvement report, not launch-performance acceptance. See the final
measurement section below; intermediate measurements are retained for transparency.
The first measured, equivalence-tested migration was applied to dedicated staging on September 18; no customer facts were changed.

## Measurement boundary

The prior 7.3–19.0 s / median 10.4 s metric included a projection verification read
*after* the next action was rendered. This phase records actual screen advancement
separately (`renderedMs`), verification-inclusive latency (`nextVisibleMs`), command
response and click-to-first-animation-frame acknowledgment. The acknowledgment frame
is not a persistence confirmation. No performance result implies a saved answer
until the canonical command succeeds.

Request-local Server-Timing and staging-only numeric waterfalls record database/auth
round trips, repeated resources and total request duration. No query strings,
credentials, customer answers or response data enter these diagnostics. Home and
Check-in render traces use the same request-local instrumentation. RPC duration
includes DB execution and Vercel-to-Supabase transport; SQL experiments separately
measure database execution. These are different measures.

## Measured causes

- Baseline work-context RPC cumulative staging mean approximately 750 ms, maximum
  7,376 ms; not a clean single-tenant percentile. Each projection reads it twice.
- Synthetic steady database timings: base context 58–63 ms; guided enrichment
  316–356 ms; complete context 424–429 ms. Guided fingerprinting repeatedly rebuilt
  the same canonical transaction view. Special deferrals rebuilt it again.
- Each canonical review question hydrated its record, source, decision, allocations,
  financial source and Plaid state independently. Observed requests reached 113
  database/auth calls and ~9.9 s when the consistency bracket retried.
- Deduction, contractor and review loaders serialized independent work and repeated
  authentication/business resolution. Resolution evidence was loaded twice.
- Guided answers then issued a reconciliation POST and a separate projection GET,
  each repeating authentication and membership work.
- Seven-second fixed polling added latency during brief processing and spent reads
  while customers considered a ready question.

## First optimization set

- Preserve context fingerprints exactly but reuse already-read rows. Preserve null
  versions for out-of-scope rows. Seven synthetic tenant snapshots match exactly.
  Transaction-local before/after experiment: context ~424–429 ms -> ~142–159 ms.
- Bounded tenant-scoped review hydration: six queries per <=100-record batch instead
  of approximately six per record. Preserve all allocations, financial authority,
  provider-current checks, missing-source failures and bounded capacity safeguards.
- Restrict answer-time hydration to the relevant issue; canonical eligibility and
  stale/evidence checks remain in place.
- Parallel independent question reads; reuse convergence read within that load.
- Reuse authentication/client/membership data only inside one request. No question,
  decision or work-projection cache; no cross-request customer cache.
- Optional guided command response includes reconciled canonical work. Non-guided
  callers remain compatible. A continuation failure never converts a committed
  answer into a reported failed write; existing read-only recovery remains.
- Pure deferrals need no question generation. Read their durable event in the fresh
  projection. Completed factual answers retain reconciliation.
- One reconciliation RPC runs the same three canonical commands in the same order.
- Bounded processing polling starts at 500 ms, backs off and stops when real processing settles.
  No arbitrary action quota. Focus still refreshes; stale writes remain rejected.
- Immediate accessible “Saving your answer…” acknowledgment does not claim success.

## Safety / database experiments

Experiments run inside BEGIN/ROLLBACK on dedicated staging, using only marked
synthetic customer contexts. No customer facts are modified by equivalence tests.
One initial candidate changed out-of-scope null review versions into hashes. The
seven-tenant differential test caught it before persistent application; fixed with
an explicit null guard. All seven contexts then matched, including version hashes.
No speculative indexes were added. No tax, categorization, loan, refund, scope,
receipt matching or evidence rules are changed.

## Artifact locations (private; do not publish fixture credentials)

- `/private/tmp/guided-performance-baseline-reads.json`
- `/private/tmp/guided-performance-before-runtime.jsonl`
- `/private/tmp/guided-perf-context-timing.json`
- `/private/tmp/guided-perf-equivalence.json`
- `/private/tmp/writeoffs-phase3-performance-baseline/continuity-result.json`

The following intermediate runs are retained, including failures and outliers.
The final-candidate results below supersede their deployment/validation status.

## Intermediate measurements (not final acceptance)

Nearest-rank percentiles; milliseconds. The baseline action sample combines action
classes, so it must not be presented as a simple-answer-only result.

| Sample | n | p50 | p75 | p95 | max |
|---|---:|---:|---:|---:|---:|
| Baseline action HTTP response | 14 | 3,463 | 4,753 | 7,288 | 7,288 |
| Baseline actual next state rendered | 14 | 7,619 | 8,694 | 19,584 | 19,584 |
| Baseline warm projection, fixed synthetic tenant | 11 | 2,243 | 2,315 | 3,266 | 3,266 |
| SQL-only warm projection, same tenant | 11 | 1,684 | 1,833 | 2,822 | 2,822 |
| Optimized warm projection, same unchanged baseline tenant | 23 | 1,338 | 1,523 | 1,759 | 2,034 |
| Optimized warm projection, separate synthetic fixture | 23 | 745 | 791 | 927 | 2,431 |
| Optimized Home, separate fixture | 7 | 2,174 | 2,713 | 7,885 | 7,885 |
| Optimized Check-in, separate fixture | 7 | 1,175 | 1,219 | 1,326 | 1,326 |

The baseline journey also encountered projection consistency 503s and a 30-second
read timeout. These are failures, not omitted successful timing samples. The first
optimized candidate browser attempt hit Vercel deployment protection; it performed
no customer answers. Deployment access was corrected without changing application
MFA or protection configuration.

### Bounded read concurrency

Six existing marked synthetic tenants; read-only bursts, not a production-capacity
claim. Cohort labels are planning assumptions, not simulated distinct customers.

| Planning cohort | Concurrent reads | Requests | p50 | p95 | max | HTTP failures |
|---|---:|---:|---:|---:|---:|---:|
| 25 | 2 | 8 | 946 | 1,140 | 1,140 | 0 |
| 100 | 8 | 24 | 1,279 | 1,500 | 2,138 | 0 |
| 750 | 25 | 50 | 3,645 | 6,255 | 6,934 | 0 |

The ramp stopped at the >5-second p95 safety threshold. This identifies saturation;
it does not certify the 750-customer target. No billing or infrastructure limits
were changed.

### Integration correction found during this phase

The combined answer response initially omitted the Check-in transaction priority
hint. It now preserves a valid same-origin Check-in entry context. Tenant/scope
eligibility remains canonical; foreign or malformed hints are ignored. Regression
coverage checks these cases. This does not filter the session to one transaction.

### Intermediate validation and deployment status

Local full suite: 1,616 passed, 143 environment-dependent skipped. TypeScript and
optimized webpack build passed before the final small priority-context change;
focused priority tests pass. ESLint has 16 existing warnings and no errors.
Dependency audit reports two moderate development-tool advisories, no high/critical
findings. Secret scan and diff checks passed on the first implementation.

Dedicated staging migration 20260928000100 is applied. Optimized candidate reads
are measured. The final priority-context deployment and full final browser/security
regression remain pending. Vercel accepted deployments but repeatedly held them in
its system build queue; this is not evidence of an application build failure.

Do not treat these partial results as achieving the sub-second interaction target.

### Real staging security / cross-surface checks

The optimized candidate passed authenticated synthetic checks for tenant isolation
(including direct view/RPC attempts), MFA, immutable replay, changed replay rejection,
stale version rejection and no GET/render mutation. Six retained synthetic scenarios
agree between Home, Check-in and work projection counts. Transactions contain unique
canonical rows; Reports categorized + uncategorized cents equal working expenses.
The no-catch-up/out-of-scope fixture retains 24 older evidence records while exposing
zero active ledger rows, zero questions and zero income/expense/profit.

These are real retained-state regression checks, not a claim that every fresh
mutation journey has been rerun. Artifacts: private synthetic
`/private/tmp/writeoffs-phase3-final/browser/security.json` and
`/private/tmp/writeoffs-phase3-final/browser/cross-surfaces.json`.

### First optimized long-session sample

The Home-entry run handled 25 consecutive actions without a Home round trip. Its
final processing transition did **not** complete certification: a test selector
expected an action-version element that is intentionally absent during processing.
The harness now reads the persistent work container and records null versions.
All timing samples below precede that failed final assertion; they are not a claim
that the full run passed.

| Sample | n | p50 | p75 | p95 | max |
|---|---:|---:|---:|---:|---:|
| Answer response, all action types | 25 | 2,853 | 4,807 | 9,485 | 10,907 |
| Actual next-state render, all types | 25 | 2,859 | 4,819 | 9,493 | 10,926 |
| Deferral next-state render | 10 | 2,687 | 6,254 | 9,493 | 9,493 |
| Special-workflow next-state render | 6 | 1,717 | 1,865 | 1,965 | 1,965 |
| Completed ordinary-question next render | 3 | 7,495 | 10,926 | 10,926 | 10,926 |
| Visible pending feedback at next frame | 25 | 14.6 | 15.8 | 16.6 | 17.0 |

Unlike the original acknowledgment frame proxy, this run asserts that a disabled
submit control or visible Saving status exists at that frame. It does not call a
pending answer saved.

The tail overlapped separate synthetic document preparation, so it is not an
isolated warm-only action distribution. Preserve the slow samples rather than
removing them. A reassessment job queued during the run was normally consumed after
5 minutes 24 seconds. This is background queue latency, not persistence latency.
Cron invocation logs show the normal worker running; no manual drain was used.

An authenticated EXPLAIN for the source-convergence query measured 25.6 ms planning
and 0.47 ms execution, versus a 2.1-second application fetch sample. That evidence
does not justify a speculative index and does not prove which transport/pool/service
component caused the difference.

### Additional changes included in the final candidate

- Read receipt evidence, receipt display metadata, financial transactions and Plaid
  current-state evidence concurrently after their common source/link input loads.
- Avoid loading the full expense evidence graph after a canonically committed
  personal/excluded or nonnegative-money decision. These are existing no-op cases
  in the downstream expense processor; expense/tax rules are unchanged.
- Final harness exercises receipt Later separately from current receipt completion,
  asserts unchanged documentation availability/decision identity, and records a
  truthful long-processing exit rather than pretending workers have settled.

No independent-action speculative fast path was enabled. Existing dependency
metadata identifies jobs and record context, but is not by itself a complete proof
that a previously read action survives every new reusable customer fact. Commands
still return a fresh canonical projection; no stale action cache is used.

### Cost observations

A successful guided continuation uses one browser command request instead of a
command plus reconciliation POST plus projection GET. Recovery still performs
explicit reads when necessary. The same three reconciliation commands execute in
one RPC, not three network requests. Pure deferrals skip unrelated question creation.
Review hydration is bounded by <=100-record batches. Unchanged baseline-tenant
projection payload remains 10,259 bytes; no payload reduction is claimed. Processing
polling is capped at twelve automatic reads with backoff and stops once real processing
settles. Ready independent work remains visible during those reads. No always-on customer-state cache or new background worker was introduced.
The staging timing logs themselves add temporary diagnostic logging volume.

### Processing-refresh regression caught before promotion

The first polling optimization stopped whenever a ready action appeared. During
account reassessment, a partial ready sweep could therefore stop refreshing while
other records joined its canonical version. The synthetic transaction-entry run
caught the resulting display/projection version mismatch before promotion.

The corrected client keeps bounded refreshes running while actual processing
exists, even with an independent ready action visible. It performs at most twelve
reads per action/recovery burst, backs off to 30 seconds, and has no settled-state
idle polling. Unit coverage proves the ready action stays visible, the first update
is timely, the read count is bounded, and settled ready work incurs no polling.
The corrected final real-browser run subsequently passed, including automatic
continuation after genuine processing; see the final results below.

## Final corrected candidate — September 18, 2026

### Outcome and acceptance boundary

The safe improvements are functionally certified, but **the launch performance
acceptance target is not achieved**. Pending feedback is immediate; ordinary
answers still take seconds. Do not describe this release as sub-second bookkeeping
or as certified for 750 customers.

Runtime source: `96ee3ffa6b94f9f68a5e7a23d846bce98b7b5a1b`.
Candidate: `https://writeoffs-fresh-staging-1lim1suy1-ricks-projects-3ba59ab5.vercel.app`.
Deployment: `dpl_GEUDbMtFzahkmAYMzqiqgc61TKFW`, verified READY in project
`prj_o56739F1pzd0TjFirEYoLMaa6oIJ` / `writeoffs-fresh-staging`.
All runtime app/utils/config files were compared with the deployment archive.
Its Vercel target is named production **within the dedicated staging project**;
real WriteOffs Production is untouched.

### Final before/after distributions

Nearest-rank percentiles, milliseconds. Baseline actions n=14; final actions n=27.
These are comparable controlled journeys, not identical action-mix samples.
Read comparisons use the same unchanged synthetic tenant and 10,259-byte payload.
Home/Check-in timing ends when the authenticated action-count element is present;
it is not an LCP/Core Web Vitals measurement.

| Measurement | Version / n | p50 | p75 | p95 | max |
|---|---|---:|---:|---:|---:|
| All-action HTTP response | Baseline / 14 | 3,463 | 4,753 | 7,288 | 7,288 |
| All-action HTTP response | Final / 27 | 2,671 | 3,054 | 4,319 | 5,154 |
| Actual next state visible | Baseline / 14 | 7,619 | 8,694 | 19,584 | 19,584 |
| Actual next state visible | Final / 27 | 2,681 | 3,074 | 4,331 | 5,171 |
| Completed ordinary question response | Final / 3 | 3,062 | 4,319 | 4,319 | 4,319 |
| Completed ordinary question next state | Final / 3 | 3,077 | 4,331 | 4,331 | 4,331 |
| Deferral next state | Final / 14 | 2,538 | 2,796 | 3,468 | 3,468 |
| Special workflow next state | Final / 6 | 1,664 | 1,750 | 2,030 | 2,030 |
| Actual visible pending acknowledgment | Final / 27 | 14.8 | 15.8 | 16.7 | 17.7 |
| Warm projection GET | Baseline / 11 | 2,243 | 2,315 | 3,266 | 3,266 |
| Warm projection GET | Final / 23 | 925 | 1,025 | 1,051 | 1,076 |
| Warm Home load | Baseline / 3 | 3,147 | 3,646 | 3,646 | 3,646 |
| Warm Home load | Final / 7 | 1,873 | 2,466 | 2,805 | 2,805 |
| Warm Check-in load | Baseline / 3 | 2,264 | 2,436 | 2,436 | 2,436 |
| Warm Check-in load | Final / 7 | 1,292 | 1,381 | 1,823 | 1,823 |

Next-state median improved ~65% on the directly instrumented journey. Matched warm
projection median improved ~59%. The user's original 10.4-second median included
post-render verification and must not be compared as if its measurement boundary
were identical. It remains the reported original 7.3–19.0-second range.

The legacy artifact field `persistedMs` means click-to-HTTP-response. It includes
continuation work and is **not the database commit timestamp**. Canonical command
and persistence RPC spans are recorded separately, but a reliable commit-only
p50/p95 is not claimed. The browser harness forwards real API calls through
Playwright routing to capture responses/timing, which adds measurement overhead.
No mocked successful bookkeeping responses are used.

First-touch observations on the final unchanged tenant: projection 1,634 ms,
Home 1,916 ms, Check-in 1,945 ms. These are **not proven platform cold starts**.
There is no defensible cold-start distribution in this sample. Warm repeated reads
are isolated from the load ramp; the heterogeneous action journey includes normal
worker activity and must not be called an isolated warm-only distribution.

One actual processing dependency took 50,298 ms to settle and resumed automatically
with zero manual check clicks. It is not comparable to the earlier ~13.4-second
brief-processing example: different queued work was involved. The earlier optimized
run also recorded a normal worker queue delay of 5m24s. Background latency remains
an issue, not a success metric hidden inside answer timing.

### Timing waterfalls

Before: click -> command HTTP response -> separate reconciliation POST -> separate
projection GET -> render. A representative old full projection took 9,894 ms and
113 database/auth calls. Context RPCs occupied 237–1,841 ms and 6,413–9,891 ms;
record/decision hydration calls around 4,445–5,724 ms overlapped. Do not sum overlapping
spans. The old journey's median command response was 3,463 ms versus 7,619 ms render.

After: click -> pending feedback (~15 ms) -> canonical command -> reconciliation
when required -> fresh canonical projection in that same response -> render.
Representative final action waterfalls (ms, not summed cross-action medians):

| Action | Canonical command | Reconcile | Next projection | Server total | HTTP response | Render |
|---|---:|---:|---:|---:|---:|---:|
| Personal sweep, Current | 1,198 | 227 | 826 | 2,252 | 2,718 | 2,734 |
| Mixed sweep, Current | 1,112 | 185 | 718 | 2,016 | 2,546 | 2,567 |
| Receipt upload-stage continuation | 1,072 | 247 | 727 | 2,048 | 2,506 | 2,515 |
| Receipt Later, final scoped group | 1,011 | 0 | 762 | 1,774 | 2,133 | 2,150 |
| Receipt availability confirmation | 1,761 | 192 | 756 | 2,709 | 3,124 | 3,130 |
| Refund nature, Current | 394 | 214 | 655 | 1,265 | 1,696 | 1,711 |
| Loan document deferral, Current | 239 | 0 | 757 | 998 | 1,368 | 1,389 |
| Ordinary income answer, Catch-up | 1,676 | 241 | 739 | 2,657 | 3,054 | 3,077 |
| Ordinary question deferral | 1,502 | 0 | 852 | 2,354 | 2,731 | 2,738 |

Final command log samples use 31–82 database/auth calls, median 78, depending on
command type. Representative auth fetches were 32–57 ms. Pure projection construction
was ~1–4 ms: sorting/rendering is not the principal bottleneck. Transport, canonical
eligibility reads and sequential command/projection work dominate.

Both synthetic account-use facts were saved before the final uninterrupted run:
response/render 1,905/1,927 ms and 2,452/2,467 ms. Their interrupted setup attempt is
retained separately; it is not silently counted as part of the final session.

Structured income, account-use, personal/mixed, ordinary question, deferral, receipt
Later/completion, refund and loan-deferral paths were exercised against staging.
Home and Check-in page/projection loads were measured. A separate repeated
Home-button-click-to-Check-in-visible distribution was not collected; the earlier
25-action run entered through Home, while the final run used transaction context.
Small per-type sample counts do not support stable production p95 estimates.

### What remains synchronous, and why

Authentication/MFA, tenant/scope ownership, current action/version eligibility,
canonical fact and history persistence, necessary decision work, question
reconciliation for new facts, and a current canonical next-action projection remain
in the request. The before/after context consistency bracket remains intact.

This phase removed redundant work and avoided known no-op expense evidence loads.
It did **not** move correctness-required reassessment into a fire-and-forget promise,
pretend a saved answer was settled, or infer that cached questions were independent.
Only pure deferrals skip question creation; the optimization is bound to each
route's validated deferral field, preventing an unrelated request field from
bypassing reconciliation. Commands parsing continuation metadata do so after the
canonical authenticated command has succeeded.

Remaining ranked costs:

1. Ordinary commands validate against a full canonical work read, then load it
   again for continuation. Final ordinary deferral command ~1.5s plus next projection
   ~0.85s illustrates the avoidable future architectural cost.
2. Projection inputs still require dozens of authenticated database calls and two
   consistency-bracketing context reads. Request-local parallelism helps but does
   not eliminate transport and pool overhead.
3. Decision/evidence enrichment and required reconciliation still execute before
   the final response for factual answers.
4. Normal background queue scheduling can take tens of seconds or minutes.
5. Warm Home still loads more than the work projection. Client rendering after a
   successful response is generally tens of milliseconds, not the main delay.

The next performance work should consolidate canonical command eligibility and
post-command dependency/version data transactionally, then prove an independent
next-action contract before returning a smaller continuation. It must retain tenant,
scope, history and stale-write checks. Query count/transport should be remeasured
before adding indexes or buying capacity. No speculative indexes or paid capacity
changes were made here.

### Final bounded concurrency sanity check

Six synthetic tenants, read-only bursts; not 25/100/750 distinct concurrent users.
Assumption: one command per active user per 30s gives ~0.83/3.33/25 commands/s,
but these read bursts are only directional probes, not a command-throughput test.

| Planning cohort | Concurrent reads | Requests | p50 | p75 | p95 | max | HTTP failures |
|---|---:|---:|---:|---:|---:|---:|---:|
| 25 | 2 | 8 | 690 | 754 | 934 | 934 | 0 |
| 100 | 8 | 24 | 1,006 | 1,140 | 1,317 | 1,414 | 0 |
| 750 | 25 | 50 | 3,143 | 4,473 | 5,309 | 6,177 | 0 |

The final ramp again stopped at the >5s p95 threshold. No claim of 750-customer
capacity is made. The smaller final load tenant's sequential warm projection was
614 ms median / 701 ms p95; do not substitute that for the matched-baseline result.

### Functional certification

| Scenario | Result | Evidence / limitation |
|---|---|---|
| Continuous Catch-up + Current | PASS | 27 actions, no browser navigation resets, no unnecessary stops |
| Business-only personal/mixed sweeps | PASS | Canonical scoped commands, account facts retained |
| Mixed account exact allocation | PASS | Fresh synthetic $130 business / $245 owner-use aggregate; test resumed after a harness failure |
| Receipt Later vs all-I-have | PASS | Later preserved decision/document availability; scoped completion separate |
| Restaurant receipt evidence | PASS | Fresh receipt-only item asked relationship and purpose, not what was bought; $9.54 working expense |
| Client-payment automation | PASS | Read-only final canonical state remains business income |
| Transfers / credit-card payment | PASS | Explicit fixture movements remain excluded/non-P&L |
| Refund relationship | PASS | Two confirmed $32.10 reversals remain refunds, not revenue |
| Loan deferral | PASS | Two $450 payments remain unresolved without invented business allocations |
| Missing receipt | PASS | Software business/category allocations retained without receipts |
| Out-of-scope evidence | PASS | 24 retained records; zero active ledger/questions/P&L |
| Home / Check-in / Reports | PASS | Counts agree; categories + uncategorized = expenses; income - expenses = profit |
| Stale writes / retry / MFA / tenants | PASS | Final staging direct RPC/view and API checks |
| GET/render mutation | PASS | Canonical before/after snapshots unchanged |
| Processing continuation | PASS | Real 50.3s wait, resumed automatically; no indefinite polling |
| Responsive browser | PASS | 390/430/768/1280 screenshots, no browser errors or horizontal overflow |
| Sub-second next action / projection targets | NOT MET | Do not mark performance acceptance complete |
| 750-customer capacity | NOT CERTIFIED | Read-ramp p95 exceeded 5s |

Final session ended with 0 ready actions, 14 deferred actions and 0 processing jobs.
All 53 captured bookkeeping HTTP responses were 200. There were zero page errors.
A new receipt scope became eligible after the last answer's reassessment; it was a
new versioned scope, not re-answering the earlier deferred snapshot.

The fresh mixed/meal regressions ran on the same optimized backend before the final
polling and deferral-boundary hardening. Final security/state checks and the 27-action
journey ran on the exact final runtime. No claim is made that every fresh setup was
rerun from signup on that exact deployment.

### Final continuous action sequence

| # | Type | Workstream | Outcome | Next canonical action | Render ms |
|---:|---|---|---|---|---:|
| 1 | personal_exception_sweep | catch_up | completed | mixed_use_sweep / catch_up | 5171 |
| 2 | mixed_use_sweep | catch_up | completed | receipt_upload_sweep / catch_up | 3850 |
| 3 | receipt_upload_sweep | catch_up | deferred | special_transaction / catch_up | 2681 |
| 4 | special_transaction | catch_up | deferred | special_transaction / current | 1554 |
| 5 | special_transaction | current | deferred | special_transaction / catch_up | 1389 |
| 6 | special_transaction | catch_up | completed | special_transaction / catch_up | 1750 |
| 7 | special_transaction | catch_up | completed | personal_exception_sweep / current | 1664 |
| 8 | personal_exception_sweep | current | completed | mixed_use_sweep / current | 2734 |
| 9 | mixed_use_sweep | current | completed | receipt_upload_sweep / current | 2567 |
| 10 | receipt_upload_sweep | current | completed | receipt_availability / current | 2515 |
| 11 | receipt_availability | current | completed | material_question / current | 3130 |
| 12 | material_question | current | completed | special_transaction / current | 3074 |
| 13 | special_transaction | current | completed | special_transaction / current | 1711 |
| 14 | special_transaction | current | completed | material_question / catch_up | 2030 |
| 15 | material_question | catch_up | completed | material_question / catch_up | 3077 |
| 16 | material_question | catch_up | deferred | material_question / catch_up | 3468 |
| 17 | material_question | catch_up | deferred | material_question / catch_up | 2796 |
| 18 | material_question | catch_up | deferred | material_question / catch_up | 2782 |
| 19 | material_question | catch_up | deferred | material_question / catch_up | 2852 |
| 20 | material_question | catch_up | deferred | material_question / catch_up | 2489 |
| 21 | material_question | catch_up | deferred | material_question / catch_up | 2538 |
| 22 | material_question | catch_up | deferred | material_question / catch_up | 2441 |
| 23 | material_question | catch_up | deferred | material_question / catch_up | 3021 |
| 24 | material_question | catch_up | deferred | material_question / catch_up | 2385 |
| 25 | material_question | catch_up | deferred | material_question / catch_up | 2738 |
| 26 | material_question | catch_up | completed | Processing / no ready action | 4331 |
| 27 | receipt_upload_sweep | catch_up | deferred | Only deferred work remains | 2150 |

### Validation and changes

- Full suite: **1,622 passed; 143 environment-dependent skipped**. Skips are not passes.
- TypeScript: passed on final runtime source.
- Optimized local webpack build: passed; final runtime remote optimized build: READY.
- ESLint: no errors, 16 pre-existing repository warnings; changed harness lint checked.
- Dependency audit: two moderate development-tool advisories (Vitest/mocker), zero
  high/critical. No dependency changes or misleading clean-audit claim.
- Gitleaks: seven implementation commits scanned, no leaks; final report/harness
  commit receives the final scan too.
- `git diff --check`: passed.
- Migration: `20260928000100_reduce_work_context_repeated_reads.sql`, dedicated
  staging only. Seven-tenant exact context/version equivalence and transaction-local
  rollback experiments passed; rollback SQL is provided. No customer-data backfill.

Changed runtime areas: performance/request instrumentation; Supabase client and
request-local identity/membership reuse; review hydration and question readers;
work loader; guided command wrapper and five mutation/read route families;
GuidedWork, QuestionFlow, SpecialTransactionFlow, account-use request helper;
Home/Check-in render instrumentation; answered-expense no-op guard. Test and
certification harness changes cover batching, continuation recovery, polling,
deferral-field validation, identity/context and evidence no-op behavior.

Exact changed paths relative to accepted continuity commit:

```text
app/api/bookkeeping/accounts/[id]/use/route.ts
app/api/bookkeeping/questions/[id]/route.ts
app/api/bookkeeping/questions/reconcile/route.ts
app/api/bookkeeping/records/[id]/special/route.ts
app/api/bookkeeping/work/answer/route.ts
app/api/bookkeeping/work/route.ts
app/check-in/page.tsx
app/components/SpecialTransactionFlow.tsx
app/components/guided/GuidedWork.tsx
app/home/page.tsx
app/lib/bookkeeping/account-use-request.ts
app/lib/bookkeeping/answered-expense-classification.ts
app/lib/bookkeeping/betti-work-loader.ts
app/lib/bookkeeping/customer-question-actions.ts
app/lib/bookkeeping/customer-questions.ts
app/lib/bookkeeping/customer-work.ts
app/lib/bookkeeping/guided-command-response.ts
app/lib/bookkeeping/review-events.ts
app/lib/bookkeeping/review-queue.ts
app/lib/bookkeeping/supabase-repository.ts
app/lib/membership/entitlements.ts
app/lib/performance/request-identity.ts
app/lib/performance/request-timing.ts
app/questions/QuestionFlow.tsx
docs/performance/GUIDED_WORK_PERFORMANCE.md
docs/performance/guided-performance-rollback.sql
scripts/certify-guided-corrections-staging.mjs
scripts/certify-guided-work-staging.mjs
scripts/lib/certify-guided-continuity.mjs
scripts/measure-guided-performance-staging.mjs
supabase/migrations/20260928000100_reduce_work_context_repeated_reads.sql
tests/bookkeeping/answered-expense-classification.test.ts
tests/bookkeeping/guided-command-response.test.ts
tests/bookkeeping/guided-processing-recovery.test.ts
tests/bookkeeping/guided-response-recovery.test.ts
tests/bookkeeping/request-timing.test.ts
tests/bookkeeping/review-queue-batching.test.ts
utils/supabase/admin.ts
utils/supabase/server.ts
```

### Private evidence / screenshots

These paths are local artifacts, not public customer-data downloads. Fixture files
contain synthetic credentials and must not be published.

- Final journey: `/private/tmp/writeoffs-phase3-performance-final/continuity-result.json`
- Final unchanged-tenant reads: `/private/tmp/writeoffs-phase3-performance-final-reads/measurements.json`
- Final load sanity: `/private/tmp/writeoffs-phase3-performance-final-load/measurements.json`
- Final command waterfalls: `/private/tmp/guided-perf-final-command-runtime.jsonl`
- Final security / cross-surfaces: `/private/tmp/writeoffs-phase3-final/browser/security.json`
  and `cross-surfaces.json`
- Final economic read-back: `/private/tmp/writeoffs-phase3-performance-final/economic-regression.json`
- Fresh meal/mixed results: `/private/tmp/writeoffs-phase3-performance-regressions/browser/results.json`
- Screenshots: `/private/tmp/writeoffs-phase3-performance-final/browser/` (56 images).
  Representative names: `material_question-390.png`, `material_question-1280.png`,
  `genuine-processing-430.png`, `only-deferred-completion-1280.png`,
  `loan-document-request-1280.png`, `home-catch-up-status-1280.png`.

Rick's test customers were not answered, reset, repaired, uploaded to or connected
to Plaid. Main and real Production remain untouched. No large UX, Reports or
vehicle/mileage redesign was started.

### Staging promotion

The verified final candidate was promoted to
`https://writeoffs-fresh-staging.vercel.app` on September 18, 2026. The alias command
succeeded and its target is `dpl_GEUDbMtFzahkmAYMzqiqgc61TKFW`. Public-alias
authenticated read measurements are recorded separately in
`/private/tmp/writeoffs-phase3-performance-public-reads/measurements.json`.
This promotion makes the validated improvement available; it does not change the
NOT MET performance acceptance result above.

### Public staging alias verification and outliers

After promotion, the unchanged baseline tenant was measured again through
`writeoffs-fresh-staging.vercel.app`, with no concurrent synthetic load ramp.
All projection requests succeeded and Home/Check-in loaded without test errors.
These slower observations are retained; the candidate URL sample is not a guarantee
of public-alias latency. No causal claim about alias routing or platform load is
supported by this comparison alone.

| Public-alias warm measurement | n | p50 ms | p75 ms | p95 ms | max ms |
|---|---:|---:|---:|---:|---:|
| Projection GET | 23 | 1,459 | 1,925 | 2,128 | 4,500 |
| Home load | 7 | 2,262 | 2,329 | 2,386 | 2,386 |
| Check-in load | 7 | 1,161 | 1,191 | 1,538 | 1,538 |

Compared with the matched original projection median of 2,243 ms, this public-alias
sample improves ~35%, versus ~59% in the final candidate sample. Both miss the
projection targets. The 4.5-second outlier reinforces that latency variability
remains unresolved. This report does not declare the performance phase accepted.

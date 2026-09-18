# Guided-work performance, pass 2

Status: **certification blocked by dedicated-staging database unavailability. Performance targets are not met.** Runtime c268477 is deployed to public dedicated staging; this is not a completed/launch-ready performance release.

## Architecture

`read_betti_work_inputs(business, as_of)` is a tenant/MFA-checked, SECURITY INVOKER,
read-only STABLE input transport. It calls the existing canonical context and
question eligibility functions and supplies bounded read-model rows in one database
statement snapshot. Existing TypeScript question/evidence/scope/guided-stage and
priority selectors remain authoritative. No rules are duplicated in a SQL selector.

A strict read-only repository adapter lets those same readers consume the snapshot.
Unsupported reads, missing columns/tables, foreign rows and capacity overflow fail
closed. It has no mutations, network fallback or cross-request cache. Snapshot
inputs stay server-side; they are not returned as a customer projection.

The ordinary command's validated input snapshot is reused for review hydration and
eligibility confirmation. Canonical write RPCs still validate current
issue/decision/evidence versions under their original locks. A successful answer
still produces a fresh post-command snapshot, not a stale cached next question.

`guidedWorkProjection` returns the exact canonical next action, action counts,
processing/readiness and presentation context, without the full action universe,
job list or source-coverage diagnostics. Initial full work and the narrow response
share a structural presentation contract. Home remains a full canonical consumer.
The narrow DTO reduces transfer/serialization; pure projection CPU was already
only ~1–4 ms, so the principal gain is transport consolidation and read reuse.

PostgreSQL documents that STABLE functions read the calling statement's MVCC
snapshot. This replaces the former multiple-network-call before/after consistency
bracket with a database snapshot, not with weaker consistency.
[PostgreSQL function volatility](https://www.postgresql.org/docs/current/xfunc-volatility.html).
Experimental SQL wall-clock timing was removed from the final STABLE result; only
canonical input data is returned. Timing remains in request diagnostics and separate
SQL profiling.

## Initial differential staging evidence

Eight retained marked synthetic tenants/states: full new projection exactly equals
the reference; narrow next action/count exactly equals full. One includes 13 ready
actions; another retains out-of-scope historical evidence with zero active work.
Direct cross-business and AAL1 reads are rejected.

Initial application-side loader sample: 15–28 network reads -> 1 RPC; 0.7–1.4s ->
0.24–0.52s. These are not public browser latency claims. The RPC still executes
multiple canonical SQL reads; one round trip does not mean one database operation.

## Previous processing wait

Read-only job timestamps for the prior synthetic 50-second transition:

| Job | Queue delay | Execution | Attempts |
|---|---:|---:|---:|
| Initial reassessment | 40.562s | 8.212s | 1 |
| Dependent reassessment | 3.767s | 2.622s | 1 |

The current one-minute drain also processes lifecycle/documents before bookkeeping
and respects one live processing job per business. No retry caused this sample.
Ordinary percentage/evidence answers can create this work, so this is not solely
an ingestion edge case. No worker-dispatch policy was changed in this pass so far.
A targeted post-command worker wake-up needs separate bounded lease/retry/cost
validation; unrelated ready customer actions continue under canonical dependencies.

## Migration and rollback

- `20260929000100_atomic_betti_work_inputs.sql`: additive staging input snapshot.
- `20260929000200_stable_work_input_contract.sql`: removes experimental timing
  fields, retaining identical canonical rows and security.
- No indexes, customer facts, history, classification, tax rules or backfill changed.
- Rollback: restore prior application (`2baaa00`) first, then remove the additive
  function. Existing functions and data were not replaced.

Public measurements and release identity are recorded below. Final additional
regressions were interrupted by database unavailability; do not interpret this
report as completed certification.

## Security and equivalence boundaries

The command's pre-write snapshot is reused only to hydrate/validate its current
question. It is never reused as the post-write next-action projection. The write
RPC's original row locks and expected-event/evidence checks remain authoritative.
The post-write read is fresh, under a new single-statement snapshot. A dependency
still processing cannot become actionable simply because an older question row
exists. No command is acknowledged as saved before its canonical write succeeds.

There is no global/customer cache and no authorization cache across requests.
The proxy and route still independently enforce their existing boundaries. Staging
headers now distinguish proxy time/call count from route time/call count. Transport
counts include Supabase Auth calls; they are not claims about SQL statement counts.

The narrow guided DTO is a projection of the full canonical result, not an
independent selector. Scope, account prerequisites, deferral, processing gates,
evidence eligibility, shared-action deduplication and priority all run once through
the same domain functions. Home retains its full result. Financial totals were
already outside this work projection; they were not removed or weakened here.

## Remaining sequential path

Ordinary command:

1. Proxy authentication/membership boundary.
2. Route identity/business/membership resolution (request-local reuse).
3. Atomic canonical eligibility input read; canonical domain selection.
4. Existing current-action/version validation and canonical write.
5. Required local reassessment, when applicable.
6. Existing explicit question reconciliation for a successful factual answer.
7. Fresh atomic canonical input read; canonical next-action selection.
8. Narrow guided response and in-place render.

Deferrals skip factual question reconciliation because they supply no new fact.
Account-use writes schedule account-scoped reassessment. Sweeps write their scoped
assertion/individual facts through the existing guarded command. Refund relationship
writes retain their cap, ownership and allocation safeguards. A phone percentage
can require dependent reassessment; it is not included in the ordinary-ready-action
latency population when there is no next ready action.

### What was not moved into SQL

Moving priority alone into a SQL function would not remove the expensive eligibility
reconstruction and could duplicate TypeScript evidence/scope rules. The chosen SQL
primitive consolidates inputs; domain policy remains in one place. It reduces
network round trips but does not pretend that returning a smaller DTO eliminates
all database work.

A separate read-only EXPLAIN ANALYZE sample on the retained 28-record synthetic
fixture took 490.423ms inside PostgreSQL, with 22,623 shared-buffer hits and zero
physical/shared reads, writes or temporary reads. This is one sample, not a
percentile or proof of a hardware floor. It points to repeated view/function
execution rather than missing disk cache. The opaque function plan does not prove
that a particular index is missing; no speculative indexes were added.

## Certification methodology

Public URL: `https://writeoffs-fresh-staging.vercel.app`.
Runtime candidate: `c26847740ba8c5ccee115873f7eb36e3b87de840`.
Dedicated project: `writeoffs-fresh-staging` / `prj_o56739F1pzd0TjFirEYoLMaa6oIJ`.
Deployment: `dpl_yVTZn4xTLBrqH8p9fP2xVCCt6rYK`.

A new isolated synthetic customer uses the controlled May statement, concurrent
current work and twenty additional ambiguous incoming amounts, uploaded through
normal statement intake. Those extra samples are answered as explicit synthetic
customer facts; the classifier is not given a test-only rule. No Rick account is
used or changed. Initial account answers and their broad reassessment are recorded
separately from the subsequent continuous session.

The preparation run exposed a test-comparison race: the test demanded a fixed old
count within 15 seconds while workers were advancing the queue and the client was
using its existing bounded processing backoff. The harness now compares a stable
before/after bracket and requires display convergence within a bounded interval.
It neither reloads the conversation nor bypasses a failed answer. The original
failure and account-action timings are retained. No product workaround was added.

`persistedMs` in the legacy harness means click-to-HTTP-response, which includes
continuation work; it is **not** a database-commit timestamp. `renderedMs` measures
the next visible state. `nextVisibleMs` additionally includes diagnostic reads and
is not used for interaction percentiles. Nested Server-Timing spans overlap; their
sum is not total wall-clock time. First-touch is reported separately and is not
called a proven cold start.

## Public-staging measurements

All values below are milliseconds, nearest-rank percentiles. No outliers removed.
The 47-action run used 48 financial records versus 28 in the earlier 27-action run;
its extra twenty ambiguous incoming payments improve sample size but mean this is
not an identical action mix. The projection/page read comparison uses the **same
unchanged 28-record tenant**, with an identical 10,259-byte full response size.

| Measurement | Pass | n | p50 | p75 | p95 | Max |
|---|---|---:|---:|---:|---:|---:|
| All action → visible transition | 1 | 27 | 2,681 | 3,074 | 4,331 | 5,171 |
| All action → visible transition | 2 | 47 | 2,213 | 2,466 | 3,656 | 4,199 |
| Simple answer → ready question | 1 | 2 | 3,074 | 3,077 | 3,077 | 3,077 |
| Simple answer → ready question | 2 | 22 | 2,289 | 2,466 | 3,160 | 3,180 |
| Simple answer → HTTP response | 2 | 22 | 2,277 | 2,446 | 3,154 | 3,169 |
| Deferral → next visible state | 1 | 13 | 2,681 | 2,796 | 3,468 | 3,468 |
| Deferral → next visible state | 2 | 13 | 1,643 | 1,725 | 4,199 | 4,199 |
| Special workflow → next visible state | 1 | 6 | 1,664 | 1,750 | 2,030 | 2,030 |
| Special workflow → next visible state | 2 | 6 | 1,538 | 2,096 | 2,298 | 2,298 |
| Full projection GET, warm | 1 | 23 | 1,459 | 1,925 | 2,128 | 4,500 |
| Full projection GET, warm | 2 | 23 | 697 | 740 | 781 | 832 |
| Home, warm | 1 | 7 | 2,262 | 2,329 | 2,386 | 2,386 |
| Home, warm | 2 | 7 | 1,880 | 2,259 | 2,302 | 2,302 |
| Check-in initial page, warm | 1 | 7 | 1,161 | 1,191 | 1,538 | 1,538 |
| Check-in initial page, warm | 2 | 7 | 1,016 | 1,105 | 1,122 | 1,122 |

Acknowledgment: n=47, p50 15.1ms, p75 16.0ms, p95 16.5ms, max 17.7ms.
The phone-percentage processing-dependent answer was excluded from the simple
ready-question sample. The all-action row includes its immediate processing screen,
not a claim that reassessment completed in that time. Special-workflow transition
measurements mark the new guided state appearing; a special panel may then fetch
its detailed controls. They are not a certified fully-interactive special-panel
latency. These limitations do not explain away the 1.8s median ordinary server time.

First-touch, **not proven cold**: projection 896ms, Home 1,986ms, Check-in 852ms.
Platform cold-start telemetry was not available for a reliable cold/warm split.
We did not induce a deployment/restart and label arbitrary first requests as cold.

### Concurrency

Bounded reads across eight existing marked synthetic tenants, including the matched
28-record customer, smaller settled customers, an out-of-scope customer and one
with 13 ready actions. These are concurrent requests, not customer capacity claims.

| Concurrent reads | Requests | p50 | p75 | p95 | Max | HTTP failures |
|---:|---:|---:|---:|---:|---:|---:|
| 1 | 8 | 524 | 587 | 688 | 688 | 0 |
| 5 | 20 | 586 | 756 | 802 | 875 | 0 |
| 10 | 30 | 826 | 970 | 1,758 | 2,299 | 0 |
| 25 | 50 | 1,888 | 3,258 | 5,473 | 6,044 | 0 |

The 25-read stage failed the latency guard (>5s p95), although every request returned
200. No 50-request concurrency stage was attempted. Compared with the earlier
5.31s p95 at 25, this is **not a concurrency improvement**; tenant mix also differs.

At 25, route p95 was 4,790ms and canonical-input RPC p95 was 4,611ms; proxy p95
was 293ms. Pure question selection/projection construction remained single-digit
milliseconds at p95. At concurrency 1, input-RPC p95 was 333ms; at 5 it was 465ms;
at 10 it was 707ms. The slowdown is concentrated in the Supabase input invocation,
not browser rendering or application sorting. These timings cannot independently
separate database CPU from PostgREST/connection-pool waiting. Provider CPU/pool
telemetry is required before claiming a hardware-capacity diagnosis or buying a
larger tier. Request traces identify `sfo1::iad1`; Vercel functions are in `iad1`.
No region or paid infrastructure configuration was changed.

## Ordinary-path waterfalls

Representative prior ordinary income answer: 2,594ms route, 80 Supabase calls,
3,074ms visible transition. Its eligibility path read context twice around question
hydration; action handling then loaded the same review inputs again. After the write,
a second full context/question/context bracket ran for continuation.

| Prior stage | Milliseconds |
|---|---:|
| Route auth/business/membership before first context | ~143 |
| First context | 218 |
| Question input/eligibility hydration | 328 |
| Consistency context reread | 237 |
| Remaining command validation/write/result hydration | ~645 |
| Explicit question reconciliation | 260 |
| Next full projection | 760 |
| Proxy/network/browser residual | ~480 |

Representative new ordinary income answer: 1,968ms route, 12 Supabase calls.
Actual span order (not sums of overlapping aggregate headers):

| Stage | Start in route | Duration | Transport calls |
|---|---:|---:|---:|
| Auth | 1 | 34 | 1 |
| Business | 36 | 42 | 1 |
| Membership | 79 | 52 | 1 |
| Canonical eligibility input snapshot | 131 | 561 | 1 |
| Question selection + work construction | 692 | 2 | 0 |
| Legacy deduction dispatch lookup | 695 | 37 | 1 |
| Current action hydration from validated snapshot | 731 | <1 | 0 |
| Canonical answer/version/evidence/history transaction RPC | 732 | 118 | 1 |
| Committed review/decision/allocation hydration | 851 | ~88 | 4 (partly parallel) |
| Local expense reassessment, income example | 939 | <1 | 0 |
| Explicit question reconciliation | 940 | 568 | 1 |
| Fresh next-action input snapshot | 1,508 | 458 | 1 |
| Canonical next selection/construction | 1,966 | 2 | 0 |

Across 22 ordinary answers, median route time was 1,827ms; command eligibility 593ms,
answer validation/commit/result hydration 380ms, reconciliation 338ms, and next
projection 466ms. The two input reads together had a median of 969ms. Medians of
components need not add to the median request. Proxy is separate (~200ms typical
for mutations); client/transport adds further time. Parsing/serialization are
included in residual time, not separately measurable SQL transaction stages.
History/event writes and stale-version checks are inside the existing atomic RPC;
we did not split that transaction merely to manufacture separate timing numbers.

### Projection waterfall

For the matched tenant's 23 warm reads: median route 402ms; auth 40ms, membership
41ms, atomic input read 312ms, question selection 0.2ms, construction 0.4ms.
Median proxy was 96ms; public end-to-end median was 697ms. Exactly three route
transport calls plus one proxy Auth call were observed per read. Full response
size remained 10,259 bytes. The broader financial snapshot remains its existing
canonical service; removing it from orchestration cannot save time because it was
not being recomputed in this endpoint.

## Further measured finding and operational blocker

A more detailed tenant-scoped `customer_transaction_work` EXPLAIN used the existing
`bookkeeping_records_business_date_idx`; no missing basic business/date index was
identified. The 28-row index scan spent 228ms with the per-row
`bookkeeping_date_is_active(business_id, occurred_on)` filter. SELECT-all also
executed two question-set functions 28 times (about 130ms and 24ms total). The latter
SELECT-all costs are diagnostic, not proof that every projected-column context
read executes those unused fields. This identifies repeated canonical scope and
question-set reconstruction as a concrete next target, not an index shopping list.

A candidate was prepared to reuse the existing owner/MFA-guarded context's
`authorizedScope.authorizedStart` in the context decoration join. It preserves the
existing date predicate and calls no new scope authority. It was tested only as an
intended BEGIN/ROLLBACK experiment, **not applied as a migration**. The experiment
returned a connection-timeout response, with no equivalence results. The unapplied
candidate is outside the migrations directory at
`/private/tmp/perf2-scope-candidate-unapplied.sql`. Verify database function/ledger
state after recovery before doing any further experiment. No third migration was
committed or intentionally applied.

At approximately 23:21–23:25 UTC September 18, follow-up tests began timing out.
Subsequent Management API checks reported Database, Auth and REST UNHEALTHY,
including “Failed to connect to database.” Diagnostic SQL also returned connection
timeouts (HTTP 544); the metrics endpoint returned HTTP 522. The control-plane
project status still said ACTIVE_HEALTHY, which did not reflect service health.
Bounded provider failure-log queries returned no matching records; they do not
establish that no failure occurred. All test traffic was stopped. The cause is not
yet established: do not blame a particular query, exhausted credits, an OOM, or a
provider-wide outage without evidence.

A restart of **only** project `sgrqrrxrlglhjuetdtps` was requested from Rick because
repository instructions require approval for external-service changes. No restart,
resize, paid-tier change, data reset, deletion, or Production action has been taken.
Supabase documents database overload as one possible cause of unhealthy services
and a restart as a possible recovery step; that guidance is not a diagnosis of
this incident. [Supabase unhealthy-service guidance](https://supabase.com/docs/guides/troubleshooting/project-status-reports-unhealthy-services).

## Validation status at the interruption

| Check | Result |
|---|---|
| Full local suite | 1,638 passed; 143 environment-dependent tests skipped |
| TypeScript | PASS |
| ESLint | 0 errors; 16 existing warnings |
| Optimized local build | PASS |
| Dedicated staging candidate builds | READY |
| Dependency audit | 2 moderate development advisories; 0 high/critical |
| Gitleaks committed runtime range | PASS; no leaks |
| Diff whitespace check | PASS |
| Eight-state old/new canonical projection differential | PASS |
| Narrow/full next action and count equivalence | PASS |
| Cross-tenant, AAL1/MFA denial, stale/changed retry rejection | PASS on real candidate |
| Read/replay/rejected-request bookkeeping immutability | PASS on real candidate |
| Home/Check-in/Reports/ledger stable-snapshot comparisons | PASS across retained fixtures and 47-action observations |
| Out-of-scope evidence | PASS; 24 retained historical records, zero active ledger/actions/P&L |
| 48-record income/transfer/card/refund/loan/receipt-expense audit | PASS |
| 47-action conversation | All actions reached truthful deferred-only end; final harness navigation assertion failed on a same-URL history event |
| Navigation diagnosis | 3 read-only reproductions: same-URL hydration history event, zero document requests, unchanged document time origin |
| Corrected strict document-navigation 20-action follow-up | INTERRUPTED after 8 successful actions by database timeouts; not certified |
| Fresh mixed/receipt-recovery and McDonald's journeys | INTERRUPTED by database timeouts; not certified |
| Performance targets | FAIL |
| 25-read latency guard | FAIL (all HTTP requests nevertheless succeeded) |

The navigation harness now distinguishes browser history replacement from an actual
document request, changed route or changed document lifetime. A separate stale
receipt fault-injection URL was corrected to include `?view=guided`; the first
attempt had not actually injected its intended error. Fresh reruns were started,
but database unavailability prevented completing them. These are reported as
incomplete, not converted into passing test results.

## Costs and unresolved decision

- Ordinary route transport calls: observed 80 -> 12 (plus unchanged proxy checks).
- Canonical input loader: 15–28 calls -> 1 RPC; full work GET now 3 route calls.
- Full projection payload: unchanged 10,259 bytes for the matched tenant.
- Representative 13-action guided DTO: 24,213 -> 1,919 bytes; eligibility unchanged.
- One mutation response still carries continuation; no extra per-answer endpoint
  was added. The existing bounded processing polling schedule is unchanged.
- No extra bookkeeping jobs or per-read mutations were introduced.
- Warm full projection route median: about 402ms after consolidation; public
  end-to-end median 697ms. Actual billed Vercel units/dollars were not measured.
- Database SQL work did not shrink in proportion to HTTP call count. Concurrency
  remains unacceptable, so query-count savings must not be called capacity gains.

First recover staging and verify the rolled-back experiment, then finish the
interrupted correctness checks and test the measured per-record scope reuse.
If those bounded SQL improvements still cannot approach the targets, the next
architectural choice is a maintained, versioned canonical action read model versus
continued on-demand history/view reconstruction. Such a read model must be fed by
the **same** eligibility code, invalidate affected actions transactionally, retain
scope/evidence dependencies, fail closed when stale, and serve Home and Check-in
from one definition. It must not become an independently cached “fast queue.”
That larger change has not been implemented or presented as already approved.

Main, real Production, and Rick's customer facts were not directly modified.
No large UX/polish work was started.

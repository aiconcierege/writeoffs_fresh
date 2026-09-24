# Final targeted canonical-fallback review

## Decision

**Customer #2 may resume manual clean-room testing without further performance work in this session.**

This is practical acceptance for continued testing, not a claim that every latency target is met. The product owner accepted the general routine-path improvements and explicitly limited this review to the demonstrated purchase-purpose fallback. No application, database or runtime-configuration change was made in this review. No customer action or new synthetic evidence was submitted.

## Exact hosted evidence

The two existing synthetic requests were retrieved from Vercel by their exact request paths. Both returned HTTP 200 on application `8e3d9618eed530f1a2a69b8211045ee0c980338d`, with **45 database calls each**. See [duration-only waterfalls](targeted-fallback-waterfalls.json).

| Stage | 3.77-second example | 4.70-second example |
|---|---:|---:|
| Initial authentication and membership | 125 ms | 158 ms |
| Indexed-question lookup (fallback required) | 65 ms | 95 ms |
| Canonical eligibility/context | 791 ms | 442 ms |
| Deduction-attention lookup | 50 ms | 51 ms |
| Answer validation, durable RPC and result hydration | 335 ms | 494 ms |
| Affected-expense category enrichment | 1,917 ms | 2,551 ms |
| Authoritative next-action snapshot | 270 ms | 664 ms |
| Other handler/selection overhead | about 7 ms | about 8 ms |
| **Server total** | **3,560 ms** | **4,462 ms** |
| Outside handler through observed next turn | 205 ms | 239 ms |
| **Browser action to next turn** | **3,765 ms** | **4,701 ms** |

The second authentication call is inside the answer adapter and therefore inside the answer-validation row. Timings for overlapping database calls must not be summed independently.

### Inside category enrichment (subcomponents, not additional totals)

| Subcomponent | 3.77-second example | 4.70-second example |
|---|---:|---:|
| Authenticated record ownership read | 43 ms | 52 ms |
| Canonical evidence hydration | about 1,233 ms | about 1,719 ms |
| Category service source/current-decision validation | about 302 ms | about 331 ms |
| Atomic category/allocations append RPC | 169 ms | 222 ms |
| Read back committed category decision/allocations | about 98 ms | about 117 ms |
| Exact-decision durable-job verification | 69 ms | 105 ms |

## Root cause and stopping boundary

The dominant cost is the dependency waterfall through canonical evidence and category validation, followed by an authoritative post-write snapshot. The category insert itself is not the dominant cost. Tax reassessment is already outside these requests after verified durable job publication; these traces contain no synchronous second tax-assessment pass.

The evidence loader resolves receipt/source convergence and active identity, reads the current decision and allocations, then assembles financial-source, account-use, nearby-movement, document and answer evidence. The category service rechecks the active source amount and current decision before the guarded append. The final snapshot is after writes and cannot be replaced with the pre-answer snapshot or an optimistic queue.

Those repeated resource names are not evidence that every read is interchangeable: they occur at different validation boundaries. The inspected source/current-decision reads cannot simply be replaced by the earlier classification snapshot without changing and proving freshness guarantees. No per-transaction N+1 loop, redundant post-answer dirty-index read, or synchronous tax reassessment was demonstrated in these two final requests. No deadlock retry was present. Provider SQL execution versus database-network/queue wait is not individually measured here, so this review does not invent a contention diagnosis.

Small parallel-read or identity-cache opportunities would not establish removal of the dominant cost. A material consolidation of the shared evidence/category validation path would need separate consistency/race coverage; it was not undertaken during this bounded final pass. This is not a claim that the architecture can never be made faster.

**No further application optimization or deployment was made.** The existing exact-decision job safeguard, durable category write, stale rejection and authoritative next-turn behavior remain intact. Accordingly there is no new before/after performance claim: the measured 3.765/4.701-second samples remain the applicable fallback observations.

## Correctness and verification

- Existing final hosted fallback control: two purpose answers, percentage and exception sweep all returned successfully; each next turn matched the authoritative response without intermediate flashes. Settled controlled totals were income $5,360.96, expenses $1,656.40, profit $3,704.56.
- The prior six-customer/94-action run, category/financial results and concurrent retry evidence remain valid; they were not repeated because there was no application change.
- Targeted regression suite rerun: **84 tests passed across seven files**, covering answer routing, category enrichment, durable queue guards, indexed commands and authoritative continuation. No financial/category behavior was edited.
- Both clean-room customers remain unchanged from the accepted pass across all 102 captured tenant tables. Customer #1 worker exclusion remains enabled. Customer #2 remains on CASH DEPOSIT, May 16, 2026, $600, “What was this money from?”, projection revision 840.
- Dedicated staging remains READY at `8e3d9618eed530f1a2a69b8211045ee0c980338d`. Documentation-only commits after that SHA do not change deployed application code. No push occurred.

## Explicit open pre-launch performance items

1. **Canonical purchase-purpose fallback:** the 3.77–4.70-second path and its shared evidence/category-validation waterfall.
2. **Remaining routine tails:** the existing report includes purchase-purpose p95 3.57 s, refund p95 2.67 s, Stripe/Jane p95 2.49 s, and other small-sample tails. General routine performance is accepted for continued manual testing, not universally sub-second.
3. **Receipt affected-record reassessment:** **46-second median / 71-second p95**, separate from fast receipt acknowledgment. No attempt was made to optimize it here.
4. **Document processing:** extraction, splitting, matching and special-document analysis remain separately measurable pre-launch work, including the earlier approximately 59-second loan-document case. The small two-receipt upload samples are not representative of every document class.
5. Hosted pre-launch timing certification should distinguish server response, actual click-to-visible-turn, durable upload acknowledgment, document analysis, and affected-record reassessment, with larger samples by action/document type.

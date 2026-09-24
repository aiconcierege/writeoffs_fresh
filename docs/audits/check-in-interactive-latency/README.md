# Check-in interactive latency — staging only

**Latest follow-up:** the product owner accepted general routine latency for continued manual testing. The [final targeted fallback review](targeted-fallback-closeout.md) approves resuming Customer #2 while retaining the performance items below. The original measured results and earlier latency-target determination remain historical evidence.

## Scope and preservation

This pass does not answer or rebuild either clean-room customer. Customer #1's staging worker exclusion remains enabled. Customer #2 remains on **CASH DEPOSIT — May 16, 2026 — $600 — “What was this money from?”**. Private before/after captures compare 102 tenant-scoped tables, including stored projections and answer history. No public repository push is authorized in this pass.

## Demonstrated bottlenecks

- **Business-only exception sweep:** the prior hosted 2.64-second response included a 1.28-second canonical grouped command. It read each complete transaction-work row for validation, read it again for its version, and read it again when constructing a no-exceptions acknowledgment. Complete rows also evaluated unrelated tenant-wide question-status functions.
- **Receipt opportunity:** the previously labeled 5.19-second “receipt acknowledgment” was actually **“I don’t have any”**, not file upload. Its atomic command validated every purchase, then delegated to the existing documentation writer, which reloaded each complete row in two further loops. This is distinct from OCR or matching.
- **Actual upload:** storage verification, document registration and durable job creation already precede the response; analysis is scheduled with `after()` and recovered by the durable worker. The browser additionally awaited a nonessential document-list refresh before notifying the active Check-in turn. A slow or failed list read could delay or misreport an already successful registration.
- **Stripe/Jane hypotheses:** observed canonical commits were about 0.22–0.30 seconds in the earlier sample. Authorization, indexed-action lookup, the authoritative post-answer snapshot, and time outside the handler account for the rest. No evidence established invoice-link traversal or enrichment as the specific bottleneck; those financial paths were not altered.

## Corrections

1. Reuse the locked transaction row for version validation, preserving the exact hash inputs and owner/MFA checks. The helper is not executable by anon, authenticated or service-role callers.
2. After full atomic validation, an all-business exception response constructs its acknowledgment set-wise. Selected personal exceptions still invoke the original canonical correction functions.
3. Read only fields actually consumed by grouped commands. Full-row `SELECT *` needlessly evaluated question-status functions. A synthetic staging EXPLAIN sample measured roughly 392 ms execution for the full row versus 19 ms for the required columns. These are query samples, not interaction percentiles.
4. Load the bounded receipt-availability group once under the existing record locks. Preserve per-item version checks, documentation events, retry equality, and all-or-nothing failure.
5. Notify Check-in after durable document registration without waiting for the document-list refresh. Refresh failure cannot turn registered files into failed uploads. Processing/completion still require their existing verified states and deliberate continuation.
6. On the canonical answer fallback, replace a redundant full-record/evidence hydration with an authenticated RLS identity read. The following canonical snapshot still verifies active source/convergence state and loads the required evidence. A hosted insurance fallback had spent 5.1 seconds in affected-expense reassessment.
7. Allow deferred tax reassessment only when an exact-decision durable processing job exists and all business allocations already have categories. Missing categories, follow-up questions, failed queue proof, or mismatched ownership retain synchronous completion; a worker must not impersonate the customer to append missing categories.
8. After the required customer-authorized category append, check the durable job for that newly categorized decision before reloading the full graph for tax reassessment. A missing/failed proof or paused processing keeps the complete synchronous path. This removes no factual write and relies on the existing persisted worker job, not a best-effort callback.
9. Instrument document registration separately from storage verification and background analysis, using safe duration-only diagnostics.

The initial row-reuse candidate inadvertently forced complete-row evaluation through the public version wrapper. Hosted profiling caught that; the final migration restores the original narrow public version expression. Exploratory samples are excluded from the final performance population.

## Synchronous boundary

Authentication, authorization, stale-version validation, durable canonical writes and the authoritative next-turn read remain synchronous. No success is fabricated before commit. Exactly-once and invoice/refund relationships are unchanged. Canonical next-turn determination is not replaced by an optimistic client queue.

Report rendering and broad reassessment are not added to the blocking answer path. Existing durable downstream processing remains asynchronous where the canonical command already establishes a safe dependency boundary. Actual document analysis remains separate from “received” acknowledgment.

## Validation

- Full Vitest run: 2,067 passed, 143 environment-dependent tests skipped.
- TypeScript and optimized webpack build passed.
- Lint: no errors; 15 pre-existing warnings.
- Eleven deterministic real-component browser document scenarios passed, including slow/failed list refresh, processing failure, refresh recovery, mobile/reduced motion and no intermediate question flash.
- Local rollback-only SQL: grouped eight-purchase stale rejection, exactly-once retry, no financial change on all-business/no-receipt responses, selected-personal correction, helper access denial, version equivalence, receipt lifecycle, uncertainty and allocation queue behavior passed.
- The legacy routing SQL test hard-coded engine v3. Its fixture now derives the current reader version and verifies command-version agreement; current routing, worker exclusion and lease fencing pass.

## Measurement method

Final measurements use six separate synthetic May-statement customers with fresh answers, after preliminary preparation has settled. Earlier exploratory runs are not pooled with final results. Browser figures measure click through committed next-turn visibility; server figures use `Server-Timing: total`. Visible acknowledgment is observed independently. Small-sample p95 values are descriptive, not population-level confidence claims.

Actual upload measurements separately report storage response, document registration/queue response, visible receipt acknowledgment, and later processing completion. Provider-side bytes-received time and extraction/matching sub-stages are not claimed where they are not separately instrumented.

Final hosted measurements and preservation verification are complete. **Routine conversational-latency acceptance remains NO / PARTIAL.** The preferred sub-second median and sub-two-second p95 are not consistently met.

A forced canonical-fallback control under concurrent synthetic preparation returned HTTP 200 after 17.225 seconds (75 database calls), after the browser had aborted. Durable persistence was not lost. This diagnostic is retained separately, not pooled with ordinary-path samples. It demonstrated the post-category second graph read addressed by the final correction; it is not evidence that all fallback tails are eliminated.

## Final hosted results

Application SHA: `8e3d9618eed530f1a2a69b8211045ee0c980338d`. Dedicated staging deployment: `dpl_D7sxfYRdBUmCLcVAEYYsji5E95Ej`. No public push.

Six fresh synthetic customers, 94 measured actions, alternating 390/1280 px, reduced motion. All responses succeeded and all observed next-turn transitions matched the authoritative response without intermediate actions. Browser timing starts just before Playwright dispatches the click; recorded request-start offsets were small but are retained in the raw evidence. Visible acknowledgment was measured from the actual DOM click event. These are small clustered samples, not statistical confidence claims.

| Action | n | Server p50 / p95 (s) | Browser action → next p50 / p95 (s) |
|---|---:|---:|---:|
| receipt_none | 6 | 1.71 / 2.89 | 2.32 / 3.59 |
| special_deferral | 6 | 0.93 / 1.79 | 1.37 / 2.24 |
| refund_confirmation | 6 | 1.39 / 2.22 | 1.87 / 2.67 |
| outgoing_classification | 6 | 0.98 / 1.95 | 1.20 / 2.25 |
| incoming_classification | 12 | 0.83 / 1.32 | 1.08 / 1.92 |
| deferral | 6 | 0.84 / 1.47 | 1.04 / 1.71 |
| uncertainty | 12 | 1.06 / 1.74 | 1.30 / 2.01 |
| hypothesis_confirmation | 12 | 0.95 / 2.06 | 1.16 / 2.49 |
| purchase_purpose | 10 | 0.79 / 3.37 | 1.04 / 3.57 |
| insurance | 6 | 1.08 / 1.74 | 1.28 / 2.00 |
| percentage | 6 | 0.98 / 1.45 | 1.19 / 1.65 |
| exception_sweep | 6 | 1.16 / 1.70 | 1.65 / 2.10 |

See [raw duration-only results](hosted-performance.json). The grouped command is substantially cheaper, but authentication, command validation, the authoritative next-action snapshot and transport still contribute. The Stripe/Jane financial commit itself is generally cheap; this pass did not establish unnecessary invoice traversal as a cause and did not change linkage semantics.

The forced canonical fallback was separately tested on the final build. Two purpose transitions completed in 4.70 and 3.77 seconds. Required category appends committed before exact-decision queued reassessment; no second synchronous tax graph was loaded. This remains a slow fallback, not a sub-second success claim. See [fallback control](hosted-fallback-final.json) and [earlier diagnostic](fallback-diagnostic.json). The earlier 17.225-second control occurred under preparation load and involved a different remaining question, so it is not a controlled same-question speed comparison.

## Actual upload timing

Six uploads used the existing two-receipt PDF. All produced two receipt parts and two matching links. No upload was repeated to recover diagnostics.

| Stage | n | p50 / p95 (s) | Clock basis |
|---|---:|---:|---|
| Stored | 6 | 0.79 / 1.18 | From browser upload start |
| Registered and queued | 6 | 1.61 / 2.23 | From browser upload start; one atomic registration transaction |
| Received acknowledgment visible | 6 | 1.61 / 2.23 | From browser upload start |
| Document processing complete | 5 | 6.13 / 8.30 | Browser polling observation from upload start |
| Registration → document job complete | 6 | 4.46 / 8.48 | Provider database timestamps |
| Affected-record reassessment ready | 5 | 46.00 / 71.33 | Browser observer/polling from upload start |

The first post-upload diagnostic mistakenly requested `created_at` on document links; the schema uses `linked_at`. Receipt acknowledgment was already recorded successfully. The existing upload was inspected read-only, and its processing-completion browser duration is excluded; provider timestamps are retained. The diagnostic now names failing stages, uses the correct field, and checkpoints results before later reads. [Upload evidence](hosted-upload-performance.json) includes extraction/link event offsets. Bytes received inside the storage provider are not independently instrumented. The roughly 59-second earlier loan-processing case was not rerun or pooled here.

## Correctness and preservation

- All six routine fixtures settled at income $5,360.96, expenses $1,656.40, profit $3,704.56 for the specified synthetic answers; 24 imported transactions each, one refund relationship each, no duplicate answer predecessors/request IDs. Some sessions included an additional legitimate purchase-purpose follow-up; we did not pretend their answer histories were identical. [Evidence](hosted-settled-correctness.json).
- Concurrent grouped and refund retries preserved existing facts; conflicting/stale requests were rejected and anonymous refund access returned 401. [Grouped retries](hosted-group-replay.json), [refund retries](hosted-refund-replay.json).
- Both clean-room customers: **all 102 captured tenant tables unchanged**, including answer history and projections. Customer #1 exclusion remains enabled. Customer #2 remains at CASH DEPOSIT, May 16, 2026, $600, “What was this money from?”, projection revision 840. [Final preservation](preservation-final.json).
- Final application validation: 2,067 tests passed, 143 environment-dependent tests skipped; TypeScript, lint and optimized build passed, with 15 existing lint warnings. Secret scan of the five application commits and new correction passed; diff check passed. Subsequent diagnostic-only edits passed TypeScript/lint. Duplicate byte-identical generated `.next/types/* 2.ts` files were removed before the final diagnostic typecheck; no source files were removed.

No clean-room answer, upload, projection rebuild or worker-exclusion change was performed. No public push or real Production change was performed.

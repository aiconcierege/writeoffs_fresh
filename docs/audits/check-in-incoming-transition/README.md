# Incoming uncertainty: delay and invisible transaction advancement

## Read-only clean-room findings

Emily Carter uncertainty persisted once, 2026-09-23 20:00:32.974333 UTC,
answer sequence 3 followed by resolved sequence 4. The canonical next transaction
is ZELLE FROM ROBERT HALL, May 7, +$425, “What was this money for?” Emily has no
remaining actionable question. No client render trace was retained, so the exact
pixels in Rick's browser are not independently observable. The durable state and
canonical projection establish successful advancement to a different transaction.

One HTTP 200 answer request is present in the inspected log interval; no retry or
timeout is shown. Server duration was 10,417 ms with 33 database calls. Indexed
commit completed around 460 ms. Most delay followed commit in the expense evidence
read graph: receipt/convergence reads, record hydration, then document/business
context reads. Final canonical input read took 336 ms. It was not a ten-second
projection publication wait. Published revision remains 712, built at 18:50:22;
answer invalidation advanced revision to 727. The worker exclusion remains active.

## Corrections

- Explicit uncertainty on an unresolved, unallocated movement bypasses expense
  enrichment. It supplies no expense fact. The atomic persistence and canonical
  next-action read are unchanged. Established-expense and factual-answer enrichment
  remain unchanged.
- Pending submission has viewport-visible live feedback immediately; the submitting
  component remains mounted. Successful-save checking remains visible until the
  authoritative continuation commits.
- The new question receives focus without implicit browser scrolling. If its merchant
  context is outside the viewport, the page positions that context below the header.
  Already-visible context does not jump. Reduced-motion uses nonanimated positioning.

## Validation

Local real-component browser regression covers desktop/mobile, scrolled-down start,
keyboard, reduced motion, held slow response, exactly one synthetic request, no
intermediate action, visible next merchant, focus, and stable refresh. Initial feedback
appeared within 6–42 ms in the recorded run. These local responses are deliberately
simulated; hosted persistence evidence is recorded separately after deployment.

Full suite: 1,947 passed, 143 environment-dependent skipped. TypeScript and optimized
build passed. Lint has zero errors and 16 existing warnings. Secret/diff checks passed.
No changes to Rick's answers, records, projection or exclusion are authorized here.

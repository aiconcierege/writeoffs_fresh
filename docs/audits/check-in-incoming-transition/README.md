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

## Hosted result and preservation

Application commit `feafaf0a6f44d67ee161125e8a27934bf15b74e6`, dedicated staging
project `writeoffs-fresh-staging`, deployment `dpl_27smTrjLRATwCzSNPenBMLCDL8W3`.
Three real synthetic incoming uncertainty submissions passed; the first two advanced
Emily → Robert → Blue Mesa using identical question templates. Normal deferral
commands postponed unrelated questions only for the tagged synthetic fixture; this
is a transition test, not a new certification of eligibility after all those deferrals.

Each answer persisted once with unresolved economic nature and zero allocations.
Server durations were 766.5, 806.1 and 840.7 ms; browser-observed response durations
were 989, 1017 and 989 ms. Saving feedback appeared within 11–38 ms. The harness held
responses for at least 800 ms to verify visible feedback. Desktop/mobile merchant
context was visible after advancement and reload; keyboard/reduced motion passed.
No intermediate action appeared. Screenshots were visually inspected.

The final read-only comparison matched all 102 captured clean-room tables exactly
against the post-Emily baseline. No customer answer, event, decision, source evidence,
projection or exclusion changed during this correction. Rick's authoritative next
question remains Robert Hall, May 7, +$425, “What was this money for?”

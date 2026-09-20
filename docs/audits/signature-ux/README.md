# Signature UX — Home, Work with Betti and Reports

Date: September 20, 2026. Public dedicated staging: https://writeoffs-fresh-staging.vercel.app

## Status

Implemented and deployed for visual review. Financial reconciliation, final accessibility checks and ordinary independent-action performance passed. **The fresh-ingestion journey is not an unqualified pass:** four personal-sweep submissions correctly received stale-version rejections while background work was changing their groups. The first automated run stopped at its fourth-rejection guard after 21 successful actions. That evidence is retained, not erased by the successful continuation.

The transition-contrast problem discovered during the first resumption was fixed in this pass. A second resumption completed the remaining work successfully. No bookkeeping/action-index/worker architecture was changed to obtain these results.

## Changes

### Home

Kept the accepted hero, financial snapshot, utilities, layout and five latest in-scope transactions. Refined state language:

| Canonical situation | Owner / presentation |
| --- | --- |
| First use | Customer supplies records or connects accounts; existing alternative preserved |
| Needs an answer | Customer; accepted “I’ve worked on your books…” hero and concise count retained |
| Actually processing | Betti; “I’m updating your books.” No invented CTA |
| Queued/retrying | Betti; explicitly more review/retry, customer need not wait |
| Held for review | Betti; “I still have some records to review.” |
| Processing failure/missing job | Explicit “I couldn’t finish processing some records.” Kept distinct from ordinary review |
| Deferred only | “You’re all set for now.” Saved-for-later explanation |
| Supported current-through | Existing canonical date only |
| Available records organized | Limited to known accounts/periods; no whole-business overclaim |
| Out-of-scope evidence | Explains actual start date; no invented Catch-up |
| Projection unavailable | Calm load failure with refresh direction; not a false zero-work state |

No new disconnected-source detector was invented. Existing projected recovery actions retain their authoritative destination.

### Work with Betti

Kept the 37/63 desktop geometry, stage position, artwork sizing, hamburger navigation and mounted conversation. Refined work-surface shadow, established-understanding wash, answer borders/hover and selected batch treatment. No merchant requests, runtime packages or new animation dependencies.

59 explicit copy replacements; 354 source copy entries inventoried, including dynamic templates and shared compatibility/error paths. See [copy review](copy-review.md), [inventory](copy-inventory.json), and [writing system](betti-writing-system.md).

Receipt request: “Do you have receipts for these?” / “Send me what you have and I’ll match them.” Follow-up: “Any more receipts for these?” / “If not, that’s okay. I’ll keep working with what I have.” The original opportunity-completion command now reads “I don’t have any to send”; it remains distinct from the later scoped availability assertion. “I’ll do this later” still defers rather than asserting unavailability.

Loan/refund wording is shorter; principal/interest safeguards and purchase-relationship confirmation are unchanged. Canonical question wording was shortened without changing eligibility, confidence, facts, answer IDs or consequences. Already indexed/presented historical prompt wording is not forcibly rewritten; it updates through the normal canonical lifecycle.

The 160ms fade now starts at 90% opacity instead of 65%. Browser certification caught low contrast in metadata during the old fade. On the receipt background, the muted text's worst transition contrast improves from roughly 2.87:1 to 4.92:1. Reduced motion still disables animation. No added delay.

### Reports

Replaced the previous annual-readiness-first composition with:

1. Reports identity and calendar period controls.
2. Business income, business expenses and estimated profit.
3. Clear category rows and reconciled expense total.
4. Income context, separate personal use, mileage and supported deductions when applicable.
5. Restrained review status without claiming each unresolved record needs the customer.
6. Tax-time summary and clearly annual CSV exports, for DIY customers or tax preparers.

Monthly/quarterly/YTD/annual controls use the existing start/end summary endpoint. Calendar boundaries include leap years. Old requests are aborted; amounts are keyed to their loaded period so new dates never display previous-period totals. Recoverable errors provide Retry. No report arithmetic, tax policy, source classification, scope filtering or export service changed. No invented income breakdown. Previous-year readiness remains available in a secondary disclosure.

Mobile uses two compact income/expense values plus a full-width profit row, followed by readable category amounts. No charts or decorative icons were added. Removed the nested main landmark from the former Reports component.

## Certification

### Public staging financial checks

| Synthetic customer | Income | Expenses | Profit | Result |
| --- | ---: | ---: | ---: | --- |
| Controlled May / needs-customer | $6,260.96 | $1,671.03 | $4,589.93 | Home = Reports; category totals reconcile |
| Mixed account | $0.00 | $130.00 | −$130.00 | $245 personal use remains outside P&L |
| No Catch-up / old out-of-scope evidence | $0.00 | $0.00 | $0.00 | No old activity included |
| Fresh May after completion | $6,260.96 | $1,671.03 | $4,589.93 | Home = Reports; zero ready, one deferred, zero queued |

Each gallery customer exercised all four period modes. Category amounts plus uncategorized expenses equal total business expenses; income minus expenses equals profit.

### Regression matrix

| Area | Evidence / result |
| --- | --- |
| Ordinary income, many categories, expense refund, personal, mixed, meals, missing receipts, pending tax details | New isolated canonical report fixture PASS; existing reporting suites PASS |
| Transfers, card payments and owner funding outside P&L | New fixture PASS; existing financial-summary/special-transaction tests PASS |
| Current-only vs Catch-up + Current dates | New report fixture and existing scope tests PASS |
| Mileage actual/standard-method reconciliation | Existing reporting-vehicle-reconciliation tests PASS; no new live mileage record created |
| Annual, month, quarter, leap/date boundaries | Period-control tests + public browser reads PASS |
| Reports export and supported tax deductions | Existing CSV/PDF/tax-time tests PASS; existing export routes retained |
| Account use, personal/mixed sweep, receipts, loan defer, refund, ordinary questions | 27 successful canonical browser actions total across three segments; see caveat below |
| Stable stage/artwork; navigation | Same mounted nodes throughout each segment; one browser navigation entry during answers |
| Question flashing | Zero unexplained withdrawals in captured traces |
| Stale-version enforcement | Four stale sweep writes rejected with 409; no accepted stale write. Clean-ingestion journey FAIL at harness guard |
| Home/Check-in action agreement | PASS at final completion |
| MFA/tenant authorization | Public anonymous/AAL1/spoofed-identity probes rejected; AAL2 reads PASS |
| Idempotency, tenant/RLS policy and evidence/scope contracts | Relevant tests in full suite PASS; environment-gated local integration tests remain skipped |

### Performance smoke

Public ordinary material answer → another ready material question, n=3: **p50 510ms / p75 575ms / p95 575ms / max 575ms**. Previous supplied smoke was p50 ~444ms / p95 ~468ms. Small sample; this supports sub-second continuation, not a new capacity or tail-latency claim.

All 27 successful transitions, including scoped batches, fresh-ingestion dependencies and processing responses: p50 1,395ms / p75 1,778ms / p95 2,909ms / max 3,526ms. These are explicitly not ordinary independent-next-action measurements. Loan deferral to a ready question: 753ms. Recorded click acknowledgment max: 3.4ms.

No new answer-path query, request, logo lookup or runtime work. No worker/queue optimization. The first account question appeared at 21:35:22 UTC; the first following material question appeared at 21:40:58 UTC (~336 seconds later) while the import/account reassessment drained. This remains launch-important background work; see [follow-up](background-queue-follow-up.md).

### Issues found during this pass

1. **Reports period race — fixed.** New date labels could briefly accompany old totals before an effect ran. Loaded-period identity now gates presentation, and canceled responses cannot update it.
2. **Transition contrast — fixed.** The old 65% starting opacity caused a receipt metadata contrast violation during the fade. Starting at 90% preserves legibility; final receipt capture and completion pass.
3. **Empty-state harness assumption — fixed.** The browser script assumed every Home had Recent Activity. It now allows the legitimate empty state; out-of-scope report certification passes.
4. **Fresh-ingestion sweep churn — remains.** Four different displayed personal-sweep versions were rejected after their purchases changed during active processing. No silent withdrawal or bad write occurred. The trace establishes concurrent processing and stale groups, not the exact producer/invalidation cause. Do not label this a clean end-to-end pass. Follow up on readiness and changed-group publication alongside the separately documented queue protocol work; this UX change does not reopen that architecture.

### Accessibility / visual review

Real public screenshots at 390, 430, 768 and 1280, with manual image inspection. Automated WCAG A/AA checks pass in the final captures, including receipt metadata after the contrast fix. 200% text scaling, no horizontal overflow, visible keyboard focus, semantic single-main structure and reduced-motion checks pass for the exercised states. Automated checks do not replace full assistive-technology testing; no VoiceOver/NVDA session is claimed.

Gallery: `/private/tmp/writeoffs-signature-ux/gallery/index.html`.
Raw final sequence/performance: `/private/tmp/writeoffs-signature-ux/performance-and-journey.json` and `action-sequence.json`.
Original failed ingestion evidence: `/private/tmp/writeoffs-signature-ux/ingestion-session/` plus `/private/tmp/signature-public-actions.jsonl`.

### Validation / deployment

- 1,764 tests passed; 143 environment-gated tests skipped; 240 passing test files.
- TypeScript PASS.
- ESLint: zero errors, 16 existing warnings.
- Optimized local webpack build PASS; hosted Next.js Turbopack build PASS.
- Gitleaks sanitized release-source scan: no leaks.
- Dependency audit: two existing moderate development-tool findings; zero high/critical findings. No dependencies changed.
- No migrations, financial calculation changes, Rive integration, worker changes or customer-data repair.
- Final dedicated deployment: `dpl_4zm9cmxTFwHFWGfL4XwHeFChUma5`, `https://writeoffs-fresh-staging-82a2m37pz-ricks-projects-3ba59ab5.vercel.app`.
- Public alias verified. Main, real Production, Rick's accounts and unapproved Fiverr files untouched.

[Future approved Betti integration map](betti-integration-map.md). Static artwork remains the only renderer.

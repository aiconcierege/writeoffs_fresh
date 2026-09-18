# Guided conversation continuity cleanup

## Root cause

Home links to the canonical next action, which may include `?record=…`. The work
projection correctly treats that record as a conversation-priority hint and still
returns ready actions for the whole business. `GuidedWork` instead filtered that
list permanently to the entry record. Finishing or deferring that record therefore
left the UI with no action while Home still correctly reported other ready work.
The resulting screen combined Home's work-remains heading with local deferred copy.

A second failure was found in real staging certification: an income answer committed,
but its response exceeded the existing 15-second client timeout. The child question
required a local reload even though the canonical projection already had other ready
work. Guided stale-version and uncertain-transport recovery now refresh the parent
projection, without resending the command or treating uncertainty as a confirmed answer.

## Repair

- Render the projection's `nextAction`; do not apply a second eligibility filter.
- Keep the record hint, canonical priority, action versions, return destination and
  explicit transaction-correction route intact.
- Restrict the `ordinary` special-workflow escape to its originating transaction.
  It must not change how unrelated later special transactions are presented.
- Reconcile after each confirmed answer/deferral; fall back to an authoritative read
  if reconciliation fails. Do not leave a committed action stranded behind a child queue.
- On uncertain responses or stale versions, refresh canonical work without another
  write. Ordinary and special workflows use the same parent recovery. Serialize recovery
  against background reads and restart the bounded read window. Unconfirmed writes do
  not increment the confirmed-answer counter.
- Automatically refresh for a bounded window (eight seven-second opportunities,
  single-flight, with a 15-second read timeout). Each saved action starts a fresh
  window. Focus or an explicit refresh also checks current work. Longer processing
  offers a check-again control and return navigation, without an endless poll.
- Ready work always takes precedence over processing/deferred completion copy.
- Say “Getting your books caught up” and “Getting caught up · N need you” without
  inventing a historical period.

No bookkeeping policy, loan/refund logic, scope authority, database migrations,
customer assertions, receipt rules or transaction identity changes are included.
Rick's customers are not certification fixtures.

## Validation

Local validation: 1,595 passing tests; 143 environment-dependent tests skipped.
Focused guided/Home coverage is included in the passing suite. TypeScript and optimized webpack build pass.
ESLint: zero errors, 16 existing warnings. Dependency audit: two moderate development
tool advisories; no high/critical findings. Gitleaks: no findings in changed source.
Dedicated-staging tenant/MFA/RLS, stale-version, idempotency, read-only rendering and
six-fixture cross-surface/scope certification passed.

The initial browser preparation encountered snapshot-churn 503s while normal jobs
were running. Preparation now waits on synthetic job states before starting the
conversation. A separate test comparison was corrected to bracket Home with report
reads: worker changes between requests must not be mistaken for inconsistent totals.
Neither adjustment changes application behavior or bypasses canonical processing.
The runner also binds clicks to the displayed canonical action version. A newly ready
Current question can change priority during observer checks; the runner must resample
rather than click a different question and label it as the previous one. Durable
deferral history confirmed that the first apparent repeat was this observer race,
not an answered fact re-entering the queue.

## Real staging result: PASS

Final candidate: https://writeoffs-fresh-staging-6mk7r6znl-ricks-projects-3ba59ab5.vercel.app
Dedicated release target: https://writeoffs-fresh-staging.vercel.app
Project: `prj_o56739F1pzd0TjFirEYoLMaa6oIJ` (`writeoffs-fresh-staging`).

One browser conversation completed **21 customer actions**, with **zero navigation,
zero unnecessary stops, and no repeated handled action/version**. It ended with
**0 ready actions and 12 deferred actions**. Home, Check-in and the questions endpoint
agreed. Reports category totals and working profit reconciled; Home used the same totals.
The original 24-row May fixture was supplemented with four Current transactions through
normal document intake. Existing history was retained. Rick's accounts were not used.

One loan-deferral response was deliberately dropped **after** the server confirmed the
write. The UI recovered by reading canonical work and continued, without a second write.
Unconfirmed responses do not increment the confirmed-answer progress counter.

### Continuous action sequence

| # | Action / transaction | Stream | Result | Next projected action | Unnecessary stop |
|---|---|---|---|---|---|

| 1 | Special workflow — LOAN PAYMENT - EQUIPMENT FINANCE CO | Current | deferred | Personal exceptions (Current) | No |
| 2 | Personal exceptions | Current | completed | Mixed-use review (Current) | No |
| 3 | Mixed-use review | Current | completed | Receipt upload (Current) | No |
| 4 | Receipt upload | Current | completed | Receipt confirmation (Current) | No |
| 5 | Receipt confirmation | Current | completed | Special workflow (Current) | No |
| 6 | Special workflow — REFUND - OFFICE DEPOT | Current | completed | Special workflow (Current) | No |
| 7 | Special workflow — REFUND - OFFICE DEPOT | Current | completed | Material fact (Catch-up) | No |
| 8 | Material fact — ZELLE FROM ROBERT HALL | Catch-up | deferred | Material fact (Catch-up) | No |
| 9 | Material fact — CHECK #104 - DESERT PRINT SHOP | Catch-up | deferred | Material fact (Catch-up) | No |
| 10 | Material fact — STRIPE PAYOUT | Catch-up | deferred | Material fact (Catch-up) | No |
| 11 | Material fact — ZELLE FROM JANE MORRIS - INV 1041 | Catch-up | completed | Material fact (Catch-up) | No |
| 12 | Material fact — ZELLE TO MARK REYNOLDS | Catch-up | deferred | Material fact (Catch-up) | No |
| 13 | Material fact — ATM WITHDRAWAL | Catch-up | deferred | Material fact (Catch-up) | No |
| 14 | Material fact — CASH DEPOSIT | Catch-up | deferred | Material fact (Catch-up) | No |
| 15 | Material fact — ACH DEPOSIT - BLUE MESA CONSULTING | Catch-up | deferred | Material fact (Catch-up) | No |
| 16 | Material fact — STATE FARM INSURANCE | Catch-up | deferred | Material fact (Catch-up) | No |
| 17 | Material fact — INTEREST PAID | Catch-up | deferred | Material fact (Catch-up) | No |
| 18 | Material fact — ZELLE FROM EMILY CARTER | Catch-up | deferred | Material fact (Catch-up) | No |
| 19 | Material fact — verizon | Catch-up | completed | Real processing dependency | No |
| 20 | Receipt upload | Catch-up | completed | Receipt confirmation (Catch-up) | No |
| 21 | Receipt confirmation | Catch-up | completed | Only deferred work | No |

### Certification matrix

| Contract | Observed | Result |
|---|---|---|
| Loan deferral continues unrelated work | Next personal sweep appeared, including after deliberately lost response | PASS |
| Receipt confirmation continues | Refund workflow appeared next | PASS |
| Refund relationship continues | Ordinary Catch-up question appeared next | PASS |
| Cross-action / cross-stream continuity | Current special workflow → Catch-up material questions; earlier account-use run also crossed Catch-up → Current | PASS |
| No arbitrary session interruption | 21 actions, no main-frame navigation or reload | PASS |
| Deferred-only completion | 0 ready, 12 deferred; truthful done-for-now screen | PASS |
| Real processing pause and automatic resumption | After phone percentage, observed 13.4-second wait; receipt work resumed with 0 explicit checks | PASS |
| Home / Check-in / Reports | Canonical counts and stable financial snapshots agreed throughout | PASS |
| No loops / duplicate durable questions | No handled action/version reappeared; canonical retry tests passed | PASS |
| Stale writes / tenant / MFA / read-only | Real staging security suite passed, including immutable replay and rejected changed/stale requests | PASS |
| Out-of-scope evidence | Separate synthetic no-catch-up fixture remained excluded with 0 ordinary actions | PASS |

### Timing observations — no optimization performed

- Customer-action invocation to successful server response: **0.8–11.3 seconds**, median **3.7 seconds**.
- Invocation through visible screen advancement and the subsequent projection verification: **7.3–19.0 seconds**, median **10.4 seconds**. These include test verification overhead and are not pure render benchmarks.
- Final processing episode: **13.4 seconds observed after the status capture**, automatically resumed; no Home round trip or check-again click.
- A preliminary real income answer exceeded the existing 15-second client response limit after committing. This exposed and motivated the read-only recovery repair.
- Initial statement/account assessment queues took several minutes in staging. The loader brackets question reads with two context reads and retries changed snapshots; answer reconciliation uses multiple sequential RPCs. These are useful targets for the separate performance pass. No worker, query, database, or broad performance refactor was made here.

### Screenshots and visual review

Real staging screenshots exist at **390, 430, 768 and 1280px** in:
`/private/tmp/writeoffs-phase3-continuity-final/browser/`.

- `material_question-{width}.png`: active Catch-up transaction question.
- `loan-document-request-{width}.png`: loan documentation request.
- `post-deferral-continuation-{width}.png`: continuation after the lost-response deferral.
- `after-six-actions-{width}.png`: uninterrupted workflow transition.
- `only-deferred-completion-{width}.png`: genuine done-for-now state.
- `genuine-processing-{width}.png`: real reassessment dependency.
- `home-catch-up-status-{width}.png`: improved Home Catch-up wording.
- `before-recovery-timeout.png`: preliminary failure retained as evidence of the additional issue found and repaired.

Reviewed mobile and desktop compositions: canonical Betti remains prominent, merchant
identity and the question remain clear, and the existing Phase 3 design system is preserved.
No horizontal overflow or unhandled browser errors were observed in the passing run.
The intentionally dropped response was handled, not ignored.

### Changed files / boundaries

Runtime: `GuidedWork.tsx`, `QuestionFlow.tsx`, `SpecialTransactionFlow.tsx`, and
`app/lib/home/command-center.ts`. Tests: guided continuity, uncertain-response recovery,
bounded processing recovery, and existing Check-in/Home expectations. Certification:
the staging runner, its continuous-session helper, and this report.

**Migrations: none.** No tax/loan/refund rules, pricing, ingestion, Reports calculations,
canonical assets, or customer data repair. No performance phase or other redesign begun.
Main and real Production remain untouched.

### Deployment preparation incident

An archive preparation error allowed the CLI to create an empty temporary project,
`writeoffs-guided-continuity-candidate`, before the explicit staging binding was written.
No application code, secrets, or customer data were deployed there. All application
candidates used the verified dedicated staging project above. Automatic approval review
blocked deletion of the empty temporary project because explicit external-project deletion
authorization is required; approval was requested separately and remains pending.

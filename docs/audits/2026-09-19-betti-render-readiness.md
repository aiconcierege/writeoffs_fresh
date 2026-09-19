# Betti render-readiness acceptance addendum

This is the focused addendum to `2026-09-19-betti-conversation.md`. It preserves that pass's persistent workspace, evidence reasoning, Home changes and controlled-transaction audit. It does not claim a new broad visual/performance redesign.

## Root cause and contract

A public-staging browser reproduction displayed a personal-exception sweep, uploaded a receipt in another tab, and focused Check-in while the derived action index was invalidated. The client replaced its entire work value with the latest recommendation. The visible action disappeared to a working state with no notice. The before trace records **one unexplained withdrawal**.

There were four related gaps:

1. Focus/evidence/recovery reads treated a changed recommendation or temporarily absent indexed action as permission to silently replace the visible action.
2. Evidence without a known transaction relationship held receipt work but did not consistently hold material questions. Those questions could be generated before extraction/matching resolved them.
3. Reads could race with mutations: ordinary and special child controls did not lock the parent's refresh handler, and not every outstanding read was rejected after a newer command.
4. Special-work detail loading could fetch a newer decision than the indexed action being presented.

The repair adds no stabilization timer. The shared canonical projection holds evidence-dependent actions while an actual document/receipt dependency is unassigned. Account-use remains independent because a document cannot answer that customer fact. Once relationships are established, unrelated records are released. Received/unassessed documents remain distinct from actual processing.

A read-only presentation reconciler receives only the visible action ID/version. It finds that action in the authenticated business's same canonical eligible set. It retains an unchanged eligible action despite recommendation reordering. A version change is explained. Absence from a dirty index or pending dependency is not called resolution. Betti either explains that she is checking the item and presents an independent ready action, or keeps the workspace in a working state. Settled resolution and deferral receive distinct acknowledgments.

This does not freeze stale actions or bypass command guards. A visible action can become invalid after any read; existing versioned commands still reject stale writes. Client sequence guards reject older reads, including those started before a POST. Upload callbacks identify successfully registered files; failed uploads do not claim receipt. Special detail GET checks the expected decision before returning customer controls.

A further issue found in certification: disappearing batch IDs can mean **regrouping**, not resolved facts. If ready work remains, the reconciler says it has updated what it needs rather than claiming the evidence answered the old batch.

## Canonical implementation

- `betti-work:v4-render-ready`: shared document/receipt dependency fence and special decision identity.
- `betti-action-index:v2-render-ready`: prevents old derived entries from serving the prior readiness rules.
- `action-presentation.ts`: retained / settling / rechecking / updated / resolved / deferred.
- `GET /api/bookkeeping/work?view=guided&presented=…&presentedVersion=…`: authenticated read-only continuity reconciliation. The client's ID is a hint, never tenant authority or trusted action content.
- Ordinary command responses continue using the existing fast path. Full canonical reconciliation is reserved for focus/evidence/recovery reads.
- Migration `20261001000300_render_ready_action_index.sql` changes the existing RPC engine fences and schedules version refresh. No accounting facts or customer answers are rewritten.

The recommendation/counts remain canonical. Presentation can retain a different **still-eligible** action for conversation continuity. It does not invent an additional queue or change the eligible set.

## Live browser certification

Public origin: https://writeoffs-fresh-staging.vercel.app . Fresh isolated synthetic customers only.

| Case | Observed | Result |
|---|---|---|
| Enter during real statement processing | No provisional material question; canonical account prerequisite can remain independently available | PASS |
| Receipt upload while question visible, then focus/index refresh | Explanation appears; affected item is rechecked; independent account action can continue | PASS |
| After ordinary answer | Persisted acknowledgment, next canonical action, old reads cannot overwrite it | PASS |
| Receipt upload inside guided session | Received acknowledgment, real processing dependency, then eligible work resumes | PASS |
| Reassessment eliminating candidates | Shared dependency tests prove candidates stay waiting then disappear when resolved; live run records no unexplained withdrawal | PASS |
| Action-type transitions | Loan, refund, ordinary, personal/mixed, receipt and meal actions continue in one mounted workspace | PASS |
| Worker/index refresh while open | Focus/processing refreshes recorded; no unexplained action withdrawal | PASS |
| Receipt Later | Remains deferred, no receipt-unavailable assertion, working expenses preserved | PASS |
| Only deferred remains | Read-only recapture confirms actual settled deferred completion | PASS |

Before trace: `/private/tmp/betti-readiness/before-churn.jsonl`.
After upload trace: `/private/tmp/betti-readiness/after-churn.jsonl`: 1 transition, 0 unexplained withdrawals.
Long trace: `/private/tmp/betti-readiness/after-live.jsonl`: **25 commands, 26 action transitions, 0 unexplained withdrawals**.
Mixed trace: `/private/tmp/betti-readiness/after-mixed.jsonl`: **3 commands, 3 transitions, 0 unexplained withdrawals**.

The recorder samples paintable ID/version/type/heading/notice, request completion, focus, file selection and document identity. It excludes secrets and answer bodies. The checker requires a successful command or explanatory customer-visible cause for withdrawal. It distinguishes pending special-detail content from a rendered question. These are observed runs, not a guarantee about every possible concurrent event; targeted race/dependency tests supplement them.

### Continuous long-session sequence

All actions below were Catch-up context in this fixture. Do not interpret September-dated evidence before this customer's activation as Current.

| # | Action | Outcome |
|---|---|---|
| 1 | Account use | Business only persisted |
| 2 | Personal sweep | Completed |
| 3 | Loan statement request | Deferred; unrelated work continued |
| 4 | Refund relationship | Confirmed |
| 5 | Blue Mesa incoming payment | Answered |
| 6 | Stripe understanding | Confirmed |
| 7 | Robert incoming payment | Answered |
| 8 | Jane invoice payment | Confirmed |
| 9 | Cash deposit | Answered |
| 10 | Emily incoming payment | Answered |
| 11 | Mark purchase activity | Answered |
| 12 | ATM movement | Answered |
| 13 | Mixed-use sweep | Completed |
| — | Controlled McDonald's receipt uploaded | Received and processed; not counted as an answer |
| 14 | Receipt opportunity | Advanced |
| 15 | Meal relationship | Answered |
| 16 | Verizon business percentage | Answered |
| 17 | Scoped receipt availability | Confirmed |
| 18 | Newly eligible personal batch | Completed |
| 19 | Insurance coverage | Answered |
| 20 | Print purchase purpose | Answered |
| 21 | Mark purchase purpose | Answered |
| 22 | Mixed-use sweep | Completed |
| 23 | Meal business purpose | Answered |
| 24 | Receipt opportunity | Advanced |
| 25 | Scoped receipt availability | Confirmed |

Same mounted conversation and Betti artwork across all 25; one navigation entry during the active sequence; no action-quota stop or Home round trip. Heavy processing exceeded bounded automatic polling once; the harness used the existing explicit check-again control, not a browser/session restart.

Final main fixture: 24 May records plus one receipt-only record; 24 organized, loan remains unresolved/deferred; 0 ready actions, 1 deferred. Home/Check-in/Reports comparisons passed. No unsupported current-through claim.

Mixed fixture: business expense **$130**, personal portion **$245**, 0 ready / 1 deferred receipt action. Missing receipts remained absent without being marked unavailable; the $130 working expense stayed in Reports.

The 25-action run used the first readiness candidate. The final candidate additionally fixes regrouped-batch wording; the mixed run and settled-completion check used that final candidate. Unit tests cover that final wording distinction.

## Performance and limitations

Ordinary independent material answers, 13 warm observations:

| Measure | Prior accepted | Observed |
|---|---:|---:|
| Answer → next visible p50 | ~525 ms | 585.1 ms |
| p75 | — | 683.8 ms |
| p95 | ~711 ms | 702.6 ms |
| Max | — | 702.6 ms |

DOM acknowledgment (button disabled) over 25 commands: p50 2.5 ms, p95 3.6 ms, max 4 ms. This is DOM timing, not a claim about physical display latency.

Other observed classes were slower and are not hidden in ordinary percentiles: account use 1.50 s; personal sweeps 1.42–3.44 s; loan deferral 3.47 s; refund 0.88 s; mixed sweeps 1.14–2.10 s; receipt advancement 1.07–2.44 s; availability assertions 1.55–5.12 s; Verizon local dependency 2.86 s.

Fresh-import processing remains a material limitation: approximately **11.4 minutes** from account answer to the first ready follow-up in this fresh 24-record run; receipt-related settling approximately **95 seconds**. Actual queued canonical jobs/index work were present. The deployed cron was enabled every minute. Sampled job totals included many business-context and deterministic jobs. Evidence does not establish a single causal bottleneck; no broad worker optimization was attempted. The waiting UI remained truthful. These heavy-path timings are not launch acceptance for processing speed.

## Screenshots and accessibility

Curated gallery: `/private/tmp/betti-readiness/gallery.html`.
Widths: 390, 430, 768, 1280. Main run produced 124 captures (including repeated processing states); mixed run 52. Axe checks on captured main content at 390 found no violations; 200% text scaling and all four widths had no horizontal overflow. Prior keyboard/focus/reduced-motion behavior was preserved; no new animation was introduced.

Actual review included the public-staging rechecking notice on mobile/desktop, processing mobile, and settled deferred completion. Betti/stage stay anchored, the notice is readable, and controls remain usable. This addendum does not claim another broad visual certification of every unchanged screen.

The original harness mislabeled a still-processing image as only-deferred because its independent API read settled before the UI. It was excluded from the curated completion evidence. A read-only browser revisit explicitly awaited the real settled deferred explanation and captured it. The underlying trace was retained rather than altered.

## Tests and security

- Full unit suite: **1,737 passed; 143 environment-gated skipped** (236 passing files / 42 skipped).
- TypeScript: PASS.
- Lint: 0 errors, 16 existing warnings.
- Optimized local webpack build and dedicated Vercel optimized build: PASS.
- Production dependency audit: 0 vulnerabilities. Full development dependency audit: 2 existing moderate advisories (`vitest`, `@vitest/mocker`); no high/critical findings. No dependency changes in this pass.
- Secret scan of staged source: PASS (see final check log).
- Real staging API tests: anonymous and AAL1 blocked; AAL2 forged presentation hint cannot expose another tenant.
- Rollback-only staging database tests: tenant/MFA/stale/idempotency/publication guards PASS.
- Shared full/index readiness equivalence, unassigned/linked evidence, stale special-detail rejection, read-versus-POST race and batch-regrouping tests PASS.
- Bookkeeping rules, scope authorization, financial calculations, existing evidence reasoning and correction history unchanged. Broader regression suite remains green; not every prior synthetic scenario was rerun as a fresh browser journey in this focused addendum.

A diagnostic search accidentally printed credentials for six older synthetic fixtures into this session's tool output. No real customer/production credentials were involved and none entered source/deployment artifacts. No unauthorized credential rotation was performed. This is a handling mistake, not a finding from the source secret scan.

## Deployment

Dedicated staging only; main and real Production untouched. Migration applied to the dedicated staging project. Final source commit and deployment identity are reported in the accompanying delivery message to avoid a self-referential commit hash. Unapproved Fiverr review assets remain excluded.

# Work with Betti — visual acceptance correction

September 20, 2026. Composition commit: `89e43b1`; final deferral presentation: `070e0ed`.

Public dedicated staging: https://writeoffs-fresh-staging.vercel.app
Exact release: `writeoffs-fresh-staging-r1l582g2q-ricks-projects-3ba59ab5.vercel.app`
Deployment: `dpl_C61B8yYG7Hu54JNd1Tdt8yygB9Fc`.

## Scope

This is a composition and presentation-language correction. No bookkeeping rules, action-index logic, ordinary-answer server path, worker scheduling, Home layout or financial calculations changed. No migrations or dependency changes. Main, real Production, Rick’s accounts and the unapproved Fiverr assets remain untouched.

The approved reference is unchanged: `docs/design/references/work-with-betti-approved-direction.png`, SHA-256 `14f385c1b9e2adb935a57dd2537612d23bb9ca213491a59818eb1033e75554aa`.

## Composition: what changed

Before: a separate back-navigation row pushed the page title down; the open left illustration area and independently bordered right card looked like separate objects. The small character occupied only 27% of the stage allocation.

After: Home/back navigation shares the destination header. Context appears once beneath the page identity. A single continuous cream/green/white surface encloses Betti and the conversation. The right-hand card border and shadow are gone; the whole stage owns its restrained outline and elevation. Desktop uses a 37/63 split (35/65 on smaller desktop widths). Betti’s identity sits with her, rather than adding another header above the question.

The character stays mounted and uses the same approved static artwork. Her desktop frame increases from 400px to 560px tall. There is no office scenery, speech bubble, slogan, sidebar, generated art, or new animation/runtime. The same 160ms content-only transition and reduced-motion treatment remain.

At 768px the experience uses one wide conversation instead of a narrow almost-desktop question column. Mobile has a compact character/identity row and full-width question content. Answers retain existing submission, focus, disabled and stale-version behavior.

## Measured geometry

Same real synthetic receipt-confirmation group, public staging, 1280 × 800 browser viewport. Dimensions are CSS pixels, rounded. These are diagnostics, not pixel contracts.

| Measurement | Before | After |
|---|---:|---:|
| Application-header bottom | 73 | 73 |
| Header → page-identity top | 75 | 11 |
| Conversational-stage top | 219 | 153 |
| Stage width | 1,216 | 1,216 |
| Betti image frame | 312 × 400 | 433 × 560 |
| Work-area width | 864 | 765 |
| Receipt-confirmation stage height | 943 | 668 |
| Primary receipt-confirmation button top / bottom | 1,018 / 1,067 | 690 / 739 |
| Primary control fully visible in first viewport | No | Yes |
| Visible stage rectangle / viewport area | 69% | 77% |

The right side is intentionally slightly narrower because Betti now owns the requested proportion. It is no longer a separate floating white card. The stage-area percentage includes surface whitespace; it is a bounding-box proxy, not a claim that every pixel is meaningful information.

At the same 800px height, stage tops are approximately 144px at 390/430 widths and 149px at 768. Receipt confirmation’s seven-purchase group still requires a small vertical scroll on mobile; purchases themselves form a keyboard-scrollable bounded group. No horizontal overflow at the tested widths or 200% text scaling.

The first candidate still let the receipt list dominate the page. Inspection caught it before promotion. The final list is bounded to 13rem for receipt collection/availability, and the confirmation explanation is shorter. It identifies the visible scope without a paragraph about implementation details.

## Copy and merchant treatment

- Removed the separate repeated in-stage Catch-up label; context is page-level only.
- Moved `Betti · Your bookkeeper` into her area.
- Receipt availability: “This applies only to these purchases. Missing receipts won’t remove supported expenses.”
- Receipt upload retains “Send me the ones you have and I’ll match them.” Purchases precede the upload control.
- Existing reliable local merchant logos remain. No generic storefront fallback, external logo lookup, or render-time request was added.
- The missing fact remains the strongest text in the work area. No new marketing/helper paragraphs or answer-choice icons.

## Deferral and processing semantics

A small pure presentation helper reads the existing canonical projection plus the outcome of the last successfully persisted customer action. It does not recalculate eligibility or write anything.

| Event/state | Presentation |
|---|---|
| Receipt Later confirmed saved | “No problem. I saved those receipts for later.” |
| Other deferral confirmed saved | “No problem. I saved that for later.” |
| Receipt deferral with no ready action | “You’re all set for now.” / “I’ll keep working with what I have. You can send those receipts whenever you’re ready.” |
| Answer followed by real pending work | “Got it. I’m updating your books.” |
| Active processing on entry | “I’m working on your books.” |
| Queued review on entry | “I have more to review.” |
| Customer evidence resolves the visible question | “Got it — that answered this for me.” |
| Real processing failure | Specific processing-failure message; not hidden by a saved deferral |

Root cause of the misleading deferral screen: guided completion reused Home’s broad held/processing wording, and treated all unresolved system-held records like processing trouble. A held record with no legitimate current customer question does not itself establish failed processing. That distinction now informs presentation without changing the underlying facts.

If another action is ready, the existing renderer presents it; the completion helper is not used. Actual pending work still enables the existing bounded recovery reads. Deferral neither marks receipts unavailable nor changes expense inclusion. A successful saved-choice acknowledgment is only set after the canonical command succeeds; the existing immediate pending feedback remains.

## Comparison with the approved reference

The reference was inspected alongside actual staging captures, not judged in isolation. It contains one desktop composition, not separate approved mobile/tablet assets. The smaller-width comparison therefore checks the same hierarchy and balance conceptually rather than pretending there is a matching mobile mockup.

At 1280-wide display scale the reference’s stage begins around 143px; this release begins around 153px. Its right work area appears around 537px wide after the generated sidebar; this release uses about 765px because the authorized hamburger model leaves more width available. The important shared qualities are early stage placement, substantial Betti, a strong question, financial context and usable controls in the laptop viewport.

Intentional differences: no generated sidebar or desk scenery; less explanatory copy; no unsupported “books up to date” promise; no fabricated fixed progress bar; existing standing/static Betti rather than the generated seated pose; actual canonical answers rather than the mockup’s illustrative insurance list. The reference image itself was never edited.

## Background queue limitation

Unchanged from the previous investigation: PDF intake ~3.5s, first useful work ~4.6s, later mean queue residence ~115–216s versus ~2–3s execution. This correction does not claim to fix that queue. Real pending states remain visible, and another ready independent action continues normally.

## Validation

- Full suite: **1,756 passed**, 143 environment-gated skips; 238 files passed, 42 skipped.
- TypeScript / Next type generation: passed.
- Optimized local webpack and hosted Next/Turbopack builds: passed.
- Lint: zero errors, 16 existing warnings.
- Secret scan of sanitized deployment source: no leaks.
- Dependency audit: zero production findings; two existing moderate development-tool findings, no high/critical findings.
- Public API anonymous/AAL1 rejection, AAL2 access, forged identity and foreign presented-action isolation: passed.
- Focused semantic tests cover receipt deferral, unrelated queued work, real failed processing, held-record distinction, answer versus entry language, supported coverage, and continuation across workstreams.
- Application changes are client presentation only; canonical commands, RLS, membership/MFA, scope, idempotency and version checks are unchanged. Their automated regression suites passed.

The local pre-push hook’s known Turbopack port-binding restriction remains. Push used the separately passed full checks and hosted build; no force push.

### Changed application files

`app/components/guided/ConversationShell.tsx`, `GuidedWork.tsx`, `guided.css`, `conversation-status.ts`.

Tests: `tests/bookkeeping/conversation-status.test.ts`, `guided-continuity.test.ts`.
Certification: `scripts/certify-betti-conversation.mjs` (geometry, viewport sizing, receipt-Later scenario and acknowledgment recording). This audit records the public evidence separately from the application release.


## Public functional and performance smoke

A new isolated synthetic customer completed real onboarding, real May-statement upload and **27 continuous actions**. An existing synthetic customer completed **9 more actions on the final deferral build**. The same stage/Betti nodes and browser document persisted during each active journey. Visible-action traces found zero unexplained withdrawals and zero failed requests. Initial onboarding/Home navigation is separately recorded, not confused with question-to-question navigation.

The earlier three-action receipt-Later probe exposed summary-count lag after a successful deferral. The final presentation uses that successful command outcome immediately; it does not wait for the derived deferred count. Eligibility is still exclusively canonical. The final nine-action run verifies this correction: receipt Later → “No problem. I saved those receipts for later.” → another ready action or “You’re all set for now.” No generic updating or safety-concern message replaces the deferral acknowledgment.

| Regression | Result / coverage |
|---|---|
| Receipt Later → unrelated question | PASS, real public browser |
| Receipt Later with nothing ready | PASS, final public build; acknowledgment and all-set wording |
| Receipt availability Later vs unavailable | PASS, separate deferred command; existing versioned availability tests also pass |
| Ordinary answer → processing | PASS; updating wording follows an answer, not a deferral |
| Loan deferral / refund relationship | PASS in fresh live journey; canonical safeguards unchanged |
| Personal and mixed exception sweeps | PASS in fresh live journey |
| Persistent stage / no arbitrary stop / no unexplained withdrawals | PASS, 27-action and 9-action traces |
| Home five transactions / Home–Check-in counts / Reports arithmetic | PASS at each completed live journey |
| Catch-up + Current / out-of-scope / stale versions / idempotency | Existing full canonical regression suite PASS; no policy changes |
| Tenant and MFA | Full regressions and public handler-boundary checks PASS |

Performance is a small public-staging smoke sample, not a load test or new SLA:

| Sample | n | p50 | p75 | p95 | max |
|---|---:|---:|---:|---:|---:|
| Previously accepted ordinary baseline | — | ~491ms | — | ~925ms | — |
| Ordinary material answer → independent material question, both current-composition runs | 5 | 444ms | 466ms | 468ms | 468ms |
| Fresh journey, all actions including batch/dependent work | 27 | 983ms | 1,332ms | 1,848ms | 2,489ms |

The final build’s account answer → independent question took 667ms. Its ordinary Stripe confirmation → next question took 444ms. Immediate acknowledgment remained below 4ms in these automated browser samples. The final run also includes a 2,734ms receipt-availability deferral and a 2,527ms phone-dependent transition; these are not hidden in the ordinary sample. No new blocking request, merchant lookup, asset load, worker operation or server computation was added.

Fresh and final-run screenshots share the same deployed composition. The only later application change was the successful-deferral/summary-lag message condition. The background-queue limitation remains separate and unchanged.


## Screenshot gallery and reference review

- [48 real public-staging screenshots, four widths per state](/private/tmp/betti-composition-review/gallery/index.html)
- [Approved reference / implemented insurance — side-by-side image](/private/tmp/betti-composition-review/gallery/reference-comparison-1280.png)
- [Full-size side-by-side page](/private/tmp/betti-composition-review/gallery/reference-comparison.html)
- [Before / after composition](/private/tmp/betti-composition-review/gallery/before-after.html)
- [Desktop insurance](/private/tmp/betti-composition-review/gallery/insurance-1280.png)
- [390px insurance](/private/tmp/betti-composition-review/gallery/insurance-390.png)
- [768px insurance](/private/tmp/betti-composition-review/gallery/insurance-768.png)
- [Receipt Later completion](/private/tmp/betti-composition-review/gallery/deferred-completion-1280.png)

States: insurance coverage, receipt upload, receipt availability, personal exceptions, mixed exceptions, loan document request, refund confirmation, phone percentage, genuine ambiguity, narrow confirmation, processing and deferred completion. Manifest records original capture paths. All 48 gallery images are actual public dedicated staging, not local render mocks or seeded fake screens.

The insurance comparison uses an older isolated synthetic fixture advanced through its real canonical commands until the insurance-coverage question became ready, then left unanswered. Its earlier legacy broad question was excluded from the gallery; it is not presented as fresh-ingestion question-intelligence certification. The fresh customer's receipt opportunities were deliberately deferred for the Later test. No unseen receipt-unavailable assertion was created to obtain a screenshot.

The desktop insurance question's four primary answer rows end around y=711, inside the 800px laptop viewport. Compared directly with the approved image, the stage starts at essentially the same vertical level, Betti has much greater presence than before, and the work occupies the remaining width as part of that stage. The reference's sidebar/scenery/long greeting are intentionally absent. Tablet uses the full question width; mobile preserves the same merchant → understanding → missing fact hierarchy with compact Betti. Long batch reviews can scroll; forcing all purchases into a tiny first-viewport list would harm readability and review scope.

Accessibility captures reported no WCAG A/AA violations in tested main content. Keyboard focus, scrollable receipt groups, reduced motion and 200% text scaling passed. No full manual screen-reader audit is claimed. Screenshots were reviewed for geometry and hierarchy as well as overflow; final subjective visual approval remains Rick’s.

### Artifact evidence

- Before/after measured geometry: `/private/tmp/betti-composition-review/before/metrics.json`, `/private/tmp/betti-composition-review/after/metrics.json`.
- Fresh 27-action sequence: `/private/tmp/betti-composition-review/fresh/sequence.json`.
- Action traces: `/private/tmp/betti-composition-fresh-visible.jsonl`, `/private/tmp/betti-composition-final-deferral-visible.jsonl`, with adjacent `.report.json` summaries.
- Public MFA/tenant checks: `/private/tmp/writeoffs-phase3-composition-security/indexed-api-security.json`.

No remaining application edits are required for this correction. The known heavy background queue and future approved professional Betti artwork remain separate work. The deployed application is `070e0ed`; a following report/capture-harness commit records this evidence without changing the application.

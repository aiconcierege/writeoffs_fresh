# UX-1 staging certification — September 19, 2026

## Release boundary

Implemented authenticated shell, shared presentation primitives, Home, Work with
Betti and onboarding. This is the proposed visual north star for Rick's review,
not a claim that Rick has approved the final design.

No migrations, dependency changes, bookkeeping-policy changes, action-index changes,
new polling, or financial-calculation changes. No professional Rive integration.
Canonical logo and existing PNG originals are unchanged. Rick's accounts were not
used as mutable fixtures. Main and real Production were not changed.

## Browser evidence

Review gallery: `/private/tmp/writeoffs-ux1/index.html`.
Original screenshots: `/private/tmp/writeoffs-ux1/staging/`.
Four-width review sheets: `/private/tmp/writeoffs-ux1/review/`.
The gallery links original images at 390, 430, 768 and 1280 pixels.
Screens were reviewed for hierarchy, artwork containment, primary action, typography,
mobile reading order and desktop composition, in addition to overflow assertions.

Public staging: https://writeoffs-fresh-staging.vercel.app
Project identity verified as `prj_o56739F1pzd0TjFirEYoLMaa6oIJ` (`writeoffs-fresh-staging`).
The received/unassessed Home capture came from a deployment in this same dedicated
staging project before alias promotion. Other final gallery journeys use public staging.

| Journey/state | Observed | Result |
| --- | --- | --- |
| Document-path onboarding | Required factual steps, month/year, scoped start, handoff, then Home; no Plaid or mileage | PASS |
| Connected preference | Same minimum onboarding reaches Home without connecting Plaid | PASS |
| Month/year | Required selectors; future month disabled; PATCH persisted `2022-03`; no day/calendar control | PASS |
| Review/handoff | Review initially collapsed, can expand/edit; Go to WriteOffs remains primary | PASS |
| Home first use | Chosen ingestion CTA, secondary alternative, canonical empty financial snapshot | PASS |
| Home needs customer | Real shared Catch-up/current synthetic state; one primary CTA, canonical count | PASS |
| Processing/received | Actual worker/index transitions; no invented question or financial result | PASS |
| Account use | Normal Business-only command persists and triggers existing processing | PASS |
| Personal/mixed sweeps | Normal visible group confirmation, then canonical next action | PASS |
| Loan/special and ordinary questions | Merchant prominent; normal defer continues in place | PASS |
| Receipt sweep/confirmation | Upload opportunity and Later visible; scoped all-receipts confirmation succeeds | PASS |
| Only deferred | Separate saved-for-later completion, no ready-action claim | PASS |
| Current no-action completion | Two imported purchases organized, no ready/deferred action, truthful done-for-now | PASS |
| Home/Check-in/Reports | Home action count = question API count = work projection; Home totals = Reports | PASS |
| Mobile/tablet/desktop | Four specified widths, decoded PNGs, one main landmark, no horizontal overflow | PASS |
| Keyboard/text scaling | Skip link, menu Enter/Escape, control names, 200% text size, reduced motion | PASS within tested Chromium journeys |

The no-action current fixture has $87.18 working expenses and -$87.18 working profit,
including supported purchases with receipts declared unavailable. Documentation did
not erase those expenses.

The controlled May fixture completed 19 actions across two browser runs (10 then 9),
including two special-workflow deferrals, ordinary deferrals, sweeps and receipt
confirmation. Each run checked that action advancement did not navigate/reload the
page. A separate current-only journey completed five actions through genuine no-action
completion. These are UX regression journeys, not new bookkeeping-engine certification.

## Limitations and truthful state

- No synthetic fixture established whole-business complete-through coverage. The UI
  correctly says "You're done for now" instead of inventing a current-through date.
  The existing projection-driven dated-current branch retains automated coverage;
  a real dated-current screenshot was not fabricated.
- Document ingestion/broad account reassessment and index publication sometimes took
  several minutes in staging. The interface showed received/working states and resumed
  using the existing bounded continuation mechanism. This UX release did not optimize
  those workers or hold ordinary answers open waiting for them.
- Ordinary measured deferrals in these visual runs were approximately 0.39–0.81 seconds
  to a changed guided state. Batch confirmations were approximately 0.9–3.6 seconds.
  This is an incidental sample, not a new performance percentile certification.
- No live Stripe checkout, Plaid connection, native screen-reader hardware test, or
  Safari/device lab was performed. MFA was used for real staging browser sessions.
- Receipt Later persistence semantics are covered by the existing automated regression
  suite; this new manual-like journey exercised the all-receipts confirmation path.

## Issues found and corrected during UX certification

1. Contained PNGs explicitly inside the shared artwork frame; mobile intrinsic image
   sizing could otherwise exceed the intended guide height.
2. Moved Skip to content before header navigation after the real keyboard check caught
   its incorrect tab position.
3. Restored View receipt in guided question presentation where its previous contextual
   container was hidden by the guided composition.
4. Made account name primary and masked account digits secondary.
5. Corrected singular Home supporting count wording.
6. Improved certification waits: settled onboarding step after persistence, decoded
   images, and normal canonical action replacement/loading overlap. These were harness
   issues, not eligibility changes or hidden questions.

State Farm's overly broad question sequence is recorded in UX_1_SYSTEM.md for a focused
question-minimization pass. No merchant-specific rule was introduced.

## Validation

- Full suite: **1,668 passed, 143 skipped**; 233 files passed, 42 skipped. Skips are
  environment-dependent suites; they are not counted as passing integration tests.
- TypeScript/type generation: pass.
- ESLint: zero errors; 16 existing warnings.
- Optimized build: local webpack and dedicated Vercel Turbopack builds pass. Initial
  local Turbopack attempt hit a sandbox worker/bind restriction; cloud builds did not.
- Production dependency audit: zero vulnerabilities.
- Full dependency audit: two moderate existing dev-tool findings (`vitest` and
  `@vitest/mocker`, GHSA-82fw-gwwq-j7x9). Upgrade is separate maintenance, not hidden
  by changing dependencies in a UX release.
- Gitleaks source scan: no leaks.
- `git diff --check`: pass.
- Base contrast pairs: ink/paper 13.26:1; supporting/paper 6.24:1;
  white/action-blue 11.30:1; green/wash 6.41:1.

Logs and private synthetic credentials are outside Git under `/private/tmp/writeoffs-ux1`.
The screenshot gallery contains no credentials. Do not publish the entire temp folder.

## Files

Shared: `app/components/experience/*`, `Header.tsx`, `BettiIllustration.tsx`, `app/layout.tsx`.
Home: `app/home/{page,HomeBettiHero,loading}.tsx`, `command-center.css`, presentation copy
in `app/lib/home/command-center.ts`.
Guided: `ConversationShell.tsx`, `MerchantIdentity.tsx`, presentation-only portions of
`GuidedWork.tsx` and `QuestionFlow.tsx`, `guided.css`, `app/check-in/loading.tsx`.
Onboarding: `OnboardingFlow.tsx`, `onboarding.css`, `loading.tsx`.
Tests: UX-1 presentation tests and affected Home/onboarding/shell visual contracts.
Tooling/docs: `scripts/certify-ux1.mjs`, this report and `UX_1_SYSTEM.md`.

# Check-in advancement stability

## Observed clean-room facts

ATM uncertainty persisted once at 2026-09-23 19:17:26 UTC, with one indexed command
receipt. The index still has published revision 712 and its 18:50:22 UTC build
stamp. Current invalidation revision is 724. No worker publication occurred.
Answer-time invalidation/enrichment is distinct from a worker rebuild; the staging
exclusion prevents the latter and remains installed. No customer command, refresh,
reconciliation or publication was performed during this audit/fix.

The read-only canonical next action is ZELLE FROM EMILY CARTER, May 14, +$300:
“What was this money for?” The exact transient question seen by Rick is **not
recoverable from available evidence**: no client render trace or original response
body was retained, and command receipts do not persist the dynamic continuation.
Do not label a reconstructed candidate as an observed browser event.

## Proven defects and correction

1. Indexed commands can return independent surviving rows with summaryCurrent=false.
   The guided response wrapper previously accepted that as a new turn. Entry and
   refresh reads instead use the current canonical projection. A changed/held next
   action could therefore be exposed before the authoritative read. The wrapper
   now strips dirty continuations and resolves the next action read-only using the
   entry-page authority. If that fails, it returns the committed answer without
   provisional work; it never tells the client to resubmit a successful write.
2. The client also used a dirty returned projection directly. It now refuses it,
   shows an intentional checking state while reading the authoritative successor,
   and commits that successor once. The presented identity is set synchronously
   with acceptance, before a focus refresh, rather than only in an effect. Existing
   request-sequence and abort fences remain. Failed continuation reads keep a
   checking/error state, not the answered question or a provisional successor.
3. The browser test found a separate backend repeat: insurance uncertainty generated
   another identical question with the same evidence fingerprint and question
   context after reassessment. An uncertainty-created decision ID is not new
   customer evidence. The existing purpose-response eligibility guard now recognizes
   a not_sure response for the current resulting decision and unchanged evidence.
   It preserves unresolved bookkeeping and permits reconsideration when evidence or
   the current factual decision changes. Migration 20261005001100 changes only the
   function; no customer records or projections were rewritten.

These reproduce concrete failure mechanisms. They do not prove which transient
question Rick saw or which focus/network event occurred in that browser session.

## Advancement audit

Factual answers, uncertainty and ordinary deferral share guidedCommand/resolved.
Special workflows and account use return through the same parent continuation.
Personal and receipt groups use perform/resolved. Upload completion uses the
presented-identity evidence refresh and the same accepted-work commit. Ordinary
background publication does not replace ready work; a focus read carries the
already-presented identity. Genuine evidence changes retain explanatory notices.
No router round-trip or arbitrary transition delay was added.

## Regression evidence

- Previous client fails three new continuation/identity tests; corrected client passes.
- Dirty continuation never serializes as next work when canonical fallback fails.
- Canonical-read failure preserves committed answer success.
- Document evidence refresh commits one presentation and sends the displayed identity.
- Local SQL reproduces the uncertainty loop with the old helper and passes with the
  corrected helper. It also checks all four not_sure reasons, supported expense
  preservation, invalid payload rejection and distinct deferral semantics.
- Hosted 1280/390 run: 16 consecutive real synthetic transitions; one visible
  successor per turn (none when waiting), no provisional injected action, stable
  focus/page refreshes. Includes ATM uncertainty, specific questions, special-work
  deferral, grouped personal review and receipt deferral.
- The injected dirty continuation modifies a synthetic browser response only;
  the actual answer goes to staging once. No fake action is written to the database.
- First browser run identified the insurance loop and an overly strict test that
  prohibited waiting-to-ready progression. It was not certified as a full pass.
- The successful second run used the existing alternate synthetic 24-movement PDF
  fixture (partially validated statement coverage), so it has extra fee/mixed-use
  work. It certifies transitions, not the original clean-room eligibility/count.
  The original controlled-PDF fixture separately exercised a factual income answer;
  both fixtures have zero duplicate answered events per review issue.
- 1,939 tests passed; 143 environment-dependent tests skipped. TypeScript and
  optimized webpack build passed; lint zero errors / 16 pre-existing warnings.
- Secret/diff checks passed. Original-customer preservation: all 102 captured tables
  identical, including its current projection and prior valid answers.

The application correction was deployed as 88c5dee47b2cca7ea2963c65681bddf97bd8fe48
before hosted certification. Subsequent audit/test/migration commit is recorded in
Git history. Main and real Production were not modified.

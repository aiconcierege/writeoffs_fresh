# Catch-up Workflow V2 — staging certification

Verified September 24, 2026 (America/Phoenix; some evidence timestamps are September 25 UTC).

**Application:** `0a3c323ba23f26c97ef2e845bee9d3f9306cf58a`
**Dedicated staging:** https://writeoffs-fresh-staging.vercel.app
**Deployment:** `dpl_994xof46mmZzw1jXGXndaM7RdWLH`, READY
**Disposition:** ready for Rick's Customer #3 manual certification. This is not a declaration that UX or launch performance is finished. Customer #3 was not created. No public push, Main change or real Production deployment was performed.

## Architecture and journey

One canonical ledger remains authoritative. Immutable, business-owned journey events
coordinate statements → receipts/documents → explicit “Any more receipts?” completion
→ personal exceptions → non-expense exceptions → remaining material questions.
Current/ongoing work retains priority. Historical eligibility uses the fixed original
purchased/authorized interval. Covered August stays ongoing in October; aging never
creates a new cleanup charge or bulk-review obligation. The month-rollover regression
remains in `tests/bookkeeping/catch-up-v2.test.ts`.

Missing statement periods are explicit and nonblocking. “No receipts,” “later,” and
“done” are separate journey responses. Upload alone does not finish collection.
Dependent canonical extraction, matching and reassessment must settle before the
remaining historical questions are exposed. Read/render paths do not repair books.

Personal and non-expense reviews contain at most 20 items per turn. Confirming no
exceptions records only the review. Personal selections use existing canonical
corrections without changing source transactions. Non-expense selections create an
unresolved economic-nature question; they never invent a transfer or expense category.
Known transfers, card payments and principal do not become proposed expenses.

Customer-confirmed recurring payment facts are scoped by business, account,
counterparty, currency and date, with source-answer lineage and dependent decisions.
Invoice-specific hypotheses are not generalized. Conflicts, corrections and revocation
stop automatic reuse. Existing merchant percentage facts are reusable and correctable.
Inline help explains percentage estimation and why a loan statement is useful.
Context-aware choices exclude credit-card payment from outgoing Zelle/ATM questions.

“Questions left” counts the current substantive, answerable set, not uploads, jobs or
coverage reminders. It disappears at zero. The single visible transition says
“Updating your records” or describes document review. No next turn is rendered
optimistically. Completion says “You're all set for now,” separates missing records,
and links **Back to Home**.

## Demonstrated hosted results

Two separate synthetic May-statement journeys each imported 24 transactions and
retained $2,100.52 income, $1,425.73 expenses and $674.79 profit through the broad
reviews. One supplied no receipts; the other supplied the controlled two-receipt
page and two-page Verizon bill before substantive questions.

The three receipt records were independently extracted: printing $218.40, State Farm
$118.75 and Verizon $146.28. Printing-purpose and insurance-coverage questions were
removed by evidence. Verizon's business-use question remained. The ordinary transaction/deduction question records fell from 11 to 9. The
separate refund relationship and loan-document workflows remained; the customer-facing
substantive counter includes refund confirmation and excludes loan-document work. Later photo evidence also removed the
resolved questions without duplicating the 24 source transactions or changing totals.

A synthetic customer advanced through 12 distinct remaining actions using uncertainty
or explicit deferral. No answered action immediately repeated; completion remained
stable after browser refresh. A held server response kept one transition indicator
and the prior authoritative action until release. Slow document processing retained
the requested-document state and deliberate continuation.

Hosted learned-percentage integration used one 70% fact across two $140 Verizon
bills ($98 business each), then a customer correction to 50% ($70 each). A real
conflicting-evidence review blocked reuse without changing source transactions.
This test used the staging database/application engine; it was not a browser-entry
benchmark. Recurring Stripe facts, idempotency, revocation and tenant/MFA checks were
also exercised in the disposable local database and engine regressions.

## Synthetic scenario matrix

Evidence labels are intentionally specific. A deterministic/SQL test is not claimed
as a physical-device or full hosted-browser test.

| Required scenario | Result and evidence |
| --- | --- |
| A. Business-only, no receipts | PASS — hosted UI: statement gaps → none → both broad reviews → material questions; unchanged P&L |
| B. Business-only, with receipts | PASS — hosted UI: upload → processing → deliberate continue → more/done → reviews → narrowed questions |
| C. Mixed account | PASS — deterministic projection: no business presumption; factual use question remains |
| D. Multiple receipts on one PDF page | PASS — hosted extraction: printing and insurance are separate receipt records |
| E. Multi-page single document | PASS — hosted two-page Verizon bill: one logical receipt |
| F. Multiple mobile receipt images | PASS — hosted browser picker and grouped-photo upload |
| G. HEIC/HEIF | PASS within decoder support — real HEIC ordinary picker in hosted WebKit; Chromium rejects unsupported HEIC with conversion/camera guidance. All HEIF codec variants are not certified |
| H. Rotated image | PASS — local Chromium/WebKit EXIF orientation and original-byte retention |
| I. One photo with multiple receipts | PASS — hosted JPEG derivative extraction: separate printing/insurance records |
| J. One receipt represented by multiple images | PASS — hosted grouped Verizon photos: one logical receipt, source attachments retained |
| K. Duplicate receipt/photo | PASS — hosted identical HEIC retry creates no extra document; source count and P&L unchanged; deterministic byte stability checked |
| L. Irrelevant document | PASS — hosted image reaches attention state and can be set aside; no invented extraction |
| M. Unreadable receipt | PASS — hosted unreadable image can be set aside with no invented extraction; corrupt bytes fail visibly in local browser tests |
| N. Recurring Stripe treatment | PASS — local SQL and engine: explicit learned payment, fingerprint checks, exact retry, revocation and lineage |
| O. Remembered Verizon percentage | PASS — staging DB/application-engine integration: one percentage reused on two later bills |
| P. Material conflict | PASS — staging percentage conflict blocks reuse; recurring-payment conflict regressions also pass |
| Q. Bulk personal selection | PASS — rollback SQL: canonical personal correction, immutable source, atomic/stale/tenant checks |
| R. Non-expense selection | PASS — rollback SQL: unresolved economic nature and minimal follow-up, no fabricated classification |
| S. Known transfer excluded | PASS — deterministic eligibility and hosted candidate sets |
| T. Loan principal excluded | PASS — preserved Customer #2 $400 principal/$50 interest evidence and existing loan regressions; loan upload was not repeated on either frozen customer |
| U. Question count | PASS — hosted evidence removes two questions; completion has no counter; deterministic narrowing/count changes |
| V. Slow/no-flash transition | PASS — hosted controlled response hold, stable document review, distinct sequential actions and refresh-stable completion; existing continuation regression suite passes |
| W. Mobile | PASS — hosted Chromium/WebKit at 390/430; camera/photo controls, bounded reviews, question and completion layouts; no horizontal overflow |
| X. Desktop | PASS — hosted desktop Chromium at 1280/1440; populated document list, Home and Check-in; no horizontal overflow |

Current-only, connected-account, complete-statement-coverage, missing-history,
receipt-defer and pagination cases additionally pass deterministic routing tests.
Receipt-only, rematch, duplicate protection, loan splitting and evidence lineage
remain covered by the full existing regression suite; no new accounting system was
introduced.

## Document experience and formats

The import page now uses a Betti evidence handoff, bright primary surface, drag/drop,
photo/file selection, mobile camera entry, per-file upload state and meaningful
processing/attention/status rows. It preserves the logo and right-side Menu.
Original images remain byte-identical attachments when normalized into grouped PDFs.
EXIF orientation, portrait/landscape images, screenshots and 24-megapixel downsizing
were exercised in both browser engines. Image-only PDFs use bounded OCR with page
coordinates preserved for receipt boundaries and lineage; text PDFs keep native text.

JPEG, PNG and PDF were exercised end to end. WebP remains supported by existing intake.
HEIC was tested with an actual HEIC file in WebKit, including ordinary ungrouped
selection and duplicate submission. Unsupported decoders fail visibly before upload.
No claim is made that every Android/iPhone hardware camera, OS release or HEIF codec
was tested. Rick's physical-device walkthrough remains useful manual certification.

The document list gives an aggregate source-file status; a split multi-receipt source
can show “Receipt organized” even when its individual receipts have matched. The
individual evidence/receipt records remain authoritative. This presentation limitation
does not affect matching, question removal or financial totals.

## Defects found and corrected during synthetic certification

- Receipt completion incorrectly waited on noncanonical shadow-analysis jobs. The
  guard now uses the existing canonical dependency predicate; active extraction still
  blocks continuation. A failing rollback test was reproduced before correction.
- Special refund uncertainty could repeat immediately. New uncertainty events retain
  their evidence basis and stay suppressed until relevant evidence changes. Explicit
  deferral retains its separate revisit semantics. No historical answers were rewritten.
- Grouped image-only PDFs had no useful native text. Bounded OCR now supplies evidence
  and correctly mapped page coordinates without altering source bytes or assuming that
  a receipt exists in an unreadable image.
- The upload Betti container could collapse, and HEIC previously required an unnecessary
  grouping selection. Both were corrected and verified in the final hosted build.

## Validation

- Full Vitest: **2,118 passed; 143 skipped** (296 passing files, 42 skipped files).
  Skips require separate environments; they are not counted as passes.
- Dedicated rollback SQL: catch-up events, selected exceptions, idempotency, stale
  input, MFA/RLS/tenant denial, recurring facts and evidence-bound uncertainty: PASS.
- TypeScript: PASS. ESLint: zero errors, 15 existing warnings.
- Optimized local production build and dedicated-staging remote build: PASS.
- Scoped secret scan and `git diff --check`: PASS.
- Hosted screenshots inspected at 390, 430, 1280 and 1440; desktop and mobile browser
  modes both used. No clipping/overflow found in the reviewed workflow states.

## Preservation and deployment

[Final preservation manifest](preservation-final.json) compares all 139 captured
business-owned tables/views for each frozen customer to pre-work values. Both match
exactly. Both staging worker exclusions remain enabled. New V2 journey, recurring-fact,
dependency and uncertainty-basis tables have **zero** rows for either frozen customer.
No frozen customer was signed into, answered, uploaded to, rebuilt or retrofitted.

[Customer #2's captured certification record](CUSTOMER-2-PRESERVATION.md) preserves
its statement, three receipts, loan decomposition, refund relationship, all answers,
remaining uncertainty, final totals and missing periods. Raw captures remain protected
locally; committed evidence contains counts/hashes and necessary audit facts.

Local application commits: `e7b9290`, `4663ebf`, `23fceac`, `0a3c323`.
The final documentation/harness commit does not change the deployed application.
No public push is authorized or performed.

## Remaining pre-launch work

These are not certified away by this functional pass:

- Canonical purchase-purpose fallback: approximately 3.77–4.70 seconds.
- Remaining routine interaction p95 tails.
- Receipt reassessment: approximately 46 seconds median / 71 seconds p95.
- Document processing, including the prior approximately 59-second loan example.
- Sequential evidence/category validation architecture.
- Hosted synthetic initial statement reassessment can take several minutes under
  staging workload (one run involved 94 jobs). The UI preserves processing truth and
  offers an explicit next-step check when automatic polling pauses.
- Physical-device camera/chooser testing and unsupported HEIF variants.
- Aggregate status wording for split receipt source files, as noted above.

No artificial delay or false completion was introduced. Final Betti art remains
external; component boundaries are preserved. Broad final art direction is separate.

## Evidence locations

- [Hosted synthetic outcomes](hosted-synthetic.json)
- [Mobile format/orientation checks](mobile-photo-local.json)
- [Preservation](preservation-final.json)
- [Selected synthetic screenshots](screenshots/)
- Additional private synthetic screenshots: `/private/tmp/writeoffs-routing-catchup-v2-receipts/proof/`
  and `/private/tmp/writeoffs-routing-catchup-v2-none/proof/`
- Reproducible harnesses: `scripts/certify-catch-up-v2.ts`,
  `scripts/certify-catch-up-learned-percentage.ts`,
  `scripts/certify-mobile-receipt-photos.mjs`.

Rick should create and operate a new Customer #3 manually. Neither frozen customer
should be used to simulate this new journey.

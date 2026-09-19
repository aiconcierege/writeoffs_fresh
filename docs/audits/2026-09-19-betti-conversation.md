# Work with Betti: persistent conversation and evidence audit

Status: implementation and synthetic functional certification passed; final release identifiers are recorded below. This is an implementation record, not a change to bookkeeping policy.

## Interaction

`ConversationShell` owns the mounted stage, character, orientation, return link and saved-answer region. Individual action components render inside that stage. The active content fades from 65% to full opacity over 160 ms; there is no artificial answer delay. Reduced motion disables the fade. The character uses the existing `BettiPresence` boundary; Fiverr review assets are excluded.

The previous screen had two competing compositions: permanent Betti copy on the left and an action form on the right. Ordinary actions were not necessarily full document reloads. The correction removes the competing copy, anchors the stage/character, limits transitions to conversation content, and keeps the special-payment “Something else” fallback inside the same workspace when its canonical ordinary question is available.

Answer buttons immediately become unavailable for duplicate submission. A saving acknowledgment does not claim persistence. Saved confirmation appears only after a successful command. Deferrals use the existing canonical commands and advance to independent ready work. Processing is derived from the authoritative projection, with existing bounded automatic refresh; there are no visit quotas.

Receipt requests explain the purchase group before displaying the upload control. “Choose receipts” uses the existing intake pipeline. “I’ll send receipts later” defers the scoped opportunity. Moving to the availability review does not assert that receipts are unavailable; the subsequent “That’s all the receipts I have” applies only to its visible versioned group.

Home retains its layout. Its customer-action message describes reviewed information and asks for facts, the supporting count uses canonical customer actions, and recent activity shows five in-scope records.

## Canonical evidence changes

- A current observed bank credit, complete interest narrative (or reliable provider interest category), business-only account fact and non-conflicting metadata can establish working interest income. Credits with loan/refund/reversal/dividend ambiguity do not meet this rule. No tax-form election is inferred.
- A current bank settlement narrative or named incoming sender plus invoice reference supports a customer-payment hypothesis. The canonical question carries source identity, shared-evidence fingerprint, inferred basis and confidence. It still requires confirmation; no payout gross-up, fee, ownership or reconciliation fact is invented.
- Insurance and printing-service purchase evidence establish purchase nature separately from category and business use. Insurance coverage and the purpose of printing can remain material questions. This is general vocabulary/provider evidence, not a merchant-name table.
- A customer answer establishing only “purchase” no longer prevents use of a separate durable Business-only account fact. A dedicated worker-only command validates the exact purchase answer, current decision and account-use event atomically. Explicit personal/mixed/excluded decisions, prior explicit use decisions, changed versions and conflicts remain protected. The general automation guard against overwriting customer decisions remains.
- The question-identity SQL wrapper now preserves and versions richer worker understanding. Previously its common fact identity could discard that context when another generator refreshed the same question. Deferrals and resolved facts remain closed, and one fact remains one issue.
- Refund relationship confirmation uses the existing guarded refund-link command directly when a candidate purchase is already available. Principal/interest, refund amount/currency/year and working-book/documentation safeguards remain unchanged.

## Counting method

Compare settled canonical projections, not temporary counts while workers or the action index are still updating. Separate:

1. transactions with organized working treatment;
2. currently ready customer actions (one sweep can cover several purchases);
3. the complete sequence of facts/actions actually requested, including follow-ups;
4. deferred actions versus completed answers.

The frozen before snapshot contains 24 transactions, 10 organized, 15 ready actions, $2,100.00 working income and $1,088.58 working expenses. An earlier transient 13-action reading was not settled and is not the baseline.

## May statement: evidence and material uncertainty

All rows have statement provenance, signed amount, date and account identity. The intended scenario uses an explicitly authorized historical interval and a customer-supplied Business-only account fact. No receipt is assumed merely from the statement. The measured questions and outcomes follow below.

| Date | Activity | Amount | Evidence supports | Material uncertainty / minimum customer fact |
|---|---|---:|---|---|
| May 2 | Zelle from Jane Morris, INV 1041 | +$850.00 | Named sender, incoming payment rail, invoice reference | Confirm the invoice/customer-payment relationship; the memo alone is not proof of revenue |
| May 3 | Adobe Creative Cloud | −$22.99 | Software subscription and business account context | No ordinary purchase/use question; scoped personal/receipt exceptions remain possible |
| May 4 | ACH deposit, Blue Mesa Consulting | +$1,250.00 | Incoming ACH and named counterparty | Source: customer payment, owner money, borrowing, transfer or other; counterparty name alone cannot establish this |
| May 5 | Transfer from savings 1111 | +$500.00 | Direction, financial-account class and masked identifier | No broad source question; no ownership or completed reconciliation claimed |
| May 6 | City of Goodyear business license | −$75.00 | Business license payment | No ordinary purchase/use question |
| May 7 | Zelle from Robert Hall | +$425.00 | Incoming person-to-person payment | Source of money; name and payment rail are insufficient |
| May 8 | Verizon Wireless | −$146.28 | Phone service | Supported business-use percentage; phone allocation is a distinct fact |
| May 9 | Check 104, Desert Print Shop | −$218.40 | Printing-service purchase and account context | What the printing was for; advertising and office materials can require different treatment |
| May 10 | ACH payment, business credit card 3333 | −$1,284.37 | Credit-card balance payment | No expense or broad source question; no double counting |
| May 11 | Stripe payout | +$735.44 | Processor-style bank settlement | Narrow customer-payment confirmation; no unsupported gross sales/fees inferred |
| May 12 | Office Depot | −$64.19 | Existing supported office-supplies evidence | No redundant purchase/use question |
| May 13 | Transfer to savings 1111 | −$300.00 | Direction, financial-account class and masked identifier | No broad purpose question |
| May 14 | Zelle from Emily Carter | +$300.00 | Incoming person-to-person payment | Source of money; payment rail/name alone are insufficient |
| May 15 | Loan payment, Equipment Finance Co | −$450.00 | Loan payment | Statement needed for principal, interest and fees; entire payment is not an expense |
| May 16 | Cash deposit | +$600.00 | Cash entered the account | Source of cash; cannot infer sales versus owner funds or other sources |
| May 18 | Google Workspace | −$14.40 | Software service and business account context | No ordinary purchase/use question |
| May 19 | ACH credit, client payment | +$2,100.00 | Explicit customer role, incoming rail and business account | No generic source question |
| May 20 | ATM withdrawal | −$200.00 | Money left the bank account | What happened to the cash; no automatic expense or personal-use assumption |
| May 22 | Zelle to Mark Reynolds | −$175.00 | Outgoing payment to a person | What happened / what was purchased if a purchase; do not repeat the already-established account-use fact |
| May 24 | State Farm Insurance | −$118.75 | Insurance purchase and business account context | What coverage was purchased; business, vehicle and health insurance are distinct |
| May 26 | Check 105, Valley Office Rent | −$900.00 | Office rent | No ordinary purchase/use question |
| May 28 | Office Depot refund | +$32.10 | Refund credit and candidate earlier purchase | Confirm original purchase; no silent relationship selection |
| May 29 | Bank service fee | −$12.00 | Bank fee | No ordinary purchase/use question |
| May 31 | Interest paid | +$0.52 | Bank credit interest and business account | No source question; working income without a tax-form election |

The supplied PDF places the Stripe payout on May 11. Some earlier narrative examples used May 28; certification uses the actual imported date.

## Validation evidence

Private synthetic credentials are not included in this report or the repository.

### Measured results and counting limits

| Measurement | Before | After, before individual questions | Final settled books |
|---|---:|---:|---:|
| Imported transactions | 24 | 24 | 24 |
| Organized working treatment | 10 | 11 | 23 |
| Ready customer actions in captured projection | 15 | 12 | 0 |
| Working income | $2,100.00 | $2,100.52 | $6,260.96 |
| Working expenses | $1,088.58 | $1,425.73 | $1,671.03 |
| Working profit | $1,011.42 | $674.79 | $4,589.93 |

The 15 → 12 comparison is a **ready-action snapshot**, not a claim that the complete customer journey fell by three actions. The after snapshot still contains batch prerequisites that suppress dependent questions. No complete pre-pass answer journey was captured, so an exact pre-pass total including future follow-ups is unavailable; it would be misleading to invent one.

The complete after journey required **23 persisted interactions**: one account-use fact, four personal/mixed batch reviews, two receipt-stage advances, two scoped receipt-availability assertions, twelve individual material answers, one refund relationship confirmation, and one loan-document deferral. Thus fourteen transaction-specific requests remained, including the loan and refund. Twenty-two interactions completed; one deferred. Multiple browser-driver investigations occurred before the separately certified uninterrupted 17-action run; they are not presented as one uninterrupted 23-action session.

Final reports contain $43.88 personal phone use, $0 uncategorized business expense, and ten documentation limitations. Missing receipts did not remove the supported expenses. The loan remains outside expenses pending principal/interest evidence. There is no supported whole-business current-through date or reviewed Catch-up snapshot; completion does not claim either.

### Autonomous treatment, category and documentation by record

This table complements the evidence/uncertainty table above. “Business” for ordinary purchases uses the explicit account fact; phone allocation remains a separate fact. “No receipt” is a documentation limitation, not exclusion from working books. The final scoped assertions cover ten purchases; statements remain the source evidence for all rows.

| May day / record | Economic nature before individual answers | Business use before individual answers | Working category before individual answers | Documentation / remaining material request |
|---|---|---|---|---|
| 2 Jane invoice | Customer-payment hypothesis | Source confirmation needed | None until confirmed | Statement; narrow source confirmation |
| 3 Adobe | Expense | Business | Software | No receipt; no individual question |
| 4 Blue Mesa | Incoming, source unresolved | Source confirmation needed | None | Statement; source question |
| 5 From savings | Transfer | Non-P&L | None required | Statement; no question |
| 6 Business license | Expense | Business | Taxes/licenses | No receipt; no individual question |
| 7 Robert | Incoming, source unresolved | Source confirmation needed | None | Statement; source question |
| 8 Verizon | Phone expense | Percentage required | Phone/utilities context | No receipt; business percentage |
| 9 Printing | Expense | Business | Unresolved purpose | No receipt; what the printing was for |
| 10 Card payment | Credit-card balance payment | Non-P&L | None required | Statement; no question |
| 11 Payout | Customer-payment hypothesis | Source confirmation needed | None until confirmed | Statement; narrow source confirmation |
| 12 Office Depot | Expense | Business | Office expense | No receipt; no individual question |
| 13 To savings | Transfer | Non-P&L | None required | Statement; no question |
| 14 Emily | Incoming, source unresolved | Source confirmation needed | None | Statement; source question |
| 15 Loan | Loan payment | Split required | None until principal/interest evidence | Loan statement requested; deferred |
| 16 Cash deposit | Incoming, source unresolved | Source confirmation needed | None | Statement; source question |
| 18 Google | Expense | Business | Software | No receipt; no individual question |
| 19 Client payment | Customer income | Business | Existing income treatment | Statement; no question |
| 20 ATM | Outgoing cash, purpose unresolved | Unresolved | None | Statement; movement versus purchase/other |
| 22 Mark | Outgoing payment, nature unresolved | Account fact reusable once purchase established | None | Statement; nature then service/item purpose |
| 24 Insurance | Expense | Business | Coverage unresolved | No receipt; coverage question |
| 26 Office rent | Expense | Business | Rent | No receipt; no individual question |
| 28 Refund | Purchase refund candidate | Follows confirmed purchase | Office expense candidate | Statement + candidate relationship; confirm |
| 29 Bank fee | Expense | Business | Fees | No receipt; no individual question |
| 31 Interest | Interest income | Business account context | Existing working income treatment | Statement; no question |

After the supplied facts, printing is advertising, insurance is business insurance, Mark’s freelance services are contract labor, phone is split 70%/30%, refund offsets the confirmed office purchase, and ambiguous incoming funds are customer receipts per explicit synthetic answers. No amounts were invented from descriptions.

### Questions removed or narrowed

- Incoming bank interest: removed the source question entirely; observed bank credit, complete interest evidence and business-account context establish working income.
- Insurance: removed the broad economic-nature question and redundant business-use follow-up. Coverage remains a distinct factual question.
- Printing: removed the broad economic-nature question; purpose remains necessary to distinguish the existing supported categories.
- A customer answer establishing only purchase nature now consumes the existing Business-only fact rather than asking business use again. Explicit contrary customer decisions remain protected.
- Invoice-marked incoming payment and processor settlement: replaced the broad initial choices with evidence-backed confirmation. “No, something else” reveals the canonical alternatives. A real-browser check verified that opening these alternatives sends no answer POST. These are narrower questions, not eliminated questions.
- Refund: directly asks for the candidate relationship when one is available, rather than first requiring a redundant “returned by the store” step.
- A supplied freelance-services purpose now matches the existing contract-labor classifier. The earlier incomplete word pattern left a known expense uncategorized; no further question is necessary.

Confidence values are rule-based evidence grades, not calibrated statistical probabilities. Observed versus inferred evidence, source identity, evidence fingerprint, current decision and supporting account/customer events remain separate and auditable. The 0.8 payout/invoice hypothesis requires confirmation; it does not autonomously infer gross sales or fees.

### Every retained transaction question

All purchase business-use conclusions below reuse the durable account fact and applicable exception reviews. Documentation is separately confirmed only for the visible receipt group.

| Transaction | What Betti knows | Missing fact / why it changes treatment | Exact question/request | Control |
|---|---|---|---|---|
| Blue Mesa ACH credit | Money entered the account; named counterparty | Whether customer receipts, owner funds, borrowing or another source; name alone does not establish income | What was this money for? | Six factual choices, with explanation of ambiguity |
| Robert Hall Zelle credit | Incoming person-to-person payment | Source determines income versus non-P&L treatment | What was this money for? | Six factual choices |
| Cash deposit | Cash entered the bank | Sales versus previously held cash, owner money or another source | What was this money for? | Six factual choices |
| Jane Morris INV 1041 | Named incoming sender and invoice reference | Confirm that this represents customer payment rather than an incorrectly described movement | Is that right? | Yes, that’s right / No, something else |
| Stripe payout | Settlement narrative supports processor/customer-payment hypothesis | Confirm economic nature; no unsupported fee/gross-sales inference | Is that right? | Yes, that’s right / No, something else |
| Emily Carter Zelle credit | Incoming person-to-person payment | Source determines income versus non-P&L treatment | What was this money for? | Six factual choices |
| ATM withdrawal | Cash left the account | Cash movement versus a purchase/other activity; withdrawal alone is not an expense | What kind of activity was this? | Four outgoing-activity choices |
| Mark Reynolds outgoing Zelle | Outgoing payment to a person | Was this a purchase or movement? Neither direction nor name answers this | What kind of activity was this? | Four outgoing-activity choices |
| Mark Reynolds, after purchase answer | Purchase and business use established | What service/item was purchased determines supported working category | What was this purchase for? | Concise factual text |
| Verizon | Phone service established | Business-use percentage is a distinct allocation fact | About how much do you use this phone service for your business? | Percentage input |
| State Farm | Insurance purchase and business use established | Business, vehicle and health coverage require different treatment | What did the insurance cover? | Business insurance / A vehicle / Health insurance / Something else |
| Desert Print Shop | Printing purchase and business use established | Advertising versus office materials or other purpose | What was this purchase for? | Concise factual text |
| Office Depot refund | Refund and candidate original purchase | Relationship is not silently assumed; prevents incorrect expense offset | Is it for this purchase? | Candidate purchase + Yes, that’s it / alternative |
| Equipment-finance loan | Loan payment established | Principal, interest and fees cannot be safely separated from the bank debit | Send me the loan statement. | Choose statement / I’ll come back to this |

Eleven May transactions need no individual material question: Adobe, both savings transfers, business license, credit-card balance payment, Office Depot purchase, Google Workspace, explicit client payment, office rent, bank fee, and interest. One retained transaction (Mark) requires two distinct facts: 14 requests across 13 questioned records; 11 records receive no individual request.

### Integration defects found and corrected during certification

1. Background refresh could replace a ready question while the customer was reading or pointing at an answer. Ready questions now remain anchored; commands retain exact-version validation, and focus/stale recovery refresh canonical state. Waiting screens still use bounded automatic refresh.
2. Ordinary canonical questions unnecessarily loaded the separate special-work endpoint before rendering. Only canonically projected special actions use that loader; this also removes an alternate description-based presentation decision.
3. Canonical question identity refresh could discard richer worker understanding. The SQL wrapper preserves/version-controls it without reopening resolved or deferred facts.
4. Purchase-only customer answers prevented reuse of durable account context. The narrow, worker-only completion command fills only the missing dimension.
5. The existing freelance word pattern missed the full word. Its general inflections now use the existing category; safeguards for conflicting/special evidence remain.
6. Mobile Betti/acknowledgment could overlap. Reserved orientation and notice space now prevent it.
7. A shortened non-interactive receipt list needed keyboard focus to scroll. It now has a named group, keyboard focus and visible outline.

The certification driver also needed correction: React can retain the previous render in an alternate fiber. The driver now checks the displayed version on either branch, and does not wait for a broad summary while an already-valid guided action is visible. These driver pauses are not reported as customer-interface stops or successful uninterrupted runs.

### Continuous browser session

Public dedicated staging; one authenticated browser document. The following run did not restart or navigate Home between actions. Stage and Betti DOM identities stayed identical; `performance.timeOrigin` stayed constant and navigation-entry count remained one. Recorded before/after scroll positions remained zero. Explicit screenshot resizing/scroll positioning is test activity, not application navigation.

| # | Action | Context | Result | Next visible | Click → next (ms) |
|---|---|---|---|---|---:|
| 1 | receipt_upload_sweep (receipt_upload_sweep) | catch_up | completed | material_question | 2172 |
| 2 | ACH DEPOSIT - BLUE MESA CONSULTING (transaction_type) | catch_up | completed | material_question | 631 |
| 3 | ATM WITHDRAWAL (transaction_type) | catch_up | completed | material_question | 811 |
| 4 | ZELLE FROM ROBERT HALL (transaction_type) | catch_up | completed | material_question | 663 |
| 5 | CASH DEPOSIT (transaction_type) | catch_up | completed | material_question | 484 |
| 6 | ZELLE FROM JANE MORRIS - INV 1041 (transaction_type) | catch_up | completed | material_question | 788 |
| 7 | STRIPE PAYOUT (transaction_type) | catch_up | completed | material_question | 517 |
| 8 | ZELLE FROM EMILY CARTER (transaction_type) | catch_up | completed | material_question | 708 |
| 9 | verizon (percentage) | catch_up | completed | received | 2573 |
| 10 | receipt_availability (receipt_availability) | catch_up | completed | received | 4863 |
| 11 | personal_exception_sweep (personal_exception_sweep) | catch_up | completed | material_question | 831 |
| 12 | ZELLE TO MARK REYNOLDS (business_purpose) | catch_up | completed | material_question | 712 |
| 13 | STATE FARM INSURANCE (business_purpose) | catch_up | completed | material_question | 491 |
| 14 | CHECK #104 - DESERT PRINT SHOP (business_purpose) | catch_up | completed | processing | 496 |
| 15 | mixed_use_sweep (mixed_use_sweep) | catch_up | completed | received | 1329 |
| 16 | receipt_upload_sweep (receipt_upload_sweep) | catch_up | completed | received | 1028 |
| 17 | receipt_availability (receipt_availability) | catch_up | completed | received | 1485 |

A separate four-action run explicitly verified mixed sweep → loan deferral → refund confirmation → ordinary purchase question. Both runs kept the same stage/character within their respective sessions. The later 17-action run includes receipt, personal, mixed, narrow confirmation, broad ambiguity, percentage and purpose actions. Processing resumed within the workspace; no action quota or subtype boundary forced a stop.

### Public staging performance

| Sample | n | p50 | p75 | p95 | Max |
|---|---:|---:|---:|---:|---:|
| Ordinary material answers, excluding percentage/background-dependent path | 10 | 631ms | 712ms | 811ms | 811ms |
| Prior accepted approximate baseline | — | 525ms | — | 711ms | — |

This is a small end-to-end browser sample, not a capacity or cold-start benchmark. The ordinary range was 484–811ms. The sample is somewhat slower than the previous median, but remained sub-second; no performance architecture was reopened. DOM acknowledgment appeared in 0.7–2.3ms in the 17-action run; that is the measured disabled/acknowledgment mutation, not a claim about physical screen refresh.

Slower paths are disclosed separately: phone percentage → dependent state 2.57s; receipt-stage advance 1.03–2.17s; scoped receipt assertion 1.49–4.86s; loan deferral 2.00s; refund confirmation 1.04s; mixed sweep samples 1.33–3.48s. Normal worker reassessment can add waiting time after the immediate response. These are remaining latency limitations, not concealed ordinary percentiles. The new fade adds no artificial wait to persistence or rendering.

### Functional/security matrix

| Case | Result | Evidence |
|---|---|---|
| Interest | PASS | Working income $0.52; no source question |
| Processor payout / invoice | PASS | Narrow confirmation; broad alternatives remain available |
| Insurance | PASS | Coverage only; no purchase/use repeat |
| Phone | PASS | Percentage only; $102.40 business / $43.88 personal |
| McDonald’s receipt | PASS | Two material meal-context facts; no “what did you buy”; $9.54 working expense |
| Clear transfer / credit-card payment | PASS | No individual question; no expense double count |
| Refund | PASS | Candidate confirmed; $32.10 expense offset |
| Loan | PASS | Deferred document request; $450 not expensed |
| Unknown incoming / outgoing | PASS | Genuine ambiguity retains factual choices |
| Business-only durable fact | PASS | One account event; no repeated ordinary business-use question |
| Mixed account | PASS | $130 business / $245 personal; factual choices persisted |
| Receipt Later | PASS | One deferred receipt opportunity; no unavailable assertion |
| Receipt completion | PASS | Two visible/versioned groups; ten documentation limitations; expenses retained |
| Out-of-scope May source with no Catch-up | PASS | Zero questions, income and expenses; Catch-up absent |
| Catch-up + Current | PASS | Existing synthetic concurrent fixture read-only; canonical projection/equivalence tests preserve shared actions and priority |
| Home / Check-in / Reports | PASS | Settled counts agree; canonical financial totals match |
| Continuous work / no loops | PASS | 17 actions; one document; stable stage/Betti; no forced stops |
| Scope / membership / MFA / tenant | PASS | Full unit suite plus public endpoint and SQL rollback security checks |
| Stale action / idempotency | PASS | Exact-version rejection, canonical assertion identity, question-loop and action-index rollback checks |
| Narrow / full projection equivalence | PASS | Existing shared selector and new evidence-bearing action tests |

### Accessibility and visual evidence

Real staging screenshots cover 390, 430, 768 and 1280px. Browser checks include one main landmark, no horizontal overflow, 200% root text scaling, semantic controls/labels, WCAG 2/2.1 AA automated checks, visible keyboard focus, keyboard receipt-list scrolling and reduced-motion styles. Automated checks do not replace a full assistive-technology audit; VoiceOver/NVDA was not run.

The screenshot review checked anchored Betti, one question hierarchy, compact transaction identity, responsive controls, receipt explanation before upload, stable acknowledgment space and restrained completion. The final receipt list and keyboard correction were recaptured on public staging. The gallery retains earlier diagnostic screenshots for traceability; use the final paths below for acceptance.

Gallery: `/private/tmp/writeoffs-conversation/gallery.html`

| State | Screenshot stem (append `-390.png`, `-430.png`, `-768.png`, `-1280.png`) |
|---|---|
| Strong confirmation | `staging/work-material_question-strong-confirmation` |
| Genuine ambiguity | `staging/work-material_question-transaction_type` |
| Insurance | `staging/work-material_question-insurance` |
| Phone percentage | `staging/work-material_question-phone` |
| Personal sweep | `staging/work-personal_exception_sweep-batch` |
| Mixed-account sweep | `staging-mixed/work-mixed_use_sweep-batch` |
| Final receipt sweep | `staging/work-read-only` |
| Loan document | `staging/work-special_transaction-loan` |
| Refund | `staging/work-special_transaction-refund` |
| Processing | `staging/work-processing` |
| Only-deferred completion | `staging/work-only-deferred` |
| Genuine no-action completion | `staging-meal/work-completion` |
| Home needs customer | `staging/home-needs-customer` |

### Build and security validation

- Full suite: **1,715 passed; 143 environment-gated skipped; 234 passing test files**.
- TypeScript: passed.
- Lint: zero errors; 16 pre-existing warnings.
- Optimized dedicated-staging build: passed (Next.js 16.3.3).
- Secret scan of deployment source: zero findings. Unapproved Fiverr review assets excluded.
- Dependency audit: zero production vulnerabilities; two pre-existing moderate development-tool findings in Vitest/@vitest/mocker (GHSA-82fw-gwwq-j7x9). No dependency changes.
- Real staging rollback checks: purchase-only completion nine assertions; question-understanding six assertions; canonical action-index security PASS. Test changes rolled back.
- Public endpoint checks: anonymous denied; AAL1 denied; spoofed identity headers ignored; verified AAL2 allowed.
- Local Node 20 differs from repository Node 22 requirement; Vercel produced the optimized build. No runtime dependency was added.

### Release boundaries

Two migrations were applied only to dedicated staging: `20261001000100_preserve_question_understanding.sql` and `20261001000200_complete_purchase_business_context.sql`. Neither rewrites existing customer data. A normal deterministic job re-evaluated one synthetic held record after the classifier correction; no manual decision/amount/category edits were made.

No Rick account was used as a mutable fixture. Main and real Production remain untouched. Fiverr Rive/reference/preview review files remain untracked and excluded from deployment. No Reports, Transactions, Documents-management, mileage, money, invoices or settings redesign occurred.

Remaining limits: the exact pre-pass full follow-up count was not recorded; snapshot counts are not total journey counts. Heavy/special paths remain slower than ordinary answers. No unsupported current-through or reviewed-Catch-up completion claim is made. Final subjective design approval remains Rick’s.

Commit and final dedicated-staging URL are recorded in the release response.

### Changed files

- `app/components/SpecialTransactionFlow.tsx`
- `app/components/guided/ConversationShell.tsx`
- `app/components/guided/GuidedWork.tsx`
- `app/components/guided/guided.css`
- `app/documents/DocumentIntake.tsx`
- `app/lib/bookkeeping/betti-work.ts`
- `app/lib/bookkeeping/customer-questions.ts`
- `app/lib/bookkeeping/deterministic-evaluator.ts`
- `app/lib/bookkeeping/economic-nature-evidence.ts`
- `app/lib/bookkeeping/evaluation-snapshot.ts`
- `app/lib/bookkeeping/model.ts`
- `app/lib/bookkeeping/operating-expense-classification.ts`
- `app/lib/bookkeeping/operating-expense-processing.ts`
- `app/lib/bookkeeping/processing.ts`
- `app/lib/bookkeeping/purchase-understanding.ts`
- `app/lib/bookkeeping/service.ts`
- `app/lib/bookkeeping/supabase-repository.ts`
- `app/lib/home/command-center.ts`
- `app/lib/home/recently-handled.ts`
- `app/questions/QuestionFlow.tsx`
- `docs/audits/2026-09-19-betti-conversation.md`
- `scripts/certify-betti-conversation.mjs`
- `supabase/migrations/20261001000100_preserve_question_understanding.sql`
- `supabase/migrations/20261001000200_complete_purchase_business_context.sql`
- `tests/bookkeeping/action-index.test.ts`
- `tests/bookkeeping/conversation-confirmation.test.ts`
- `tests/bookkeeping/customer-questions.test.ts`
- `tests/bookkeeping/economic-nature-evidence.test.ts`
- `tests/bookkeeping/foundation.test.ts`
- `tests/bookkeeping/guided-processing-recovery.test.ts`
- `tests/bookkeeping/guided-special-presentation.test.ts`
- `tests/bookkeeping/operating-expense-classification.test.ts`
- `tests/home/command-center.test.ts`
- `tests/home/recently-handled.test.ts`
- `tests/security/action-index.rollback.sql`
- `tests/security/purchase-business-context.rollback.sql`
- `tests/security/question-understanding.rollback.sql`

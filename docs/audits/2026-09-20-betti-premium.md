# Work with Betti — approved direction and staging certification

Date: September 20, 2026. Implementation: `0578f63` on `v2-onboarding-staging`.

**Deployed to public dedicated staging:** https://writeoffs-fresh-staging.vercel.app
Deployment: `dpl_EzYV5tEaJcQY6Mkw516PTkc3UJCr` / `writeoffs-fresh-staging-jwpi3a5jq-ricks-projects-3ba59ab5.vercel.app`.

Engineering/browser certification passed. Rick retains final subjective visual acceptance. Heavy-import queue delay remains unresolved and is detailed below; this report does not claim it is fixed.

## 1. Approved composition implemented

Reference: [approved direction](../design/references/work-with-betti-approved-direction.png).

- One persistent destination and conversational stage, with the question receiving most desktop width. Betti uses about 27% of the composition, not half.
- A restrained white work surface, warm background, subtle green understanding band, stronger question typography, compact financial identity and substantial answer rows.
- Mobile is one integrated vertical surface with a compact, anchored Betti. Tablet retains a proportioned character area and readable work panel.
- Removed generic storefront fallback icons. Existing trusted local logos remain; no runtime lookup or extra dependency.
- No generated sidebar, office scenery, slogans, coffee mug, speech bubble, fake progress promise, or extra marketing copy. The existing hamburger navigation and immutable logo remain.
- Existing approved PNG artwork through `BettiPresence`; no Fiverr asset integrated, packaged or committed.
- The stage and character are not keyed by action. Only conversation content fades for 160 ms; reduced motion disables that effect. Processing now keeps the stage height instead of collapsing to a completion-sized surface.
- Direct factual choices still submit directly. Percentage/amount/text controls retain explicit confirmation. Saving acknowledgment does not claim persistence before the server confirms it.
- Receipt purchases precede the upload control. Repeated uploader instructions and empty document-list spacing were removed only from guided presentation. Later and scoped availability remain different canonical commands.

No economic/tax inference policy, pricing, report arithmetic, scope boundary or broad performance architecture was changed in this pass. The existing evidence-first rules are verified below.

## 2. Readiness defects found and corrected before return

The first fresh candidate exposed failures that unit tests alone had not found. Those interrupted attempts are not counted as successful continuous sessions.

1. **Dirty index mistaken for canonical absence.** Presented-action reconciliation used a convenience loader that could return an invalidated index. The still-unknown account fact briefly disappeared after focus. Presented recovery now explicitly reads the atomic canonical snapshot. Dirty Home/guided GET summaries use that same fallback; clean reads retain the indexed path. GET does not repair or write anything.
2. **Read/command mismatch.** A recovery read could legitimately present a question while its derived command entry had not refreshed. The POST returned 409 solely because the entry was missing. An index miss now falls through to the existing canonical eligibility and exact-event-version command path. Published entries still use the fast indexed path. Missing, blocked, foreign and changed canonical facts still reject.
3. **Batch JSON serialization order.** Canonical and PostgreSQL JSONB objects could contain identical visible purchases in a different property order. JSON text comparison falsely called that stale. Deep equality now compares all fields/values and array order; changes to records, amounts, evidence versions or extra fields remain rejected.
4. **Manual/background refresh race.** “Check for the next step” could supersede or be superseded by a scheduled read and show an error despite a newer successful read. It now uses the existing serialized recovery operation.
5. **Screenshot readiness.** Read-only gallery capture now waits for the actual conversation heading, rather than labeling a special-detail loading frame as a completed question screenshot.

No stale write is accepted to keep the screen moving. Canonical RPC validation, transaction history, durable invalidation, MFA and tenant checks remain in force. Tests cover the index-enabled recovery path and altered/versioned batch cases.

## 3. Home corrections verified on public staging

- Needs-customer: **“I’ve worked on your books. I have a few questions for you.”**
- Supporting: **“Tell me what you know. I’ll take care of the bookkeeping from there.”**
- Restrained canonical count: **“N things need you.”**
- An account prerequisite accurately says **“I have a question before I get started.”**
- Actual processing: **“I’m updating your books.”** Copy refers to records and facts, not only newly received files. Queued/retry work has separate wording and does not falsely claim active processing.
- **Five most recent in-scope transactions** are visible. The limit was already five; the old filter removed personal/non-P&L rows first. Recent activity now includes those in-scope rows with truthful status. Working totals remain unchanged.

## 4. Real ingestion and question-quality certification

Fresh isolated customer → real onboarding → real controlled May PDF upload → ordinary worker processing → actual guided answers. No downstream financial records, decisions or questions were seeded. A test-only membership/coverage grant enabled the authorized Catch-up scenario through the existing scope command. Rick's manual customers were not changed.

The statement created **24 transactions**. A real McDonald's receipt added one separate receipt-only record later.

| Measurement | Prior evidence-pass frozen baseline | Fresh verification before individual material answers | Fresh final |
|---|---:|---:|---:|
| Statement transactions | 24 | 24 | 24 (+1 separate receipt) |
| Organized statement working treatment | 10 | 11 | 23; loan still needs evidence |
| Ready customer actions in snapshot | 15 | 12 | 0 |
| Deferred actions | — | 0 | 1 loan request |
| Working income | $2,100.00 | $2,100.52 | $6,260.96 |
| Working expenses | $1,088.58 | $1,425.73 | $1,680.57 including $9.54 receipt-only expense |
| Working profit | $1,011.42 | $674.79 | $4,580.39 |

The first two columns reproduce the already-implemented evidence improvement; the visual pass does not claim to have introduced new inference rules or eliminated additional questions. The 15→12 figure is a ready-action snapshot, not an all-session question count. No complete before-engine customer journey was recorded, so an exact total before/after interaction reduction remains unavailable.

The fresh journey required one account-use answer followed by **27 continuous completed/deferred actions** in the corrected candidate: 14 May transaction-specific requests (including refund confirmation and loan deferral), two meal facts, and 11 scoped batch/receipt-stage interactions. The statement has 11 records needing no individual material question. Separate receipt-availability groups covered distinct purchases, not repeated assertions for the same visible group. New evidence and newly settled records can create another legitimately scoped group.

### Controlled statement matrix

All rows have actual statement provenance, signed amount, activity date and account identity. Ordinary business use uses the explicit Business-only fact and applicable exception review. Documentation remains separate.

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

### Every retained transaction question

The exact canonical questions and material reasons remain those below; visual changes do not hide or reinterpret their eligibility.

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

The added McDonald's receipt established restaurant/food evidence. Only attendee/customer relationship and business purpose were asked; no “What did you buy?” question appeared. Neither loan principal nor a credit-card balance payment became an expense. Both explicit savings transfers remained non-P&L. Interest contributed $0.52 without a source question; explicit client payment contributed $2,100 without one. State Farm asked insurance coverage only, and Stripe used narrow confirmation.

## 5. Continuous-session and regression results

| Check | Observed | Result |
|---|---|---|
| Fresh controlled Catch-up journey after fixes | 27 actions, one browser document, same stage/character nodes | PASS |
| Public dedicated staging continuation | 25 actions, one browser document, same stage/character nodes | PASS |
| Visible action identity trace | 0 unexplained withdrawals in both corrected sessions; no failed requests in the 27-action trace | PASS |
| Focus/index recovery | Presented action retained when canonically current; stale/changed versions still reject | PASS |
| Loan deferral → refund → ordinary question | Continued without Home round trip | PASS |
| Personal/mixed/receipt transitions | Continued across action types; no action-count interruption | PASS |
| Processing | Truthful waiting state and bounded automatic continuation; independent work continues | PASS |
| Business-only account | Durable fact reused; no ordinary repeated business-use question | PASS |
| Mixed Current account, fresh public upload | Three actions; personal/business/partial choices persisted; Reports expense $130 | PASS |
| Receipt Later | Deferred; not unavailable; supported expenses preserved | PASS |
| Receipt completion | Visible/versioned group only; distinct from Later | PASS |
| Interest / client payment / explicit transfers / card payment | Expected canonical treatment; no broad question; no double expense | PASS |
| Stripe / insurance / phone / McDonald's | Evidence-specific remaining facts | PASS |
| Refund / loan safeguards | Relationship confirmation; principal/interest document required | PASS |
| Out-of-scope synthetic customer on public staging | Catch-up null; 0 actions, 0 ledger rows, $0 income/expense, 0 Reports rows | PASS |
| Home/Check-in and Reports | Canonical counts and arithmetic agree at journey end | PASS |
| Catch-up + Current shared priority/equivalence | Full automated canonical regression suite passed; this pass's long live run was Catch-up, with Current tested separately | PASS (automated + separate live coverage) |
| Tenant/MFA/stale/idempotency/read-only publication | API checks and rollback-only DB checks pass | PASS |

The long-session fixtures' receipt dates fell before their activation boundary, so those records are correctly Catch-up; they are not claimed as live concurrent Current certification. The separate mixed-account fixture is Current-only. Scroll measurements showed small 9–15px browser clamps after some batch buttons; no document reload, route round trip, arbitrary scroll reset or stage remount occurred. Screenshot resize/scroll operations are test-driver activity, not application transitions.

### Public 25-action sequence

| # | Action | Result | Next visible state | Click → next (ms) |
|---|---|---|---|---:|
| 1 | personal_exception_sweep (personal_exception_sweep) | completed | account_use | 2094 |
| 2 | account_use (account_use) | completed | material_question | 659 |
| 3 | ATM WITHDRAWAL (transaction_type) | completed | material_question | 459 |
| 4 | STRIPE PAYOUT (transaction_type) | completed | material_question | 727 |
| 5 | CASH DEPOSIT (transaction_type) | completed | material_question | 598 |
| 6 | ZELLE FROM JANE MORRIS - INV 1041 (transaction_type) | completed | material_question | 509 |
| 7 | ZELLE FROM EMILY CARTER (transaction_type) | completed | material_question | 435 |
| 8 | McDonald's Restaurant (meal_relationship) | completed | received | 558 |
| 9 | mixed_use_sweep (mixed_use_sweep) | completed | received | 2685 |
| 10 | receipt_upload_sweep (receipt_upload_sweep) | completed | received | 2894 |
| 11 | receipt_availability (receipt_availability) | completed | received | 5183 |
| 12 | personal_exception_sweep (personal_exception_sweep) | completed | material_question | 984 |
| 13 | STATE FARM INSURANCE (business_purpose) | completed | material_question | 483 |
| 14 | ZELLE TO MARK REYNOLDS (business_purpose) | completed | material_question | 491 |
| 15 | CHECK #104 - DESERT PRINT SHOP (business_purpose) | completed | material_question | 925 |
| 16 | verizon (percentage) | completed | received | 4133 |
| 17 | mixed_use_sweep (mixed_use_sweep) | completed | received | 1239 |
| 18 | receipt_upload_sweep (receipt_upload_sweep) | completed | received | 1533 |
| 19 | receipt_availability (receipt_availability) | completed | received | 1140 |
| 20 | personal_exception_sweep (personal_exception_sweep) | completed | material_question | 984 |
| 21 | McDonald's Restaurant (business_purpose) | completed | received | 600 |
| 22 | mixed_use_sweep (mixed_use_sweep) | completed | received | 843 |
| 23 | VERIZON WIRELESS (mixed_use) | completed | received | 370 |
| 24 | receipt_upload_sweep (receipt_upload_sweep) | completed | received | 1539 |
| 25 | receipt_availability (receipt_availability) | completed | received | 1244 |

“received” is the trace's internal state name; customers see the calm updating/working message, not an internal queue label.

## 6. Public staging performance

Small real-browser samples, not load-test or production-SLA claims. No artificial transition delay or blocking merchant lookup was added.

| Sample | n | p50 | p75 | p95 | max |
|---|---:|---:|---:|---:|---:|
| Accepted prior ordinary baseline | — | ~585 ms | — | ~703 ms | — |
| Public ordinary material answer → independent next question | 8 | 491 ms | 598 ms | 925 ms | 925 ms |
| Public all material answers, including local dependency | 12 | 509 ms | 600 ms | 4,133 ms | 4,133 ms |
| Public all actions, including batch/special/processing-dependent | 25 | 925 ms | 1,533 ms | 4,133 ms | 5,183 ms |
| Corrected private candidate ordinary source/activity answers | 8 | 585 ms | 587 ms | 818 ms | 818 ms |

Public immediate acknowledgment maximum: 2.7 ms in the automated browser; candidate maximum 3.9 ms. This is a UI acknowledgment, not a promise that persistence finished. The public ordinary sample remains within the sub-second next-question target, with a higher tail than the prior small sample. Phone local reassessment and some receipt assertions remain seconds-long; those outliers are explicitly included above, not counted as ordinary independent advancement.

## 7. Heavy-import investigation — not solved in this UX pass

Fresh native PDF registration: `2026-09-20T17:12:50.487Z`.

| Pipeline observation | Measured time |
|---|---:|
| Intake claim after registration | 0.12 s |
| All 24 canonical records created | 2.06 s after registration |
| Intake completed | 3.51 s after registration; one attempt |
| First useful account question visible | 4.61 s after registration |
| First material question in the pre-fix attempt | 210.05 s after registration; this exposed the readiness defects and is not certified as a successful final answer path |

Settled durable worker timings for the entire fresh journey (including later answers/receipt work):

| Job family | Completed jobs | Mean queue wait | Mean execution |
|---|---:|---:|---:|
| Deterministic evaluator | 55 | 114.85 s | 2.88 s |
| Business-context evaluation | 25 | 215.52 s | 2.34 s |
| Economic-evidence upgrade | 21 | 198.21 s | 2.34 s |

Do not call the full elapsed browser-session time “import duration”: it includes customer answers, screenshot captures, investigations and later receipt work. The proven bottleneck is queue residence, not native PDF extraction. Useful account work appeared before all background settlement.

The drain is sequential and processes up to 12 bookkeeping jobs per invocation; repository cron configuration is once per minute. Fresh unresolved records can receive overlapping evaluator/business-context/economic-upgrade requests. Additional earlier-run evidence found scope-expansion fingerprints returning `legacy_noop` because they do not match the evaluator's accepted deterministic fingerprint protocol. Those jobs consume capacity without that evaluation; other jobs still evaluate records. This does not by itself prove incorrect customer books.

Added `BOOKKEEPING_DRAIN_TIMING` stage logging for index-before, lifecycle, documents, enqueue, bookkeeping, weekly review, receipt understanding, index-after and total. No extra DB reads, payload/identity logging, scheduling or job semantics. A five-minute CLI log watch returned no stage samples; no console timing values are invented. The waterfall above comes from actual durable job timestamps.

Recommended focused next fix: repair the scope-queue/evaluator protocol mismatch with scope regressions, then coalesce redundant record evaluations only when evidence/version coverage proves equivalence. Measure queue wait again before increasing worker concurrency. Do not drop different evidence causes or broaden leases blindly. The 11-minute-type heavy wait is not accepted as solved here.

## 8. Gallery and accessibility

[Open the 64-image review gallery](/private/tmp/writeoffs-premium-gallery/index.html).
Manifest: `/private/tmp/writeoffs-premium-gallery/manifest.json`.

Four widths for every gallery state: **390, 430, 768, 1280**.
States: Home needs customer, account use, strong confirmation, genuine ambiguity, insurance, phone percentage, personal sweep, mixed sweep, receipt upload, scoped receipt confirmation, loan, refund, meal, processing, deferred-only completion and genuine no-action completion.

All are real staging screenshots. Refund is from the validated private candidate with the same final refund markup/styles; the rest are public dedicated staging. No fabricated completion/current-through state. The gallery deliberately excludes pre-fix refresh-error screenshots and a read-only refund-context probe where canonical priority selected receipts instead.

Reviewed hierarchy, character orientation, question prominence, control spacing and composition across mobile, tablet and desktop. Fixed the percentage control's font-specificity conflict found during screenshot review. Guided upload now states the request once and does not leave an empty document-list gap.

- Automated WCAG A/AA checks: no reported violations in captured main content at 390px.
- Keyboard focus: visible; receipt group can be scrolled by keyboard.
- Reduced motion: animation/transition disabled; comprehension does not depend on motion.
- 200% text scaling: no horizontal overflow in captured states.
- One main landmark, semantic question headings, labeled inputs, polite acknowledgment regions, controls with comfortable touch targets.
- Automated checks and screenshot review do not substitute for a complete manual screen-reader audit. No such audit is claimed.

## 9. Validation and release

- **1,748 tests passed; 143 environment-gated tests skipped.** 237 files passed, 42 skipped.
- TypeScript and Next type generation: PASS.
- Lint: 0 errors, 16 existing warnings.
- Local optimized webpack build: PASS. Hosted optimized Next/Turbopack build: PASS.
- Local pre-push Turbopack build could not bind a port in this environment. The hook was bypassed only after the equivalent checks and hosted build passed; non-forced staging push completed.
- Public API anonymous/AAL1 rejection, AAL2 success, forged identity/presentation context: PASS.
- Rollback-only DB tenant/MFA/read-only/stale-version/idempotency/publication coverage: PASS.
- Dependency audit: 2 existing moderate development-tool findings (`vitest`, `@vitest/mocker`); no high/critical findings or production dependency findings. No dependency changes.
- Redacted source secret scan: clean.
- No migrations. No tax/report arithmetic changes. No Rick account repairs. Main and real Production untouched.

### Changed files

- Work API/readiness: `app/api/bookkeeping/work/route.ts`, `app/api/bookkeeping/work/answer/route.ts`, `app/api/bookkeeping/questions/[id]/route.ts`, `app/lib/bookkeeping/betti-work-loader.ts`.
- Stage/controls: `app/components/guided/ConversationShell.tsx`, `GuidedWork.tsx`, `MerchantIdentity.tsx`, `guided.css`, `app/questions/QuestionFlow.tsx`, guided presentation in `app/documents/DocumentIntake.tsx`.
- Home: `app/lib/home/command-center.ts`, `recently-handled.ts`.
- Timing: `app/api/internal/processing/drain/route.ts`.
- Certification: `scripts/certify-betti-conversation.mjs`, `scripts/lib/betti-visible-actions.mjs`.
- Tests: `tests/bookkeeping/betti-work-loader-index.test.ts`, `betti-work-route.test.ts`, `customer-question-route.test.ts`, `guided-work-route.test.ts`; `tests/home/command-center.test.ts`, `recently-handled.test.ts`.
- This audit and `docs/design/references/work-with-betti-approved-direction.png`.

Implementation deployed: **0578f63**. A subsequent documentation/capture-harness commit records the final public evidence; it does not change the deployed application. Three unapproved Fiverr review files remain untracked and excluded.

### Known limits / next decision

Heavy-import queue residence and seconds-long dependent/batch operations remain visible limits. No broad worker or performance redesign was attempted. The approved PNG artwork is temporary by instruction; professional Rive integration remains separate. Final aesthetic acceptance belongs to Rick. The next engineering recommendation is the focused worker scheduling/coalescing correction above, not another UX redesign.

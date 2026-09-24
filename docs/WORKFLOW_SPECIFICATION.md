# WriteOffs workflow specification

Status: canonical product and workflow authority, revised 2026-09-15.

This document defines approved product behavior. It does not authorize implementation outside an approved engineering milestone. When legacy UI or workflow documentation conflicts with this document, this document governs; the conflict register near the end records intentional supersessions.

The September 24 [Catch-up Workflow V2 revision](CATCH_UP_WORKFLOW_V2.md) governs
the historical evidence/bulk-review journey and its explicit supersessions below.
Covered ongoing months remain ongoing even after leaving the recent window.

## 1. Product relationship

WriteOffs is conversation-first bookkeeping for non-accountants. WriteOffs does the bookkeeping; the customer runs the business and supervises the result.

**The customer gives WriteOffs real-world facts. Betti/WriteOffs handles the bookkeeping and tax logic.**

- Ask only for facts the customer can reasonably know.
- Never require accounting, tax-category, Schedule C, or internal-state decisions in a normal workflow.
- Do everything safely supported by source evidence, customer facts, established patterns, and approved rules before asking anything.
- Seek a truthful bulk or pattern decision before asking transaction-by-transaction questions. Individual questions are the last resort.
- Never fabricate business purpose, category, attendee, receipt, documentation, personal use, or business use.
- Never infer Personal merely because activity looks nonbusiness, comes from a mixed-use account, or lacks documentation. Personal treatment requires customer input or confirmation. WriteOffs may establish business treatment automatically only when sufficiently strong supported evidence exists.
- Explain relevant documentation and IRS expectations in plain language without acting as an enforcement authority or giving unsupported tax advice.
- The customer ultimately chooses inclusion or exclusion when facts or documentation remain incomplete. Missing documentation does not automatically invalidate or exclude an expense; its limitation remains recorded.

## 2. Canonical integrity

Imported transactions and uploaded documents are immutable source facts. Bookkeeping treatment is append-only and correctable. Personal, business, mixed-use, category, inclusion, and exclusion decisions never rewrite source evidence.

A customer may correct any imported transaction with ordinary language such as **This was personal**, **This was business**, or **Business + personal**. Mixed use asks for the business dollar amount; WriteOffs derives the allocation. Reversal is another superseding canonical decision. Removing an accidental customer-created source is a separate lifecycle operation.

Personal activity leaves the normal business workflow, does not generate bookkeeping questions, and does not appear in finished business books. It remains in source/audit history and has a restrained recovery path in Transactions. Mixed-use presentation shows the established business portion.

## 3. Membership coverage and historical cleanup

WriteOffs offers **one $39/month membership**, with no feature tiers or annual option.
Membership includes the joining calendar month and the immediately preceding month.
Earlier cleanup is **$20 per additional month, paid once**. Joining in September and
starting January means January–July: seven additional months, **$140 once**.
Current and previous months are never charged as catch-up months.

Customers choose a starting month. Before agreeing they see that month, the included
months, the additional month count, the $20 rate and the total. Explicit agreement
and confirmed payment are required before paid historical coverage starts. A checkout
redirect is not payment authority. Retries reuse the same order. Existing customer
coverage and historical subscriptions are retained without retroactive charges.
Staging certification uses Stripe Sandbox only; Production activation remains separate.

Cleanup may require statements or receipts when connected history is insufficient.
It organizes books; it does not prepare, file, or amend tax returns.

### September 23 evidence-first orchestration revision

Current operational books begin on the first day of the immediately preceding
calendar month. Purchased cleanup remains fixed at the agreed scope: chosen
authorized start through the day before the joining customer's included prior
month. Unfinished membership-covered months never become newly billable cleanup.
Recent work takes priority while earlier cleanup proceeds through the same ledger.

Available evidence → assessment → reassessment → remaining customer facts governs
Check-in. Offer useful receipts/documents before substantive questions for an
account/month; upload, no receipts, and later are distinct, nonblocking responses.
Do not repeat an equivalent receipt opportunity for the same account/month.
Documents arriving later still invalidate and resolve or narrow stale questions.
A receipt's presence alone never proves business purpose, allocation, or completion.

This supersedes older universal personal/mixed/receipt stage ordering and pure
oldest-first sequencing below. It preserves the question-age policy, documentation
limitations, immutable evidence, customer corrections, and financial calculations.
Implementation/control details: [Evidence-first work orchestration](EVIDENCE_FIRST_WORK_ORCHESTRATION.md).

Historical cleanup finishes with a durable review state and immutable presented snapshot. Betti processes what is available, uses evidence and bulk decisions, resolves avoidable personal/mixed ambiguity, and presents a factual summary of business expenses, personal/excluded activity, mixed use, documentation limitations, and unresolved category/detail limitations. **Caught up through [date]** means available records and customer decisions were processed and reviewed honestly, not that every source is perfect. The customer may choose **Everything looks right** or **Make a change**.

## 4. Onboarding and account context

The authenticated prerequisite order is email/session, mandatory MFA, membership, minimum business onboarding, then Home. Connected accounts are recommended; statements and documents are first-class alternatives. Neither connection nor bookkeeping work blocks activation. The chosen ingestion direction is a preference, not a permanent customer mode.

For each connected checking, savings, or credit account ask **How do you use this account?** with **Business only** or **Business and personal**. The answer is an append-only customer-authored account fact; absence means Unknown. Onboarding expectations, account type, institution, and transaction history never substitute for it.

**Business only** establishes business context after economic nature is determined. For a supported ordinary expense, it may support a 100% business allocation without asking transaction-by-transaction whether the purchase was for business. It never turns transfers, card payments, loan principal, owner money, refunds, assets, vehicle activity, or other special treatment into an ordinary deduction. Inherently mixed-use costs still require the smallest applicable use fact, and meals still require substantiation.

**Business and personal** does not presume either use for every transaction. WriteOffs applies structural rules, transaction and merchant evidence, linked documents, prior scoped customer facts, and approved tax intelligence first; it asks only for a material real-world fact that remains unknown.

Check-in is continuous and event-driven. Do not ask for a weekly day or make cadence
a setup prerequisite. Existing cadence history and period-based notification
infrastructure remain compatible; new customers are not assigned an arbitrary day.
Get Started is an optional post-activation connection workflow. Its own completion checks connected-account use; it is not an application-access prerequisite. Existing completed customers remain complete.

Onboarding asks only real-world facts needed for fit and service. It must not ask the
customer to choose tax treatment, accounting classifications, deduction categories,
inventory/material accounting, prior tax treatment, or another rule WriteOffs must
determine. **We ask for the facts. We handle the rules.**

Do not ask Most/Some/None receipt availability questions. Offer “Upload receipts” or
“I’ll do this later.” Receipts never block setup.

### Phase 1 fresh-customer experience

- Public conversion leads to signup. Successful creation replaces the form with
  “Check your email” and the destination address; verification remains required.
- Required MFA is a controlled “Protect your account” step, with an authenticator
  setup key usable on the same phone. Recovery requires WriteOffs support; no bypass
  or unsupported backup codes are promised.
- Ask “How do you report this business on your taxes?” Personal return maps to the
  supported Schedule C state; separate return is unsupported; “I’m not sure” remains
  unresolved. Collect business start as month/year, stored with month precision.
- Keep materials and merchandise facts. Remove the historical materials tax-method
  question and its completion requirement. Retained historical answers do not select
  a tax method or become an invented default.
- Lead with connected accounts, followed by bank/card statements and receipts. CSV
  remains a secondary format. “Business only” and “Business and personal” preserve
  the existing account-evidence semantics. Business-only does not establish meal
  attendees or business purpose.
- Final confirmation groups business details, starting scope and business facts,
  with one Change action per group. Setup finishes at Home.
- Home uses the shared Betti work projection. It invites necessary customer action calmly and distinguishes processing, waiting, holds and deferrals. An empty action queue alone never establishes that the books are current.
- Select the appropriate question within each record, then order records oldest
  first. Keep session survivors stable and append new discoveries. Submit/version
  checks, idempotency and authoritative reload remain intact.
- Phase 2A separates high-volume historical review from individual conversation using
  the activity-date policy and guided Transactions work below. This supersedes the
  Phase 1 joining-month split. Unresolved useful facts stay chronological in Check-in.
- “I’ll come back to this,” “I’m not sure,” and explicit zero/no are distinct states.

### Historical mileage and shared report authority

Historical mileage and vehicle-method work are optional post-activation work under Mileage, never mandatory onboarding. Catch-up may collect year-to-date business miles through the end of the month before
joining, based on the customer’s log or records. Rate changes require separate
period totals. Deferral is a durable unresolved fact, never zero. A summary is not a
fabricated trip. Vehicle association and established tax method remain required for
an expense; missing details stay visible under Mileage.

Historical totals include already logged trips in that period; those trips remain
in the log and are not counted twice. Conflicting totals or an unsupported partial
period require facts rather than guessed allocation. Standard mileage uses the one
canonical date-aware rate model. Home, Reports and Tax-Time share the same expense
and profit projection, adding standard mileage once and excluding the same vehicle’s
disallowed operating costs. Actual-expense treatment stays authoritative.

### Phase 2A: guided review and the 30-day policy

Betti guides customers to the smallest useful action: missing receipts, a scoped
older-purchase sweep, then individual factual exceptions. Transactions handles
selection at scale; Check-in asks questions that add value; receipts preserve evidence.

Age is the difference between the activity date and the Business-local calendar date
at the canonical `asOf` instant. The setup timezone takes precedence over retained
cadence timezone; missing/invalid timezone falls back to UTC. **Exactly 30 days remains
contemporaneous; 31 days is historical.** This is not a tax rule or a retention limit.

#### Complete current question policy matrix

| Question/fact | Age ≤30 days | Age >30 days | Reason and evidence consequence |
| --- | --- | --- | --- |
| Meal attendee/relationship | Ask when missing and business portion exists | Non-conversational | Stale recollection is low value; attendee remains unknown, never fabricated |
| Meal business purpose (`receipt_meal_business_purpose`, purpose-stage meal candidate) | Ask when missing | Non-conversational | Purpose remains missing; business-only account context is not meal substantiation |
| Meal candidate: was this business? (`BUSINESS_USE_UNCLEAR`) | Ask | Keep useful factual question | Business versus personal is a material fact; a personal sweep can eliminate it |
| Other purchase business use | Ask | Keep | Customer can remove nonbusiness purchases in bulk; no inferred answer |
| Ordinary purchase identity/purpose (“What did you buy?”) | Ask | Keep | Ambiguous merchant/category still requires a useful fact |
| Travel destination/dates/business reason | Ask | Keep | Material trip facts can come from records; no invented travel justification |
| Mixed-use dollars/percentage | Ask individually | Keep individually | Allocation changes amounts; never bulk assign a percentage |
| Transaction nature (purchase, earned money, transfer, card payment, refund, owner money, borrowing) | Ask | Keep | These facts determine what the activity is, regardless of age |
| Conflicting evidence / factual choices (including loan-related facts when canonically identified) | Ask | Keep | An evidence conflict cannot be resolved by age |
| Phone business-use percentage | Ask when needed | Keep / discover when needed | Recurring allocation remains useful; no older-record discovery cutoff |
| Internet business-use percentage | Ask when needed | Keep / discover when needed | Same factual allocation requirement |
| Equipment business-use percentage | Ask when needed | Keep / discover when needed | Business portion is factual; asset tax decisions remain separate |
| Equipment placed-in-service date | Ask if opened | Keep | Material date can be established from records |
| Recurring shared-expense context | Ask if opened | Keep | Durable recurring facts remain useful |
| Home-office regular/exclusive use | Ask if opened | Keep | Business-scoped yes/no facts, not a stale transaction memory test |
| Home-office and total-home area | Ask if opened | Keep | Business-scoped measurements; age does not resolve them |
| Vehicle association | Ask if opened | Keep | Identifies the vehicle; preserves method/allocation rules |
| Vehicle total miles | Ask if opened | Keep | Record-based annual fact; missing is not zero |
| Contractor payment method | Ask if unknown | Keep | Material factual payment context remains required |
| Contractor W-9 status | Ask under existing deferral rules | Keep | A current document status, not retrospective meal detail |
| Receipt request | Guided Needs a receipt view | Same guided view | Age never supplies a receipt; unavailable is a separate explicit assertion |
| Any additional canonical percentage, yes/no, integer, date or factual-choice question | Existing behavior | Existing behavior | No broad suppression by control type; unsupported/unknown facts fail closed |

The canonical askable SQL projection applies this policy to **existing and future**
question leaves. It does not append answered/resolved events or change tax treatments.
The original evidence-eligible projection remains available to reporting. Historical
meal limitations appear as documentation issues, not instructions to reconstruct stale
facts in Check-in. Other unresolved tax-treatment safeguards remain in force. Current
customer corrections and later evidence continue to control the record.

#### Transactions work views and selection

- **All:** canonical current activity, retained legacy activity, and unmatched receipt
  evidence. Inactive/absorbed records are projected through existing current-state logic.
- **Needs a receipt:** bank-backed outflows that are expenses or unresolved activity,
  still in business scope, with no attached receipt and no current unavailable assertion.
  This is an organizational view, not a claim every purchase legally requires a receipt.
- **Receipt only:** unmatched receipt evidence and receipt-backed records without a
  bank account. Legitimate cash/owner-paid purchases are not errors. Existing receipt
  handling remains authoritative.
- **Needs review:** current record-bound review facts (including deferred facts that
  remain materially necessary) and open deduction facts, excluding nonbusiness activity
  and suppressed historical meal documentation. A missing receipt alone is not enough.

Server-side filters cover merchant/description search, category, date range and account.
Pages contain at most 50 rows; one extra index row establishes whether another page
exists. Only that page is hydrated into customer records. **Select all means the activity displayed on this page**, never unseen activity on other pages.
Rows and checkboxes are separate keyboard targets. Filters/pages clear the selection.
Legacy and receipt-only records retain their existing individual controls. A selection
containing those records cannot use bank-only bulk actions; the UI explains that they
need individual review. No selected item is silently skipped.

#### Guided assertions and history

“Remove from business” is an explicit nonbusiness correction using the canonical
personal-scope correction and restoration model. It preserves imported evidence,
appends a decision, invalidates inapplicable questions, and can be restored from detail.
It does not set a mixed-use allocation. Mixed use stays individual.

“I don’t have these receipts” records the existing immutable receipt-unavailable
assertion. It closes the upload request, **not** the missing factual evidence. It never
changes business use or creates a deductibility conclusion. Outcomes identify records
with enough other information, useful facts still needed, or documentation limitations.
Later receipt attachment can supersede the unavailable state, retaining both histories.

A bounded atomic database operation checks the authenticated owner, required MFA,
active membership, deletion state, every selected record/version, and the scope before
writing. A batch request ID binds the exact action and selection for retries. Per-record
results retain prior/current references and guided-review provenance. One noisy new
customer-facing event per processing step is not added.

Historical sweep completion is a separate explicit “I’ve reviewed these purchases”
assertion about the selected purchases, with the then-current decisions preserved in
history. It changes neither treatment nor substantiation. A later factual answer does
not erase that review or restart the same personal sweep. Receipt review has priority, then unreviewed
older purchases, then useful conversational exceptions. Completed receipt assertions
stop upload nags. Deferrals remain unresolved and do not count as answered.

Check-in puts a small replaceable Betti presence beside the question, followed by
compact transaction context, help, a modest auto-growing response, Continue and
secondary actions. Stable session ordering, same-record follow-ups, retries and
chronological selection remain unchanged. No denominator grows under an active answer.

### Phase 2B and next manual phase

Full Reports visual refinement remains Phase 2B. Preserve annual readiness, Tax-Time
PDF, exports, mileage, corrections, tenant isolation and retained read-only access.

Next manual document testing covers receipt upload/extraction/matching, receipt before
bank activity, cash/receipt-only expenses, meals, statement PDFs, duplicate detection
against Plaid and messy real-world documents. Preserve ingestion architecture.

Remaining Plaid launch work: applicable Call endpoints and Basic Setup checklists,
webhook receiver including NEW_ACCOUNTS_AVAILABLE, Production readiness, and the App
Profile icon with the Account Manager. The staging banking redirect URI is registered.
Native mobile SDKs, CPA sharing and tax-software integrations are outside this phase.


## 5. Continuous work and customer cadence

Betti processes new source activity as soon as it is available. Weekly cadence controls customer interruption and review, not when bookkeeping starts. Ordinary questions wait for the scheduled review. Security events may interrupt. Bank reconnection is an operational exception that may be prominent because it blocks fresh activity, but it is not automatically a security incident.

No relevant activity means no review is created merely for engagement. No response is never approval, never manufactures sign-off, never stops bookkeeping, and never creates duplicate question batches.

Ordinary notifications should avoid delivery before 9:00 AM or after 9:00 PM in the Business timezone. True security notices may bypass quiet hours. Bank reconnection normally waits for the next allowed window unless it is a genuine security issue.

Use one consolidated review notification:

> Betti has your books ready for review. She has 3 quick questions for you.

or, when none remain:

> Betti has your books ready for review. Everything is ready for a quick look.

## 6. Import review: exception first

Show imported activity so the customer can verify what arrived. Review sessions are resumable and retain progress. Untouched activity is not considered customer-reviewed until an explicit stage-completion action.

### Sweep 1: personal

Ask the customer to multi-select activity that was entirely personal. Do not require affirmative business confirmation for every other transaction. Selected activity receives a canonical personal/excluded decision, leaves normal business workflow, and generates no later Betti question.

### Sweep 2: mixed business and personal

After personal items leave the workflow, ask whether remaining expenses contained both business and personal spending. For each selected item ask:

> How much of the $247.83 was for your business?

Store the full source amount and customer decision. WriteOffs calculates the percentage/allocation; the customer does not.

### Ambiguous merchants and recurring patterns

For merchants such as Amazon, Costco, Target, and Walmart, group activity where appropriate and ask the customer to select personal or mixed exceptions, followed by explicit confirmation such as **Everything else was for my business**. Merchant or item type alone never proves personal use.

When multiple charges appear to share a service or use, Betti may ask **Should I treat the other charges from this company the same way?** and show every affected transaction. Explicit permission is required before applying a treatment to the group.

## 7. Receipts and documentation

Receipt ingestion and transaction ingestion operate independently and in parallel. WriteOffs preserves originals, extracts evidence, immediately attempts existing canonical matching, and rematches as new activity arrives. Receipt status may appear on transaction rows. Bulk upload remains primary, and a missing-receipt transaction may accept a direct upload in context.

The customer-facing receipt hierarchy is: **Upload receipt** first; then unmatched or
needs-attention receipts; then receipts still being processed when relevant; and
finally successfully handled history available quietly when needed. Successfully
handled receipts recede rather than appearing as equally urgent cards. This hierarchy
does not change canonical evidence, processing, matching, or history.

Early guidance should be:

> Give me whatever receipts you have. Receipts help me finish more of your books without asking you questions.

Actions are **Upload receipts**, **I don't have receipts**, and **I'll do this later**. Deferral never stops supported processing.

### Receipt-only expenses

An unmatched customer-uploaded receipt is strong evidence and may establish a receipt-only expense. Payment method is not required merely to establish the expense, and a bank match must not block processing. Betti may gently offer another likely account connection without requiring it. Explicit customer indication that the purchase was not for business excludes it.

### Receipt intelligence and mixed receipts

Betti reads line items to reduce customer work. Groceries, wine, clothing, household goods, and similar items may have legitimate business context; they can trigger ambiguity but never automatic Personal treatment. When evidence supports a factual proposal, Betti may propose it and allow correction. For ambiguous mixed receipts, ask the minimum real-world fact necessary.

Receipt processing distinguishes saved/processing, processed unmatched, matched, and needs-help states. `Receipt only` excludes uploads still processing. In Needs a receipt, **Upload receipts** opens the upload interaction in place. A confidently matched receipt supplies evidence without changing an existing customer classification. Exact cents, Business ownership, normalized merchant agreement, a three-day posting window, and unique candidates are required. Multi-receipt images are not silently merged; v1 asks for separate uploads. See `DURABLE_DOCUMENT_PROCESSING.md` for extraction, retry and recovery details.

### Missing receipts

Handle missing documentation mainly during review/finalization, beginning with a bulk decision when truthful. Explain once that the IRS may ask for records supporting business expenses and that receipts are one form of support. Offer **Include these expenses**, **Exclude these expenses**, **Upload receipts**, and **Review individually**.

Including preserves business totals and missing-documentation status; it does not claim substantiation is complete and should not trigger repeated nagging for the same unavailable receipt. A documentation decision never resolves unrelated business-purpose or business-use ambiguity.

## 8. Facts, questions, and deferral

After exception sweeps, Betti asks only remaining material factual questions, one at a time, with relevant evidence. Customers provide free text and simple factual choices, never tax categories.

For business meals, restaurant recognition may establish meal context but not business purpose. Ask who attended and the business nature/purpose with light examples such as **Sarah Jones, client** and **Discussed a new listing and marketing plan**. For multiple meals, introduce the requirement once, group/pattern where truthful, and move through them efficiently. If facts cannot be recalled, explain the limitation and ask whether to keep or exclude; keeping preserves customer-established business treatment and incomplete substantiation.

When older cleanup expenses cannot be identified, offer a group resolution: **Keep them as business expenses**, **Treat them as personal/exclude**, or **Review individually**. A Keep decision establishes customer-asserted business use but never fabricates category or tax treatment; those may remain unresolved and the documentation limitation remains.

Distinguish **Yes, I can get the information later** from **No, it's missing/not available**. The latter proceeds to an informed include/exclude resolution. The former defers the question without resolving or approving it. When the deferral expires, Betti may ask again calmly. Repeated deferrals should not create an endless nagging loop.

The authoritative customer queue contains every current askable factual question, regardless of transaction date or an earlier completed review period. It excludes resolved, superseded, stale-fingerprint, inaccessible, and validly deferred leaves. A customer answer is followed by a fresh queue read so dependent questions appear only when facts are still missing.

## 9. Check in with Betti

The active customer experience is **Check in with Betti** at `/check-in`. It has no weekly date container and asks one current factual question at a time. The customer can leave at any time; no response and **Finish later** are never approval. Old `/weekly-review` links redirect to `/check-in` for compatibility.

Immutable weekly periods, snapshots, and events may remain internal for audit and historical compatibility. They do not select or limit current customer questions and are not an active customer sign-off ritual.

After every saved answer, the experience reloads the authoritative continuous queue. If new evidence arrives during a check-in, stale fingerprint protection rejects the old answer safely and the current question is reloaded. A check-in ends only when the live queue contains no currently askable facts.

### Historical weekly review behavior

For a period with relevant activity:

1. Import the period's activity; Betti starts processing immediately.
2. The customer reviews the period transaction list.
3. A business-expense exception sweep shows only ordinary expenses currently treated as Business and asks whether any should be left out as Personal. **Everything shown was for the business** advances the review but is not transaction-by-transaction approval; silence is never approval.
4. A separate mixed-use exception sweep lets the customer select expenses that were partly personal, then collects the business dollar amount or percentage through the canonical mixed-use question path.
5. Betti asks only remaining factual questions.
6. Missing-documentation decisions occur during finalization.
7. Betti finishes supported bookkeeping and creates the exact immutable review snapshot.
8. Present cleaned business books: income subject to membership scope, business expenses, mixed business portions, receipt status, and established plain-language categories.
9. Ask **Anything you'd like to change?** with **Everything looks right**, **Make a change**, and a respectful deferral option.

The review feels like a focused version of Transactions, not a raw bank feed or accounting table. Personal items do not remain. Categories are informational and subordinate; unresolved categories are omitted rather than guessed. Internal keys and Schedule C language are never exposed. Simple business/personal/mixed corrections happen inside the review conversation where practical without forcing the customer to leave and find the review again. They use the same append-only canonical history and provenance as every other correction; Weekly Review never owns a parallel correction system.

Evidence authority is deterministic: a current explicit customer transaction correction outranks all automation; current scoped customer facts and explicit account-use declarations are customer-authored evidence; a currently linked authenticated customer-provided receipt may establish business context; financial and structural evidence determines economic nature; approved merchant, document, deterministic, and AI intelligence may establish remaining facts within their confidence boundaries. A receipt is not blanket proof of deductibility. Reprocessing is idempotent, evidence fingerprints include account-use and document-link state, and changed evidence supersedes current projections without rewriting history or silently reversing a customer correction.

Items are ordered by activity date with deterministic same-date ordering. The snapshot preserves the exact current canonical record/decision identities, customer-facing established category label, business treatment/portion, receipt status where available, and amount presented. Period identity follows the effective Business cadence, uses date-based timezone-safe boundaries, is unique, and never changes retroactively.

**Everything looks right** confirms the exact period-level snapshot; it is not transaction approval. Corrections use ordinary canonical history and link back to the review event. A material later correction may reopen the period without erasing prior history. Durable states distinguish reviewed/confirmed, reviewed with corrections, and unreviewed/no response. **Not right now** is a deferral, not a confirmation, and its copy must never imply approval. Silence is never approval.

### Mileage in weekly review

If the period has no mileage entries, ask **Did you drive for your business this week?** with Yes/No. If entries exist, show them and ask **Any other business trips I should include?** with **Add a trip** or **No, that's everything**.

## 10. Home, navigation, and connected-account status

Home is Betti’s command center. The authoritative orchestration input is the read-only Betti work projection behind `/api/bookkeeping/work`; server rendering reuses its loader. Home must not independently count unresolved records as customer tasks. It presents canonical Betti/status, one primary next action where legitimate, restrained context, canonical working financial totals with period, balanced Tell Betti anytime actions, then restrained recent activity. Detailed documents remain on `/import`. Catch-up and Current coexist; processing-only states do not fabricate a Continue CTA. Whole-business current-through language requires projection support. This Phase 2 presentation preserves the existing Check-in and canonical ledger; guided sweeps and Check-in redesign are later work.

Authenticated UX keeps complexity behind Betti. Each screen has one obvious focal point and primary action, uses plain-language real-world facts, and avoids accounting or tax terminology where possible. Mobile hierarchy and density are designed first: readable type, safe tap targets, compact records, no overlapping artwork, and no large card or headline that crowds out the customer’s next action. Betti appears only when she explains what she handled, what she still needs, or what the customer should do next.

Questions are exception-driven and conversational. Transaction context and supporting evidence stay compact; progress appears only when it helps orient a multi-question check-in; one customer intent is never represented by duplicate controls. Customer-facing transaction history is a meaningful projection—customer corrections, receipt matches, and material rechecks—not the immutable technical event ledger or worker state. The complete canonical history remains available to support and audit systems.

When caught up, use canonical Caught Up Betti and language such as **Everything's handled. Your books are up to date.** Do not manufacture engagement. Keep the next scheduled check-in, last successful connected-account check, and a secondary **Check for new transactions** action visible.

If an institution requires reauthentication, say **I need your help reconnecting [Bank]. Your bank is asking you to sign in again before I can get your latest transactions.** Offer **Reconnect account**. Successful reconnection triggers immediate refresh and processing, then restores normal Home status.

## 11. Tax-time report and readiness

The primary annual handoff is one human-readable **Tax-Time Report** for the selected calendar year. Every customer receives the same core report regardless of whether they prepare their own return, use tax software, or work with a tax professional. WriteOffs does not ask how the customer files because that fact is not needed to maintain the books.

The completion statement is **Your books are ready for tax preparation.** The primary action is **Download Tax-Time Report**. Supporting guidance is **Send it to your tax preparer or use it while preparing your own return.**

Readiness distinguishes two states. A missing customer fact that is required to finish canonical bookkeeping remains in **Check in with Betti** and prevents the statement that the books are ready. When a customer answers a factual Check-in question, the same authenticated command may finish a previously empty, supported bookkeeping category and its tax treatment. It preserves the customer’s purpose, business-use choice, exact allocation amounts, and any existing category; it does not ask the customer to choose an accounting category. A tax-time judgment item does not make completed books incomplete. Known equipment or longer-lived property, lease adjustments, and other preserved return-level review states appear under **Items for you or your tax preparer to review** without making a depreciation, Section 179, or other tax election.

Potential equipment review uses append-only Schedule C assessments associated with the current bookkeeping decision, preserving evidence and supersession history. Prior-decision assessments and legacy record-level signals cannot override current customer corrections. No purchase-price threshold identifies assets. The annual report uses the current authoritative bookkeeping decision, customer correction, business allocation, and supported tax treatment. It does not double-count an ordinary expense and a possible return-level adjustment. Missing receipts alone do not block an otherwise supported report, and receipts are not bundled into the PDF.

The report contains the annual business summary, nonzero supported Schedule C category totals, applicable vehicle and mileage facts, and specific review items. Detailed transactions, mileage, and contractor downloads remain secondary. WriteOffs does not prepare or file a tax return and does not make final taxpayer elections.

Customers in the 12-month read-only retention period and pending-deletion state retain historical report/export access under the existing lifecycle policy; permanent deletion removes availability. Generation does not mutate or reevaluate the books. Report generation is authenticated, tenant-scoped, on demand, and streamed with private no-store delivery, with no persistent report copy. Each report includes its tax year and generation timestamp. Regeneration reflects current corrected books.

V1 excludes CPA accounts/portals, preparer invitations or secure sharing, tax-software integrations (including TurboTax), ZIP packages, receipt bundles, depreciation schedules, and automatic Section 179 elections. Receipts remain accessible through the existing Receipts experience.

## 12. Bank refresh direction

The approved direction is approximately one normal automatic refresh per week in preparation for the scheduled review, not nightly polling solely for real-time monitoring. Betti processes activity immediately after receipt. Customer-initiated **Check for new transactions** may be rate/cost constrained after Plaid Production behavior is validated; no permanent arbitrary limit is approved yet.

When a manual refresh finds activity, state that new transactions were found, add them to the current period, process immediately, and let the customer review when ready. Processing never waits for customer review.

This section is product direction, not authorization to alter current Plaid webhook/cursor safety. Provider validation must determine scheduling, Transactions Sync update semantics, costs, limits, and Production behavior before implementation.

## 12. Mileage and vehicle methods

Normal mileage entry asks only miles, date, and business reason in plain language. Remember the customer's normal vehicle and offer **Use a different vehicle**; do not repeatedly require vehicle, destination, job, or project absent an approved substantiation need. Vehicle setup asks once for a useful identity such as **2023 Toyota RAV4** and supports additional vehicles.

WriteOffs must ultimately support standard mileage and actual vehicle expense methods. Betti should recommend standard mileage when allowed and appropriate because it is simpler, offer **Compare my options**, and use authoritative year-specific tax rules to determine availability. Never encode a simplistic leased-vehicle rule.

Under standard mileage, do not separately count ordinary operating costs already represented by that method, including applicable fuel, maintenance, insurance, and wear/depreciation costs. The approved tax engine governs exact inclusions and exceptions; qualifying parking/tolls are not blindly excluded. Explain the exclusion the first time, then handle quietly. Payment from a business account never creates an additional deduction by itself.

Actual-expense support collects sufficient vehicle-year facts such as beginning/ending odometer and business/total miles. WriteOffs derives the business-use percentage and asks the customer to confirm/correct; the customer never calculates it.

Until authoritative tax-rule support and sufficient vehicle-year facts exist, method eligibility and deduction treatment remain fail-closed. This approved future direction does not silently expand the current 2025/2026 catalogs.

## 13. Potential writeoffs and reporting

A potential writeoff is one distinct current canonical economic expense with a nonzero established business portion, even if tax treatment, documentation, or special treatment remains unresolved. It includes current business/mixed and receipt-only expenses, excludes unresolved/personal/income/transfers/card payments/owner funding/loans/standalone credits, converges duplicates through canonical currentness, and changes through the current decision leaf. Mileage remains separate. Legacy membership records use this same expense metric.

Reports derive from canonical records. The launch membership includes supported cash-basis income, expenses, and estimated profit. Historical Expenses subscriptions retain their prior scope until an explicitly authorized migration. WriteOffs organizes records for tax preparation; it does not file returns or guarantee outcomes.

## 14. Ask Betti and character authority

**Ask Betti** is the canonical customer-facing name for a desirable future assistance
capability. It is limited to WriteOffs, the customer's authorized records and
workflows, explaining what WriteOffs is asking, and helping the customer understand
or complete a WriteOffs task. It is read-scoped by default and cannot directly mutate
canonical records without the appropriate explicit workflow and authorization. It
is not a general-purpose chatbot and is not implemented by this specification.

WriteOffs is the brand; Betti is the bookkeeper/personality inside it. The immutable WriteOffs logo never changes or combines with Betti. Canonical Betti is a natural green turtle with brown shell and eyes, thick black glasses, subtle feminine features, polished coral leather sneakers, no clothing, bow, jewelry, or logo/W marks. Props vary by state. Seasonal accessories may be considered later without changing the canonical character. Full-body Betti must never be accidentally clipped; intentional boundary-breaking is preferred to accidental cropping.

## 15. Mobile and accessibility

All workflows are mobile-first, not compressed desktop: transaction sweeps, receipt upload, questions, review, mileage, cleanup, reconnection, and corrections must be comfortable on a phone. Use readable language, large touch targets, visible focus, semantic controls, and textual equivalents for visual status.

## 16. Explicitly reconciled conflicts

These decisions intentionally supersede earlier guidance:

- Legacy primary Dashboard/Expenses/Financial Data navigation is replaced by Home as hub plus the approved hamburger/global menu.
- A continuously accumulating weekly question count is replaced by current-period weekly questions plus an older/historical context and no-more-than-monthly reminder. Stable issue identities remain; questions are never copied into weekly batches.
- “Questions first” as the entire weekly opening is refined: the customer first performs personal and mixed-use exception sweeps on the period list, then Betti asks detailed factual questions.
- Weekly confirmation grouped by tax category and actions that encourage category management are replaced by cleaned activity review with category as subordinate information and direct factual treatment correction.
- Unmatched receipt payment method is no longer required merely to establish a receipt-only expense. It may be collected only when materially useful.
- A dominant documentation percentage/health grade is replaced by factual documentation states and informed owner decisions.
- Exact-time cadence requirements are superseded by a weekday-only current product rhythm using the Business IANA timezone. Exact time remains non-authoritative future exploration; immutable historical period behavior remains.
- The former fixed per-calendar-month cleanup price is obsolete. Earlier cleanup may carry a separately disclosed one-time charge, but no price or billing formula is approved.
- Current mileage facts-only architecture remains the production safety boundary, while standard-mileage and actual-expense support become approved future product requirements gated on authoritative tax rules and additional canonical facts.
- Current autonomous Plaid webhook/cursor correctness remains intact. The once-weekly normal refresh direction cannot supersede provider-required sync behavior until Plaid validation is complete.

## 17. Engineering guardrails

- Preserve source evidence, append-only decisions, convergence, exact money, tenant isolation/RLS, membership scope, and fail-closed tax treatment.
- Do not create parallel review, correction, receipt, or bookkeeping state.
- Bulk decisions require explicit scope and provenance; they are not permission to guess.
- Product copy must distinguish source coverage, bookkeeping completion, documentation completeness, and tax treatment.
- Implement only approved milestones. This specification is not blanket authorization to build every requirement.

**WriteOffs does the bookkeeping. The customer supplies facts, corrects when needed, and confirms the result.**

### Unified document intake (September 2026)

The normal upload model is **Send Betti documents**: receipts, bank/card statements and structured bank exports use one file chooser. Customers do not select PDF/CSV/receipt parsers. Safe content classification precedes parsing; unknown documents stop for help. The general entry points are Home and `/import`; contextual **Needs a receipt → Upload receipts** remains receipt-focused. Ten files per selection, two concurrent uploads, and per-Business pending-work bounds keep processing controlled. See `DURABLE_DOCUMENT_PROCESSING.md` for supported extraction, provenance, duplicate protection and recovery boundaries. Statement activity uses the existing canonical ledger, historical question policy and receipt matching; statement signs do not independently establish income or expense treatment.

### Incoming money and purchase receipts

Purchase receipts are a distinct evidence type, not a generic document requirement. Only negative, established expense activity with business, mixed-use, or unresolved treatment is eligible for purchase-receipt work. Incoming customer payments, deposits, transfers, owner funds, loans, and refunds do not create missing-purchase-receipt prompts, counts, or bulk work. Unknown negative activity must first be established as a purchase; credit-card payments are not ordinary expenses.

Unresolved incoming financial activity receives one canonical transaction-type question, including historical imports. Customer payment establishes business income once; transfers, owner contributions, and loan proceeds have no P&L effect. Refund/reimbursement and other answers preserve the customer's fact but remain unresolved until supporting facts establish an appropriate adjustment; they do not default to revenue or an invented expense reversal. Existing chronological ordering, deferral, unknown-answer semantics, evidence versions, and historical meal suppression remain in force.

Needs a receipt selection directly offers **I don’t have these receipts** and **Clear selection**. This records the existing receipt-unavailable assertion, preserves financial treatment and history, and permits a later receipt. Business removal belongs in general transaction correction, not receipt cleanup. Incoming transaction detail directs the customer to its factual Betti question instead of presenting a missing receipt.

## Decision-engine foundation — Phase A+B

Category evidence is independent of business use, business allocation, documentation,
and supported tax treatment. The append-only operating-expense assessment preserves
an evidence-backed candidate before business use is known. Established allocation
categories remain the reporting authority. A candidate alone never creates a business
expense or tax deduction. Receipt absence/unavailability does not erase an established
business allocation or category.

Statement accounts use the same customer-authored Business only / Business and personal
fact as connected accounts. Unknown account use is collected once under Check-in or
Bank connections, not inferred from the statement title. Changes enqueue the existing
leased, resumable account-dependent reassessment jobs.

The deterministic classifier normalizes provider vocabulary, shares meal and telecom
context, preserves existing categories against weaker recognition failures, and routes
incoming money and payment descriptions before ordinary purchases. Customer-authored
facts remain authoritative. Automation may fill one blank business category only while
preserving every nature/use/amount/purpose/split fact; it may not flatten multiple
business allocations or replace existing categories. Ambiguous answers require a useful
factual clarification rather than an invented category.

Working income, expenses and profit use established business allocations through the
shared working-books policy. Reports shows named categories plus “Still being
categorized,” reconciling exactly to total expenses. Bookkeeping-decision counts and
incomplete tax-allocation counts are separate; included working expenses are never
labelled excluded merely because tax treatment is incomplete. Tax-Time retains the
separate supported-deduction basis.

Current-question projection filters obsolete category/business-use questions without
marking them answered. Historical meal limitations remain evidence limitations, not
substantiated facts. GET question/report projections do not generate questions. The
explicit question-reconciliation POST command remains an idempotent compatibility
path after customer actions/refresh; normal record workers also generate applicable
questions. This command retains authentication, MFA and membership enforcement.

### Deferred Phase C: controlled semantic intelligence

Semantic merchant/customer-answer interpretation and category/ambiguity proposals need
measured evaluation, evidence references, correction precedence and conflict handling.
Transaction AI remains shadow-only; no model acquires independent tax authority.

### Deferred Phase D: complete split workflows

Complete the normal loan principal/interest workflow, multiple business-category
allocations, receipt line-item allocation, exact reconciliation and split corrections.
Raw OCR line items are not trusted category allocations. Broad customer-approved
recurring rules are also deferred; existing phone/internet fact reuse is preserved.

## Transaction workflow and special activity (staging repair)

Transaction navigation carries a validated, internal originating URL, including work view, search, dates, account, category and page. Search text and Apply filters have distinct actions. Contextual Check-in returns to its transaction; Home-origin Check-in retains the ongoing queue.

Account-use prerequisites are asked conversationally using the existing account fact; settings remains its correction surface. A transaction-specific personal/mixed exception never changes the account default. Corrections preserve financial evidence and history. Business dollars determine a mixed allocation; the personal remainder reconciles exactly.

Personal allocations on financial activity represent owner/personal use outside P&L, including outgoing owner transfers. Reports shows this separately. This is a canonical non-P&L measure, not a full GAAP balance-sheet/equity ledger. Owner contributions remain separate non-income funding. Personal receipt-only spending does not imply a withdrawal from a business account.

Merchant returns require a confirmed purchase relationship. Candidate evidence uses merchant normalization, amount, date window and account; matching is never automatic here. The mutation checks tenant ownership, current decisions, remaining total/business/personal capacity and exact cents under a tenant lock. Multiple partial returns are supported. Mixed returns require the business dollars returned. Cross-year returns and multi-category allocation ambiguity remain explicit review; no prior-year tax recovery is invented. Changing the original decision invalidates the dependent return allocation for renewed confirmation. Both source transactions remain.

Credit-card payments stay outside P&L and purchase receipts; opposite payment sides remain relationship-ready. Owner transfers are personal non-P&L allocations. A confirmed business-loan payment requests its statement inline through unified intake. A bounded deterministic document reader accepts uniquely labeled payment date, total, principal and interest only when cents reconcile to the target payment. Ambiguous/unrelated documents need help. Supported splits use existing compound reconciliation: principal excluded, interest a business expense, tax support separately assessed. This does not generate amortization or implement broad line-item splitting.

Successful answers use result language. Deferral records an explicit unresolved choice and uses return-later language. Read-only pages do not append decisions.

### Next manual certification — recorded, not executed

Create a separate fresh staging customer; initially do not connect Plaid. Upload the controlled multi-page checking and credit-card statements, with known dates and amounts. Let normal workers ingest them. Verify account use, categories, personal/mixed use, owner use, refunds, card payments, loan documents, money-in, receipts/matching, Reports and Tax-Time. Only after these document-based checks pass, connect Plaid for a separate ingestion/reconciliation test. Keep Rick’s existing customer as history/regression stress data; do not reset it or migrate its history into the new customer.

## Manual/document customer access

Authenticated bookkeeping access requires MFA, membership capability and completed
product onboarding. Neither Plaid connectivity nor the optional get-started
acknowledgement is an access prerequisite. Existing document customers with a null
`business_customer_setup.completed_at` can use their books without a backfill.
A document start choice leads to Send Betti documents; account connection remains
an optional recommendation. Document rows appear immediately while uploading,
then use backend-confirmed review/import/matching states.

Mileage catch-up asks one required date range at a time, preserving recorded
periods, exact mileage precision, rate boundaries and deferral. Betti calculates
the deduction. Normal trip entry asks miles and date, not a rate or deduction.


### Authorized scope and shared customer work

The selected bookkeeping start activates only dates permitted by canonical commercial coverage. Uploading documents or receiving provider history never expands that scope. Earlier evidence is retained outside active books, questions, sweeps, matching and working reports.

No historical cleanup means no Catch-up workstream. For example, a September activation with an August 1 selected start uses August onward as Current; a May statement is out-of-scope evidence. Catch-up requires an explicitly selected earlier start permitted by paid or grandfathered coverage, earlier than the normal current/previous-month included period. Its interval ends the day before activation. Activity dates determine membership, never upload dates or age alone.

Home, Check-in and the question API consume the same read-only Betti work projection. A shared account prerequisite counts once. Pending processing suppresses dependent questions without blocking unrelated work. Received/unassessed, processing, action required, deferred, held and settled states remain distinct. Reading never repairs or creates bookkeeping facts.

Scope expansion schedules bounded, resumable reassessment only for the newly authorized interval. Working reports and the active transaction ledger use the same scope boundary while retaining immutable original source records.

### Phase 3: one guided Work with Betti experience

`/check-in` renders the authoritative Betti work projection, including guided actions, not a second question queue. Account-use remains one canonical fact. For assessed ordinary bank-backed purchases, business-only accounts receive a scoped personal exception review followed by partly-personal exceptions; mixed accounts receive a grouped factual use review. Already customer-established use and valid existing mixed/multiple-category allocations are not reclassified by the sweep.

Groups contain at most eight visible purchases. Explicit answers are append-only, versioned snapshots of record, decision, evidence and account-use identity. New/unseen activity never inherits a prior review. Personal/mixed answers invoke existing canonical correction commands. No selection in a business-only exception sweep records only that scoped review, not a fabricated new business-use or tax decision.

Receipt upload uses the unified intake. Relevant processing must settle before receipt-availability confirmation. “That’s all the receipts I have” invokes the existing receipt-unavailable assertion only for the displayed eligible group. It does not erase working expense treatment. Deferral is separate from completion. Reassessment and matching remain canonical workers; read/render operations do not mutate them.

Engaged customers continue naturally while legitimate actions remain. Handled and deferred progress is restrained context, never an automatic five-action stop. Receipt Later defers the displayed opportunity without asserting unavailability; “That’s all the receipts I have” is a separate versioned assertion. Projection priority and dependencies determine the next useful action. Completion language distinguishes the end of a visit, actual processing, deferred work and supported source coverage; it never invents whole-business current-through or Catch-up review authority.

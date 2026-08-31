# WriteOffs workflow specification

Status: canonical product and workflow authority, revised 2026-08-27.

This document defines approved product behavior. It does not authorize implementation outside an approved engineering milestone. When legacy UI or workflow documentation conflicts with this document, this document governs; the conflict register near the end records intentional supersessions.

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

Normal membership bookkeeping coverage includes the first day of the previous
calendar month forward. For example, a membership begun August 27 includes July 1
forward. The customer chooses the bookkeeping start date/scope that reflects the
real situation—such as this month, January 1, when prior books stopped, or when the
business began—rather than selecting individual transactions to import. The included
coverage boundary must be disclosed before purchase:

> Membership includes bookkeeping from the first day of the previous month forward.
> Earlier historical catch-up may have a separately disclosed one-time charge.

The customer may choose **Start with what's included** or **Catch up earlier books**.
Historical cleanup is optional and may be added later. Earlier work may carry a
separately disclosed one-time cleanup charge, but no cleanup price or billing formula
is currently approved. Pricing and customer terms must be approved and shown before
the customer agrees; this specification does not authorize cleanup billing.

- The customer may select an exact earlier start date based on their circumstances.
- Cleanup may require statements, receipts, or other records when connected history is insufficient.
- Cleanup organizes supported books; it does not prepare, file, or amend tax returns.

Historical cleanup finishes with a durable review state and immutable presented snapshot. Betti processes what is available, uses evidence and bulk decisions, resolves avoidable personal/mixed ambiguity, and presents a factual summary of business expenses, personal/excluded activity, mixed use, documentation limitations, and unresolved category/detail limitations. **Caught up through [date]** means available records and customer decisions were processed and reviewed honestly, not that every source is perfect. The customer may choose **Everything looks right** or **Make a change**.

## 4. Onboarding and account context

The authenticated prerequisite order remains email/session, mandatory MFA, membership, business onboarding, Get Started, then Home. The primary starting path is connected accounts; statements, CSV, and receipts remain valid alternatives.

For each connected checking or credit account ask **How do you use this account?** with **Business only** or **Business and personal**. This is reusable context, not an irreversible transaction classification. Every account uses the same review model because even business-only accounts may contain personal or mixed activity.

During onboarding ask for the customer's weekly check-in day:

> When is usually a good time to check in with Betti?

Explain that this is a gentle, flexible rhythm rather than a mandatory appointment;
the review remains available whenever the customer is ready. The Business IANA
timezone is canonical for cadence and quiet hours. An exact local check-in time is
not part of the current product contract. Future cadence changes never rewrite
historical periods or confirmations.

Onboarding asks only real-world facts needed for fit and service. It must not ask the
customer to choose tax treatment, accounting classifications, deduction categories,
inventory/material accounting, prior tax treatment, or another rule WriteOffs must
determine. **We ask for the facts. We handle the rules.**

Receipt availability answers such as Most/Some/None are transient routing unless a later independent analytics requirement justifies a product event; they are not bookkeeping state.

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

### Missing receipts

Handle missing documentation mainly during review/finalization, beginning with a bulk decision when truthful. Explain once that the IRS may ask for records supporting business expenses and that receipts are one form of support. Offer **Include these expenses**, **Exclude these expenses**, **Upload receipts**, and **Review individually**.

Including preserves business totals and missing-documentation status; it does not claim substantiation is complete and should not trigger repeated nagging for the same unavailable receipt. A documentation decision never resolves unrelated business-purpose or business-use ambiguity.

## 8. Facts, questions, and deferral

After exception sweeps, Betti asks only remaining material factual questions, one at a time, with relevant evidence. Customers provide free text and simple factual choices, never tax categories.

For business meals, restaurant recognition may establish meal context but not business purpose. Ask who attended and the business nature/purpose with light examples such as **Sarah Jones, client** and **Discussed a new listing and marketing plan**. For multiple meals, introduce the requirement once, group/pattern where truthful, and move through them efficiently. If facts cannot be recalled, explain the limitation and ask whether to keep or exclude; keeping preserves customer-established business treatment and incomplete substantiation.

When older cleanup expenses cannot be identified, offer a group resolution: **Keep them as business expenses**, **Treat them as personal/exclude**, or **Review individually**. A Keep decision establishes customer-asserted business use but never fabricates category or tax treatment; those may remain unresolved and the documentation limitation remains.

Distinguish **Yes, I can get the information later** from **No, it's missing/not available**. The latter proceeds to an informed include/exclude resolution. The former defers to the next weekly review and is grouped as **You had 4 things you were going to look for**, with **I have it**, **Still looking**, or **Not available**. After roughly two or three repeated weekly deferrals, explicitly ask whether the information is realistically expected instead of repeating forever.

Weekly review counts contain current/recent-period work. Questions that age beyond that context move to an older/historical context; they are not copied, duplicated, or indefinitely added to every weekly count. Older questions remain accessible. At most monthly, use a calm reminder such as **You have 14 older questions waiting. We'd like to help you get caught up.** No response waits until the next monthly opportunity.

## 9. Weekly review sequence and sign-off

For a period with relevant activity:

1. Import the period's activity; Betti starts processing immediately.
2. The customer reviews the period transaction list.
3. Personal sweep removes personal activity from business workflow.
4. Mixed-use sweep collects business dollar amounts.
5. Betti asks only remaining factual questions.
6. Missing-documentation decisions occur during finalization.
7. Betti finishes supported bookkeeping and creates the exact immutable review snapshot.
8. Present cleaned business books: income subject to membership scope, business expenses, mixed business portions, receipt status, and established plain-language categories.
9. Ask **Anything you'd like to change?** with **Everything looks right**, **Make a change**, and a respectful deferral option.

The review feels like a focused version of Transactions, not a raw bank feed or accounting table. Personal items do not remain. Categories are informational and subordinate; unresolved categories are omitted rather than guessed. Internal keys and Schedule C language are never exposed. Simple business/personal/mixed corrections happen inside the review conversation where practical without forcing the customer to leave and find the review again. They use the same append-only canonical history and provenance as every other correction; Weekly Review never owns a parallel correction system.

Items are ordered by activity date with deterministic same-date ordering. The snapshot preserves the exact current canonical record/decision identities, customer-facing established category label, business treatment/portion, receipt status where available, and amount presented. Period identity follows the effective Business cadence, uses date-based timezone-safe boundaries, is unique, and never changes retroactively.

**Everything looks right** confirms the exact period-level snapshot; it is not transaction approval. Corrections use ordinary canonical history and link back to the review event. A material later correction may reopen the period without erasing prior history. Durable states distinguish reviewed/confirmed, reviewed with corrections, and unreviewed/no response. **Not right now** is a deferral, not a confirmation, and its copy must never imply approval. Silence is never approval.

### Mileage in weekly review

If the period has no mileage entries, ask **Did you drive for your business this week?** with Yes/No. If entries exist, show them and ask **Any other business trips I should include?** with **Add a trip** or **No, that's everything**.

## 10. Home, navigation, and connected-account status

Home answers: Is WriteOffs doing its job? Does WriteOffs need me? How is my business doing? It uses canonical potential-writeoff, documentation, review, question, membership-scoped financial, and provider-health read models. Its established composition is substantially aligned and protected from another wholesale dashboard redesign. Future work may refine truthful states, wording, responsiveness, and behavior while preserving a calm, result-oriented page focused on what WriteOffs accomplished, whether the customer needs to act, and a useful financial picture. Home remains the hub with a hamburger/global menu and must not become an accounting dashboard or wall of widgets; mobile is a primary composition.

When caught up, use canonical Caught Up Betti and language such as **Everything's handled. Your books are up to date.** Do not manufacture engagement. Keep the next scheduled check-in, last successful connected-account check, and a secondary **Check for new transactions** action visible.

If an institution requires reauthentication, say **I need your help reconnecting [Bank]. Your bank is asking you to sign in again before I can get your latest transactions.** Offer **Reconnect account**. Successful reconnection triggers immediate refresh and processing, then restores normal Home status.

## 11. Bank refresh direction

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

A potential writeoff is one distinct current canonical economic expense with a nonzero established business portion, even if tax treatment, documentation, or special treatment remains unresolved. It includes current business/mixed and receipt-only expenses, excludes unresolved/personal/income/transfers/card payments/owner funding/loans/standalone credits, converges duplicates through canonical currentness, and changes through the current decision leaf. Mileage remains separate. Both memberships use this same expense metric.

Reports derive from canonical records and membership scope. Expenses never implies income completeness or estimated profit. Business may show supported cash-basis income, expenses, and estimated profit. WriteOffs organizes records for tax preparation; it does not file returns or guarantee outcomes.

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

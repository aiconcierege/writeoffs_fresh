# Customer bookkeeper experience

Status: canonical product and interaction specification, 2026-08-26.

## Product relationship

WriteOffs does the bookkeeping. The customer runs the business. WriteOffs asks a
question only when it lacks a material fact that the customer can reasonably
answer. Questions use ordinary real-world language; customers never choose an
accounting, tax, or Schedule C category.

Unknown business use remains unresolved. It is never silently treated as personal,
including on accounts described as mixed-use or business-only.

## First run

The deterministic authenticated journey is signup, email confirmation, mandatory
MFA, membership/payment, business onboarding, Get Started, then Home. A customer is
always sent to the earliest unmet prerequisite and never has to discover setup work
through product navigation. Security and billing recovery remain reachable, while
refreshing or directly opening a later product route returns to the required step.

Get Started is complete once the Business has chosen its durable weekly check-in
cadence. Account connection is preferred, but statement, CSV, and receipt intake
remain first-class alternatives and may be used from Get Started. Most/Some/None
receipt answers are transient conversational routing and are not bookkeeping facts.

## Weekly check-in

The order is: WriteOffs completes everything it safely can; asks outstanding
factual questions; incorporates answers; presents an immutable snapshot of the
period; offers factual correction; and records one period-level confirmation.
Confirmation is not transaction-by-transaction approval.

Each Business may select a normal check-in weekday. The append-only cadence event
has an effective date. Created periods retain their actual date boundaries and
cadence provenance forever. A future cadence change begins after the last historical
period boundary and never rewrites a prior snapshot or confirmation. The stable
Business/check-in-date identity and overlap guard prevent duplicate periods.

No relevant activity means no review period. Questions retain their existing stable
issue identities and continuous queue; they are never copied into review periods.
Explicit defer controls presentation only. No response never becomes approval and
may be recorded as `closed_unreviewed`. Bookkeeping and durable processing continue.
The initial response window is configurable (`WEEKLY_REVIEW_RESPONSE_DAYS`, with a
14-day default). Expiration closes the review as unreviewed; it never confirms it.

Snapshots record the exact current canonical record and decision identities shown.
A customer correction appends an ordinary canonical decision and links that history
to the snapshot. A material later correction reopens the period without erasing its
prior confirmation.

## Potential writeoffs

A potential writeoff is one distinct current canonical economic expense for which
WriteOffs has established a nonzero business portion, while final tax treatment,
documentation, or special-treatment questions may still remain.

The count includes current business and mixed-use expense decisions, including
receipt-only expenses, only when their signed business allocation is a nonzero
outflow. It excludes unresolved, personal, excluded, income, transfer, card-payment,
owner-funding, loan, and standalone expense-credit activity. Current convergence,
compound reconciliation, manual lifecycle, and provider-currentness determine the
single economic record. Corrections change the count through the current decision
leaf. Mileage is displayed separately. Both memberships use the same expense metric.
The UI may use “We’ve found [X] potential writeoffs this year” only with the
central canonical selector.

## Home and navigation

Home leads with work WriteOffs has done, then a calm question invitation or caught-up
state, documentation status, record-area access, and a secondary membership-scoped
financial summary. A global menu replaces the persistent accounting-software nav.
Secondary pages remain focused and transparent. Mobile is a primary layout.

## Corrections

Imported transactions are immutable source facts. “This isn’t a business expense”
and “Only part of this was for business” change the append-only bookkeeping decision,
not the source. Reversal is another superseding decision. Removing an accidental
user-created record is a distinct source-lifecycle operation. Weekly Review does not
own a parallel correction system.

# Customer bookkeeper experience

Status: canonical product and interaction specification, revised 2026-08-27.

The detailed workflow authority is [WORKFLOW_SPECIFICATION.md](./WORKFLOW_SPECIFICATION.md). This document summarizes the enduring customer relationship and presentation contract.

## Product relationship

WriteOffs does the bookkeeping. The customer runs the business. WriteOffs asks a
question only when it lacks a material fact that the customer can reasonably
answer. Questions use ordinary real-world language; customers never choose an
accounting, tax, or Schedule C category.

Before asking an individual question, WriteOffs looks for a truthful group,
exception, merchant-pattern, or recurring-treatment decision. Any group action
requires explicit customer confirmation and visible scope. WriteOffs explains
documentation expectations without acting as an enforcement authority; the
customer chooses inclusion or exclusion when available facts remain incomplete.

Unknown business use remains unresolved. It is never silently treated as personal,
including on accounts described as mixed-use or business-only.

## First run

The deterministic authenticated journey is signup, email confirmation, mandatory
MFA, membership/payment, business onboarding, Get Started, then Home. A customer is
always sent to the earliest unmet prerequisite and never has to discover setup work
through product navigation. Security and billing recovery remain reachable, while
refreshing or directly opening a later product route returns to the required step.

Get Started is complete once the Business has chosen its durable weekly check-in
weekday. The Business IANA timezone makes that cadence date-safe; an exact check-in
time is not required in the current product. Account connection is preferred, but statement, CSV, and receipt intake
remain first-class alternatives and may be used from Get Started. Most/Some/None
receipt answers are transient conversational routing and are not bookkeeping facts.

Membership normally covers the first day of the previous calendar month forward.
The customer chooses a bookkeeping start date/scope based on their circumstances,
not individual transactions. Before purchase, customers see the included boundary;
earlier cleanup may carry a separately disclosed one-time charge. No historical-
cleanup price or billing formula is currently approved. Cleanup remains a
bookkeeping service, not tax-return preparation or amendment.

## Weekly check-in

The order is: WriteOffs processes incoming activity; the customer reviews the
period list and marks personal and mixed-use exceptions; WriteOffs asks only the
remaining factual questions; handles missing-documentation decisions; presents an
immutable snapshot of the cleaned business books; offers factual correction; and
records one period-level confirmation.
Confirmation is not transaction-by-transaction approval.

Each Business may select a normal check-in weekday. The append-only cadence event
has an effective date and Business timezone. Created periods retain their actual date boundaries and
cadence provenance forever. A future cadence change begins after the last historical
period boundary and never rewrites a prior snapshot or confirmation. The stable
Business/check-in-date identity and overlap guard prevent duplicate periods.

No relevant activity means no review period. Questions retain stable issue identities
and are never copied into review periods. Current-period questions appear in the
weekly review; aged items move to an older context with at most a monthly calm reminder.
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
financial summary. Its established composition is substantially aligned and should
not be replaced with another generic dashboard. A global menu replaces the persistent accounting-software nav.
Secondary pages remain focused and transparent. Mobile is a primary layout.

## Ask Betti

**Ask Betti** is the canonical name for future customer assistance with WriteOffs,
the customer's authorized records and workflows, explanations of what WriteOffs is
asking, and help completing a WriteOffs task. It is not a general-purpose chatbot,
does not make Betti the product brand, and is not implemented by this specification.

## Corrections

Imported transactions are immutable source facts. “This isn’t a business expense”
and “Only part of this was for business” change the append-only bookkeeping decision,
not the source. Reversal is another superseding decision. Removing an accidental
user-created record is a distinct source-lifecycle operation. Weekly Review does not
own a parallel correction system.

## Customer interruption

Betti works whenever activity becomes available; weekly cadence is for customer
attention, not processing. Ordinary notifications respect 9:00 AM–9:00 PM quiet
hours in the Business timezone and use one consolidated weekly message. Security
may interrupt. Account reauthentication is prominent when it blocks fresh data but
normally waits for the next allowed notification window.

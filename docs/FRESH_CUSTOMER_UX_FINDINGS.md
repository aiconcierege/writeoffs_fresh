# Fresh-customer UX findings — Phase 1 tracking

These product-owner-approved findings were recorded during the September 2026
fresh-customer staging test. They were approved separately from functional blocker repairs and are now addressed
by the Phase 1 refinement. Canonical decisions and remaining Phase 2 scope are in
[WORKFLOW_SPECIFICATION.md](WORKFLOW_SPECIFICATION.md#phase-1-fresh-customer-experience). Existing onboarding/funnel findings collected elsewhere remain
in force; this list does not replace or implement them.

## Home

- Replace vague “I need X details from you” wording with “I have X questions for you.”
- When questions exist, prefer “Answer Betti’s questions” for the action.
- The product concept/navigation can remain Check-in.
- With no questions, retain “Your books are current.”

## Check-in

The question presentation feels too blocky and form-like. The Phase 1 refinement makes it lighter and more conversational, while preserving transaction
context, accessibility, mobile quality, deferral, and one question at a time.

The earlier stuck-Continue repair remains intact: version checks, idempotency,
authoritative queue reload and stable session ordering are preserved.

## Phase 2A implementation

The approved guided review, Transactions selection/work views, activity-date historical
question policy and compact Check-in decisions are maintained in
[the canonical workflow](WORKFLOW_SPECIFICATION.md#phase-2a-guided-review-and-the-30-day-policy).
Full Reports visual refinement is Phase 2B. Receipt/statement ingestion and Plaid launch
administration remain the next manual/launch checks, not a Phase 2A rewrite.

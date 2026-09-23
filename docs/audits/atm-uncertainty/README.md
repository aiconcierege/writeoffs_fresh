# ATM uncertainty persistence correction

## Cause and scope

The UI sends `{action: "not_sure"}` with the question event version. The API accepts
it and invokes `answer_bookkeeping_customer_not_sure`. The live shared persistence
function allowed BUSINESS_USE_UNCLEAR, BUSINESS_PURPOSE_NEEDED and
MIXED_USE_CLARIFICATION, but rejected TRANSACTION_TYPE_UNCLEAR with
`Not sure is unavailable for this question`. The API turns that exception into
the observed generic HTTP 400. Reproduced locally and on the existing tagged
synthetic customer through the indexed public staging API. Rick's failed request
was not replayed; no historical request log is claimed.

The correction adds only TRANSACTION_TYPE_UNCLEAR to that existing reason guard.
Ownership, current-event/decision/evidence guards and exact-answer validation are
unchanged. It fixes incoming and outgoing activity questions, including ATM.

## Rendered-response audit

| UI type | Command / persistence | Result |
|---|---|---|
| Business use | not_sure / canonical customer uncertainty | Existing supported reason; database regression passes |
| Business purpose | same | Supported; established allocation/category preserved |
| Mixed use, including amount-entry view | same | Supported; does not invent percentage |
| Transaction type, including expanded confirmation alternatives | same | Missing reason corrected; live HTTP 400 before / 200 after |
| Special transaction movement/refund | unsure / record_special_transaction | Existing explicit unsure action; separate persisted special event and supporting-document UI |
| Percentage/deduction, meal relationship, factual choice | No generic not_sure button | Existing factual answers or defer only |

Onboarding's uncertainty choices use their existing setup enums and are outside
this question-persistence defect; no onboarding changes were made.

## Semantics

Not sure records an explicit uncertainty answer in immutable review history. The
existing answer machinery creates a successor decision preserving economic nature,
treatment, purpose and allocations, then closes that particular review turn.
Closing a turn does not complete the unsupported bookkeeping. A new evidence/context
assessment can ask again; this is not an automatic seven-day promise.

Defer records a skipped event, no factual answer and no replacement decision, with
the existing seven-day availability delay. Special-work unsure remains distinct
from defer: it requests a supporting record instead of repeating the same choice.

## Copy and scope

For outgoing ATM WITHDRAWAL questions, the renderer says “What did you use the
cash for?” and suppresses the payment guidance, including for an already-published
question. The outgoing Something else label now asks what the money was used for.
No question identity, projection rebuild or answer contract changes are required.
A direct personal activity answer was not added: the current transaction-type
contract has no such value, and mapping it to purchase would invent economic nature.

## Evidence / validation

- Local rollback-only SQL reproduces the exact original database rejection.
- tests/security/customer-uncertainty.local.sql exercises all four supported
  uncertainty reasons, preserved unresolved and supported expense treatments,
  exact payload rejection and distinct defer history.
- tests/security/specific-fact-routing.local.sql passes including freeze guards.
- Public synthetic request: 400 before; 200 after; one uncertainty answer;
  ATM remains unresolved; no immediate repeat; totals unchanged.
- 1,928 tests passed; 143 environment-dependent tests skipped.
- TypeScript passed; lint zero errors / 16 existing warnings.
- Optimized webpack build passed. Local default Turbopack limitation is unchanged.
- No production/main changes; no automatic retry for Rick.

# Manual account-use and Home action repair

Scope: dedicated staging, September 17, 2026. No bookkeeping rule, ingestion,
SQL/schema, worker, pricing, or tax-treatment changes.

## Findings

The product owner's follow-up clarified that the manually uploaded statement
never prompted for account use. Document intake displayed a completed import but
had no account-use step. Unknown statement accounts were only surfaced in
Check-in and Bank connections. Completing a document import neither established
account use nor took the customer through that question. No designation, history,
or reassessment jobs is consistent with that missing interaction.

The reported earlier click failure was not independently reproduced: both a
first answer in Check-in and a changed answer in Settings succeeded against the
existing API before this repair. Historical request diagnostics did not establish
a rejected save. Do not describe this as a repaired database/decision-engine bug.

The former statement control also showed an optimistic selected radio before
confirmation, had no saving text, and accepted HTTP success without checking the
canonical event acknowledgement. A native input could appear selected before
hydration. These presentation/reliability weaknesses are repaired as well.

## Normal customer path

- Document status GET reads unknown statement accounts through the existing
  tenant-scoped projection. It creates no bookkeeping facts or questions.
- General Documents renders the existing account question, including when normal
  processing creates an account while status polling continues. Existing imports
  gain the question without re-uploading anything.
- Transaction-specific supporting-document intake does not add unrelated account
  prerequisites. Check-in and Settings keep their existing account controls.
- Both choices call the same authenticated account-use endpoint and canonical
  `set_financial_account_use` RPC. Its atomic history append and per-record queue
  enqueue are unchanged. There is no separate manual-account decision logic.
- The statement radio reflects a choice only after a valid persisted event ID is
  returned. Saving, unconfirmed/error, and retry states are explicit. Controls
  wait for hydration. Retry reuses the original request identity; requests use
  keepalive. Connected-account controls share the response contract.
- Saving refreshes the document prerequisite and current page. Canonical workers
  reassess normally. No synthetic facts are applied to a manual customer.

## Home and receipt language

Home's Tell Betti anytime area has four balanced links: Send documents, Add
mileage, Add money, Create invoice. The heading sits above the actions. There is
no permanent filename/status inventory or large document panel on Home.
Documents retains upload progress, received/reviewing, completed/help/failure,
transaction counts and receipt/transaction links.

An organized receipt says Betti will look for a matching transaction. Only the
backend's matched outcome is called matched. Receipt-backed purchases in
Transactions say "Receipt saved · No bank match yet"; attached receipt evidence
on a financial transaction is described separately. No receipt relationships or
bookkeeping treatment are modified by this copy. Receipt-origin records that later
gain bank evidence use the actual financial-source relationship, not their
original source kind, to determine this wording. History says receipt recorded
or attached rather than claiming every receipt-only link was a match.

## Certification boundaries

The browser regression is explicitly opt-in and verifies synthetic tenant markers
and business ownership before creating input fixtures. It exercises general
Documents, Check-in before hydration, the actual API, failed acknowledgements,
retry identity, durable account history, Settings/reload, cross-tenant rejection,
and the normal scheduled reassessment worker. It never invokes a queue drain.
Input records are synthetic; bookkeeping results are not seeded.

Rick's clean-room customer is inspected read-only. No answers, account facts,
receipt links, classifications, uploads, resets or reconciliation changes are
performed for that customer. Rick's next manual answer remains the T=1 event.

## Standing later work

Use recognizable merchant/company logos when identity is reliable, with a clean
neutral fallback, consistently across Transactions, Recent Activity and detail.
No logo work or new merchant-identity inference is included here.

## Validation before deployment

- Full suite: 1,395 passed; 143 environment-dependent tests skipped.
- TypeScript and optimized Next build passed.
- ESLint: zero errors, 16 existing warnings.
- Gitleaks tracked-source snapshot: no leaks. Diff whitespace check passed.
- Dependencies unchanged; audit reports two moderate findings, zero high/critical.
- Optimized-build browser test passed in 54 seconds, exercising both account
  answers, durable history, reload/Settings, duplicate retry, rejected foreign
  account and normal scheduled worker completion. No manual queue drain.
- Home action area visually inspected at 390 and 1280 pixels; browser layout
  checks also cover 430 and 768. Four balanced actions; no expanded file inventory.
- Pre-deployment read-only clean-room snapshot exactly matches T=0 across source
  transactions, accounts, account use, decisions, allocations, questions,
  documents, receipt processing, and deduction attention (timestamp excluded).

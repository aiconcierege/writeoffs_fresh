# Evidence-first work orchestration

Status: implemented in dedicated staging. Engineering evidence and explicit limits:
[verification report](audits/evidence-first/README.md). Not a manual clean-room or launch certificate.

## Product authority

Rick's September 23, 2026 workflow direction supersedes the former generic
personal → mixed → receipt sequencing. The customer supplies facts; Betti uses
available evidence before asking for more. Financial records, decisions,
allocations, receipt history, and reports retain their existing authority.

## Work periods

- The joining month and preceding month are included in membership.
- Purchased/authorized earlier cleanup ends immediately before that fixed included
  start. A September joining customer with January coverage has January–July cleanup.
- A separate business-local scheduling window starts on the first day of the prior
  calendar month. It moves with time; it never changes commercial authorization.
- Unfinished included months remain ongoing covered work. They do not become new
  cleanup purchases when the calendar advances.
- Prioritize recent work, then older ongoing work, then purchased historical work.
  Per-Business worker priority retains cross-Business fairness and existing lease,
  retry, and lifecycle controls.

## Evidence opportunity

One lightweight invitation per account/month precedes substantive purchase
questions. It is not an accounting gate. Only established purchases that may benefit
from documents are included; transfers, incoming money, and directly evidenced
statement bank fees are not. Loan statements remain a separate material workflow.

- **Send receipts:** upload through the normal private intake. Record the owned
  document references, wait for extraction/matching/reassessment dependencies, then
  show the remaining authoritative question.
- **I don't have any:** use the existing receipt-unavailable assertion for the
  displayed purchases. Do not append a financial classification or allocation.
- **I'll do this later:** record an orchestration deferral, not unavailable evidence,
  a factual answer, or zero activity.

All three responses suppress repeated invitations for that account/month. The
customer can still upload at any time. New evidence always uses the existing
reassessment path. A later current-month transaction does not reopen a monthly
wizard or inherit a fabricated per-transaction unavailable assertion.

The durable response uses the existing immutable `betti_guided_assertions` history.
The command requires ownership, active membership, MFA, and no pending deletion.
Retry identities bind exact inputs. None/later require the displayed decision and
evidence versions. Uploaded documents may already have changed those decisions;
the provided response validates owned immutable sources/documents instead and
does not write any bookkeeping fact.

## Receipt boundaries and lineage

Use visual geometry and independently readable merchant/date/total evidence to
separate receipts sharing a page. Crops contain original document marks, not
reconstructed OCR text. Each logical receipt has a deterministic crop hash and
normal extraction/matching history. Source page/regions remain linked to the
original upload in tenant-protected `receipt_source_regions`. Crops are generated
in memory for processing and authenticated preview; no worker creates a second
permanent private object. Both original and derived byte hashes are checked.
Permanent deletion's existing Business-table traversal includes the lineage;
the original remains under the existing private-object ownership/deletion path.

Repeated explicit document identity can join multiple pages into one logical
receipt. Ambiguous boundaries fail closed. A stable parent/part identity rejects
changed retry crops rather than producing additional expense candidates.

Presence of a receipt does not mark a transaction complete. Printing purpose or
insurance coverage can become established; a phone bill does not establish its
business-use percentage. Customer-authored facts remain distinct from extraction.

## Conversation and preservation

Current and earlier work receive context within Home and Check-in, not new top-level
navigation. Optional business-only exception review says Betti already treated the
purchases as business. There is one viewport-visible saving/transition status.
Existing authoritative continuation and stable active-turn controls remain.

Rick's original clean-room business remains excluded from the staging action-index
worker. No projection rebuild, answers, financial facts, or evidence changes are
authorized for that customer during this implementation. Synthetic customers and
rollback-only local fixtures provide the mutable certification data.

## Verification and next customer journey

The 18-case matrix distinguishes actual hosted extraction/browser evidence from
local PostgreSQL and unit coverage. See the linked verification report for timings,
limitations and preserved failures. A second fresh clean-room customer is recommended
to certify the changed sequence; the original customer's history stays intact.

## Later evidence and safe continuation

Uploaded account/month batches remain in reassessment until their related jobs
finish. Unrelated current work can proceed once document relationships establish
independence. Unknown uploads with no bookkeeping evidence can be set aside with
“Not for my books”; the original and immutable customer disposition remain.

An automatically assessed receipt can converge with its exact later bank source;
its established working allocation moves atomically to the survivor and original
history remains. For an already customer-treated receipt, use the existing
`attach_bookkeeping_financial_source` capability and retain the original canonical
record and customer decisions. Exact date, signed cents, currency, merchant,
uniqueness, ownership and post-lock evidence checks are required. Ambiguous matches
are not guessed. Receipt status reflects the later bank association.

A transaction-bound loan statement can establish the exact principal/interest split
when the loan has current established business context and a current business-only
account fact, or the existing explicit business-loan confirmation. Unknown or
conflicting context remains unresolved. Principal remains excluded. Changed retry
facts fail closed, and no customer confirmation is fabricated.

Phone/internet percentage answers durably queue reassessment in the answer
transaction. Ordinary automated treatment need not synchronously load the entire
evaluation snapshot before acknowledgment. Records with customer-authored treatment
retain the existing guarded synchronous path. A current-version indexed question
may prove eligibility; stale publications use canonical fallback. Canonical answer
validation, ownership, MFA, exact event versions and retry checks remain required.

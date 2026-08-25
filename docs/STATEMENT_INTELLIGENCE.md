# Statement Intelligence R1

## Boundary

Statement upload is a financial-source adapter, not another ledger. Immutable statement observations create ordinary `financial_transactions`; the existing bookkeeping record, decision, queue, receipt convergence, compound reconciliation, reporting, and tax systems remain authoritative. Uploading a statement never classifies activity as Business, Personal, income, expense, transfer, or deductible.

## Supported documents

R1 accepts private PDF checking, savings, and credit-card statements. Generic native-text layouts are supported when transaction rows contain a date, description, and exact decimal amount and their direction can be established without guessing. Unsupported financial documents, image-only statements, ambiguous tables, and unreadable PDFs terminate as **Needs your help** or **Could not be read**. No full account number is stored; only a detected four-digit suffix may be retained.

## Extraction hierarchy

1. SHA-256 and PDF structure validation.
2. Native PDF text extraction with PDF.js.
3. Generic deterministic period, account, balance, and row parsing.
4. Page rasterization and Google Vision OCR only when native page text is materially absent.
5. Exact-cent and balance validation of OCR text through the same deterministic parser.
6. Needs-attention when structure remains unsafe.

No statement page is sent to a multimodal model in R2. OCR is document transcription only; it has no bookkeeping or tax authority. Unresolved structure fails closed.

## OCR persistence and cost

Each page has one immutable `statement-page:r2` extraction identity containing bounded normalized text, page number, method, safe status, provider name, and duration. Raw provider responses and rendered page images are not persisted. Cached pages are reused across retries, matching, reporting, and duplicate uploads.

Native pages retain the 25-page lease. When OCR is needed, work advances in at most five-page subchunks to stay within serverless runtime and provider-cost bounds. Blank rendered pages are detected locally before OCR. Provider calls have the existing 20-second timeout and durable retry cap. There is no customer monthly quota.

## Periods, pages, and durability

Explicit statement-period headings partition combined PDFs when boundaries begin on distinct pages. Dates without years are resolved only inside the detected period, including December/January boundaries. Ambiguous boundaries remain unresolved.

Documents may contain 500 pages and be 100 MiB. One worker lease reads at most 25 pages. `next_page` is persisted before the lease is released, so a long document resumes in later invocations. Upload, storage, queueing, extraction, and canonical ingestion do not depend on the browser remaining open.

## Transaction semantics

Amounts are signed integer cents. Bank deposits/credits are positive; supported withdrawals/debits/checks/fees are negative. Credit-card charges are negative, while explicit payments/refunds/credits are positive. Raw descriptions, source page/row, optional posting date, balance, and check number remain immutable evidence. Normalized descriptions remove only bounded reference noise.

Card payments and transfers enter bookkeeping unresolved. They are not automatically treated as deductible expenses or business income. Existing factual questions and compound reconciliation remain responsible for resolving paired observations.

## Account identity

A Business-scoped statement account uses institution, optional last four, account type, and currency. The derived account identity contains the Business ID and a SHA-256 digest. Last-four equality alone never merges a statement account with Plaid or another account.

## Customer-confirmed account equivalence

An append-only Business-scoped link can state that one statement account and one existing Plaid/CSV account represent the same source account. The customer is the actor and provenance authority. Suggested links require institution, account type, currency, last four, and overlapping exact transaction evidence; last four alone is weak and is never labeled suggested. Customers may choose another account or leave the statement separate.

Confirmation does not merge or delete accounts. Under a current link, an exact unique date/currency/cents/normalized-description pair may create an append-only source convergence. Repeated identical observations fail cardinality and remain separate. The shared current-record resolver suppresses only the absorbed duplicate record. New financial sources automatically recheck current links after their canonical source relationship exists.

Removing a link appends an unlink event and reverses dependent source convergences. Removal fails closed if customer-authored bookkeeping state now depends on a converged record.

## Validation and customer state

When beginning and ending balances are available, deterministic reconciliation checks `beginning + signed activity = ending`. A statement can be validated, partially validated, or unresolved internally. Missing institution metadata does not prevent safe transaction extraction. No missing transaction is fabricated to force a balance.

Customer states remain: queued, still processing, processed, needs help, and unreadable. A partially parsed statement preserves safely extracted rows; ambiguous rows are counted and cause attention rather than forcing review of every transaction.

## Identity and overlap

Exact document bytes deduplicate by Business + SHA-256 before extraction. Logical periods use institution, masked account, account type, currency, and period boundaries. Transaction evidence uses account facts, date, exact amount, bounded normalized description, optional running balance/check number, and an occurrence ordinal. Repeated or overlapping statement PDFs therefore reuse existing observations and canonical transactions.

Cross-source CSV/Plaid overlap is eligible only after customer-confirmed account equivalence. Manual activity continues through its existing customer-confirmed compound path. No observation is deleted based on merchant and amount alone.

## Security and privacy

Production operators may pause new OCR/AI claims with `DOCUMENT_EXPENSIVE_PROCESSING_ENABLED=false`. Uploaded statements, persisted OCR chunks, and jobs remain private and durable; resuming processing reuses completed extraction and does not require customer re-upload.

- PDFs remain in the existing private Business-owned storage path.
- RLS protects documents, periods, and observations.
- Provider/service credentials remain server-only.
- No public URLs, full account numbers, statement text, or document bytes are stored in logs.
- Processing results contain bounded counts and status metadata, not full extracted text.

## Cost controls

Native text is the default. Work is limited by 25 pages per lease, 500 pages per PDF, 100 MiB per file, bounded queue claims, retries, exact-file suppression, immutable period/transaction identities, and extraction reuse. No monthly or low customer upload quota exists.

## Production operation

The existing `/api/internal/processing/drain` runner claims statement jobs alongside receipt jobs. Production should schedule the bounded runner once per minute and may invoke it more frequently under queue depth. Operators inspect service-only queue observability and use the guarded terminal-job recovery function; they must not mutate statement observations.

## Browser coverage

The local Playwright journey signs in, reaches Import through the customer UI, uploads a synthetic statement, leaves before worker drain, returns to persistent state, verifies the canonical transaction, checks Reports, retries the exact document, and repeats the history view at a 390-pixel viewport. It uses the local durable worker directly instead of timing sleeps.

## Intentionally unsupported after R2

- password-protected PDFs
- handwritten statements
- arbitrary institution-specific columns not safely recognized by the generic adapter
- full account-number storage
- automatic account linking based on last four
- automatic tax/business classification
- multimodal statement fallback
- customer-facing confidence percentages

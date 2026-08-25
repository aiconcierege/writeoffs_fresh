# Statement Intelligence R1

## Boundary

Statement upload is a financial-source adapter, not another ledger. Immutable statement observations create ordinary `financial_transactions`; the existing bookkeeping record, decision, queue, receipt convergence, compound reconciliation, reporting, and tax systems remain authoritative. Uploading a statement never classifies activity as Business, Personal, income, expense, transfer, or deductible.

## Supported documents

R1 accepts private PDF checking, savings, and credit-card statements. Generic native-text layouts are supported when transaction rows contain a date, description, and exact decimal amount and their direction can be established without guessing. Unsupported financial documents, image-only statements, ambiguous tables, and unreadable PDFs terminate as **Needs your help** or **Could not be read**. No full account number is stored; only a detected four-digit suffix may be retained.

## Extraction hierarchy

1. SHA-256 and PDF structure validation.
2. Native PDF text extraction with PDF.js.
3. Generic deterministic period, account, balance, and row parsing.
4. Exact-cent and balance validation.
5. OCR/layout and multimodal interpretation are reserved extension points.

R1 does not send statement pages to a vision model. Image-only statements fail closed with `STATEMENT_OCR_REQUIRED`; adding bounded page rasterization/OCR is the next adapter milestone.

## Periods, pages, and durability

Explicit statement-period headings partition combined PDFs when boundaries begin on distinct pages. Dates without years are resolved only inside the detected period, including December/January boundaries. Ambiguous boundaries remain unresolved.

Documents may contain 500 pages and be 100 MiB. One worker lease reads at most 25 pages. `next_page` is persisted before the lease is released, so a long document resumes in later invocations. Upload, storage, queueing, extraction, and canonical ingestion do not depend on the browser remaining open.

## Transaction semantics

Amounts are signed integer cents. Bank deposits/credits are positive; supported withdrawals/debits/checks/fees are negative. Credit-card charges are negative, while explicit payments/refunds/credits are positive. Raw descriptions, source page/row, optional posting date, balance, and check number remain immutable evidence. Normalized descriptions remove only bounded reference noise.

Card payments and transfers enter bookkeeping unresolved. They are not automatically treated as deductible expenses or business income. Existing factual questions and compound reconciliation remain responsible for resolving paired observations.

## Account identity

A Business-scoped statement account uses institution, optional last four, account type, and currency. The derived account identity contains the Business ID and a SHA-256 digest. Last-four equality alone never merges a statement account with Plaid or another account.

## Validation and customer state

When beginning and ending balances are available, deterministic reconciliation checks `beginning + signed activity = ending`. A statement can be validated, partially validated, or unresolved internally. Missing institution metadata does not prevent safe transaction extraction. No missing transaction is fabricated to force a balance.

Customer states remain: queued, still processing, processed, needs help, and unreadable. A partially parsed statement preserves safely extracted rows; ambiguous rows are counted and cause attention rather than forcing review of every transaction.

## Identity and overlap

Exact document bytes deduplicate by Business + SHA-256 before extraction. Logical periods use institution, masked account, account type, currency, and period boundaries. Transaction evidence uses account facts, date, exact amount, bounded normalized description, optional running balance/check number, and an occurrence ordinal. Repeated or overlapping statement PDFs therefore reuse existing observations and canonical transactions.

Cross-source CSV/Plaid/manual overlap remains governed by existing canonical convergence and compound reconciliation. R1 does not delete observations based on merchant and amount alone. Fully automatic bidirectional statement-first versus later CSV/Plaid collapsing needs a shared strong account linkage or provider transaction identity; until then ambiguous cross-source overlap must remain unresolved rather than be silently merged.

## Security and privacy

- PDFs remain in the existing private Business-owned storage path.
- RLS protects documents, periods, and observations.
- Provider/service credentials remain server-only.
- No public URLs, full account numbers, statement text, or document bytes are stored in logs.
- Processing results contain bounded counts and status metadata, not full extracted text.

## Cost controls

Native text is the default. Work is limited by 25 pages per lease, 500 pages per PDF, 100 MiB per file, bounded queue claims, retries, exact-file suppression, immutable period/transaction identities, and extraction reuse. No monthly or low customer upload quota exists.

## Production operation

The existing `/api/internal/processing/drain` runner claims statement jobs alongside receipt jobs. Production should schedule the bounded runner once per minute and may invoke it more frequently under queue depth. Operators inspect service-only queue observability and use the guarded terminal-job recovery function; they must not mutate statement observations.

## Intentionally unsupported in R1

- password-protected PDFs
- handwritten statements
- image-only/scanned statement OCR
- arbitrary institution-specific columns not safely recognized by the generic adapter
- full account-number storage
- automatic account merging based on last four
- automatic tax/business classification
- guaranteed cross-source collapsing without strong source/account identity
- customer-facing confidence percentages

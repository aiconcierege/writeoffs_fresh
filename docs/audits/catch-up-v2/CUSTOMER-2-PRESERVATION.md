# Customer #2 — preserved certification evidence

This is the completed second manual clean-room walkthrough, not a V2 test fixture.
The full read-only capture remains in protected local files. Committed preservation
manifests contain hashes/counts rather than credentials, answers or raw documents.
Both existing customers retain staging worker exclusions.

## Captured evidence

- Original May 2026 checking statement, 24 imported transactions, business-only account.
- Four documents: the statement, two receipts on one page, the two-page Verizon
  bill, and the equipment loan statement.
- Three usable receipt extractions: Desert Print Shop ($218.40), State Farm
  ($118.75), and Verizon ($146.28). Separate receipts from the shared page retain
  their source regions; the Verizon pages remain one logical document.
- Existing matches and all prior factual, uncertainty, deferral and correction
  events remain in the capture. No answer was replayed or rewritten for V2.
- Loan payment: $450 total, $400 principal excluded from expenses, $50 interest.
- Office Depot refund: $32.10 related to the existing purchase.
- Verizon's recorded allocation is 50% for this customer. Synthetic percentage
  fixtures must not be confused with this customer's answer.
- Final captured Check-in had no current action. ATM, Emily Carter, cash deposit
  and Mark Reynolds remained unresolved in the captured financial state; absence
  of an actionable question is not proof that every financial fact is known.
- Historical statement coverage still lacks January–April and June–July.

## Financial preservation

The captured current canonical allocations (including the loan components) give:

| Dimension | Amount |
|---|---:|
| Business income | $5,360.96 |
| Expense allocations before refund | $1,548.87 |
| Expense reduction from refund | $32.10 |
| Working expenses | $1,516.77 |
| Working profit | $3,844.19 |

These are working-book amounts, not a claim that every tax/documentation issue is
complete. The 24 source transactions and 25 current working records reflect the
loan decomposition, not a duplicate imported transaction.

After the V2 migration/deployment, all 139 captured business-scoped tables/views
matched their pre-work snapshots exactly for both customers. See
`preservation-deployed.json`. Neither customer was signed in, advanced, rebuilt,
retrofit into V2, or used as mutable test data.

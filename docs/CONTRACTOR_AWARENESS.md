# Contractor / W-9 / 1099 Awareness

This bounded milestone adds contractor context to current canonical business expenses. It does not create another expense ledger, prepare or file information returns, classify workers, or store SSNs/EINs.

Contractor identity, payment association, payment-method facts, and W-9 availability are Business-scoped and append-only. Corrections create new current leaves. Year summaries intersect associations with current canonical expense records, so receipt convergence, manual/bank convergence, compound reconciliation, and corrections cannot duplicate contractor totals.

The versioned outcome is deliberately conservative. Tax year 2025 uses `contractor-awareness:v1` with its reviewed $600 attention amount. Tax year 2026 uses the append-only successor `contractor-awareness:2026:v2` and the $2,000 base threshold established by 26 U.S.C. § 6041 and final 2026 IRS information-return instructions. Unknown payment methods produce **Information incomplete**. Missing W-9 evidence produces **W-9 needed**. A supported cumulative amount with known methods and W-9 evidence may produce **Potential 1099 attention**, never a definitive filing statement. Entity status, payment nature, third-party reporting details, and the applicable complete rule set remain required before any future definitive conclusion.

W-9 support in this milestone is status and a bounded evidence note only. The receipt model is not stretched into a W-9 store, and no tax identifier is accepted. A future generic-document milestone may add a distinct Business-owned W-9 document type after privacy and retention design.

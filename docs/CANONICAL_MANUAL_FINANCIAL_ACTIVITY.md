# Canonical Manual Financial Activity

WriteOffs records customer-observed business money that connected accounts cannot see without creating a parallel ledger.

- `manual_financial_sources` preserves the immutable, customer-authored original observation.
- `manual_financial_source_events` preserves append-only corrected and removed versions. Its one current leaf identifies the current canonical bookkeeping record.
- Each active version has one canonical `bookkeeping_records` row and an exact customer-authored business-income or business-expense decision/allocation.
- Positive cents mean money received; negative cents mean money spent. Payment method remains source context and does not change that convention.
- A correction creates a new event and canonical record. It never rewrites original facts. Removal leaves all history physically present while current-record resolution excludes prior versions.
- A uniquely exact same-Business, same-date, same-currency, same-signed-cent imported observation may be customer-confirmed through the existing compound reconciliation tables. The imported anchor remains historical and the manual economic component is counted once.
- Ambiguous matches, stale state, cross-Business references, or imported anchors with dependent bookkeeping state fail closed.

Tax treatment remains separate. Recording business spending establishes the customer-supplied economic fact, but does not itself certify deductibility or select a tax category.

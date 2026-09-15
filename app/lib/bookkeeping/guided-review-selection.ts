/** Selection can include any displayed item. Bulk assertions are bank-backed only;
 * callers must reject the whole selection rather than silently skip other records. */
export function canBulkReview(rows:Array<{id:string;recordId:string|null;currentDecisionId:string|null;sourceKind:string|null;treatment:string|null}>) {
  return rows.length>0&&rows.every(row=>row.sourceKind==='financial_transaction'&&row.id!==row.recordId
    &&!!row.recordId&&!!row.currentDecisionId&&!['personal','excluded'].includes(row.treatment??''))
}

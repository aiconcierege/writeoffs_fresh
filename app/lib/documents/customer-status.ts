export type Document={id:string;original_name:string;document_class:string;state:string;reason:string|null;receipt_outcome:string|null;transaction_count:number}
export function status(d:Document){if(['pending','retryable','processing'].includes(d.state))return 'Received — Betti is reviewing it'
 if(d.state==='completed'&&d.document_class==='loan_statement')return 'Loan payment organized'
 if(d.state==='completed')return d.receipt_outcome==='matched'?'Receipt matched':d.document_class==='receipt'?'Receipt organized — Betti will look for the matching purchase':d.document_class==='transaction_file'?'Activity imported':`Statement imported${d.transaction_count>0?` • ${d.transaction_count} transactions found`:''}`
 return d.state==='needs_attention'?'Needs your help':'Could not be read'}

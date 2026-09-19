import type {BookkeepingEvaluationSnapshot} from './deterministic-evaluator'
import {receiptPurchaseEvidence} from './shared-evidence'

/** Establishes what was purchased, independently of category, use and deduction.
 * Never treats an insurer's name alone as proof, or a credit as an expense. */
export function purchaseUnderstanding(s:BookkeepingEvaluationSnapshot){
 if(s.amountCents==null||s.amountCents>=0||s.hasOpenConflictingEvidence
  ||s.movement&&(!s.movement.sourceCurrent||s.movement.pending))return null
 const text=[s.merchantName,s.description,...receiptPurchaseEvidence(s).map(r=>r.text)].join(' ').toLowerCase()
 if(/\b(?:refund|reimbursement|payout|loan|transfer|credit card payment|reversal)\b/.test(text))return null
 const provider=s.personalFinanceCategory?.detailed??''
 if(['INCOME','TRANSFER_IN','TRANSFER_OUT','LOAN_PAYMENTS'].includes(s.personalFinanceCategory?.primary??'')||s.movement?.structuralHint)return null
 if(/\b(?:print shop|printing service[s]?)\b/.test(text))return {kind:'printing' as const,confidence:.95,evidence:['purchase_direction','printing_service_description']}
 if(/\binsurance\b/.test(text)||provider==='GENERAL_SERVICES_INSURANCE')return {
  kind:'insurance' as const,confidence:.95,
  evidence:['purchase_direction',...(/\binsurance\b/.test(text)?['insurance_description']:['provider_insurance_category']),
   ...receiptPurchaseEvidence(s).map(r=>`receipt_extraction:${r.source.id}`)],
 }
 return null
}

/** A settlement-shaped bank narrative narrows the missing source fact. It does
 * not establish revenue, gross sales, fees, ownership or reconciliation. */
export function payoutUnderstanding(s:BookkeepingEvaluationSnapshot){
 const origin=s.financialOrigin,m=s.movement
 if(!origin||s.sourceKind!=='financial_transaction'||!m||!m.sourceCurrent||m.pending
  ||m.amountCents!==s.amountCents||m.financialTransactionId!==origin.transactionId
  ||m.currency!==s.currency||m.occurredOn!==s.occurredOn
  ||m.amountCents<=0||!['checking','savings'].includes(m.accountType)
  ||s.hasOpenConflictingEvidence||s.currentDecision.provenance==='user'||s.customerFactsAuthoritative
  ||s.currentDecision.bookkeepingNature||s.currentDecision.allocations.length
  ||!s.evidence?.observations.some(o=>o.fact==='financial_origin'&&o.source.kind==='financial_transaction'&&o.source.provider===origin.kind&&o.source.id===origin.transactionId&&o.source.basis==='observed'))return null
 const text=(s.description??'').normalize('NFKC').toUpperCase().replace(/[^A-Z0-9]+/g,' ').trim()
 if(/\b(?:INSURANCE|CLAIM|LOAN|REFUND|REIMBURSEMENT|REVERSAL|BENEFIT|DIVIDEND)\b/.test(text))return null
 const match=/^([A-Z][A-Z0-9 ]{1,35}) (?:PAYOUT|MERCHANT SETTLEMENT)$/.exec(text)
 const invoice=/^(?:ZELLE|ACH|BANK TRANSFER) FROM ([A-Z][A-Z0-9 ]{1,35}) (?:INV|INVOICE) ([A-Z0-9]{1,20})$/.exec(text)
 const primary=s.personalFinanceCategory?.primary
 const detailed=s.personalFinanceCategory?.detailed
 if(detailed&&!['INCOME_OTHER_INCOME','TRANSFER_IN_OTHER_TRANSFER_IN'].includes(detailed))return null
 if((!match&&!invoice)||primary&&!['INCOME','TRANSFER_IN'].includes(primary))return null
 return {kind:'customer_payment_candidate' as const,confidence:.8,counterparty:(match??invoice)![1],
  ...(invoice?{invoiceReference:invoice[2]}:{}),
  basis:'inferred' as const,sourceId:origin.transactionId,evidenceFingerprint:s.evidence.fingerprint}
}

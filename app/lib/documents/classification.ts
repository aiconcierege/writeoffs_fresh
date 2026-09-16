import {parseReceiptText} from './receipt-text'
export type DocumentClass='receipt'|'bank_statement'|'card_statement'|'transaction_file'|'unknown'
export function classifyDocumentText(text:string):DocumentClass{
  const header=text.split(/account activity|transaction(?:s| details)|date\s+description/i)[0].slice(0,12000)
  const statement=/statement\s+period|account\s+summary|previous\s+balance|beginning\s+balance/i.test(header)
    && /account|cardmember|bank|credit union|issuer/i.test(header)
  if(statement){if(/credit[ -]?card\s+statement|cardmember|payment\s+due|minimum\s+payment/i.test(header))return 'card_statement'
    if(/checking|savings|bank\s+statement|credit union|bank/i.test(header))return 'bank_statement';return 'unknown'}
  const receipt=parseReceiptText(text)
  if(receipt.reason)return 'receipt' // retain explicit composite/ambiguity help in receipt processor
  return receipt.merchant&&receipt.occurredOn&&receipt.totalAmountCents?'receipt':'unknown'
}

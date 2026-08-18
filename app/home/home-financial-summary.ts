export const HOME_FINANCIAL_STATEMENT_LINES = [
  'Business income',
  'Business expenses',
  'Business profit',
] as const

export type HomeFinancialStatementLine =
  (typeof HOME_FINANCIAL_STATEMENT_LINES)[number]

export const HOME_FINANCIAL_STATEMENT_LINES = [
  'Business income',
  'Business expenses',
  'Estimated business profit',
] as const

export type HomeFinancialStatementLine =
  (typeof HOME_FINANCIAL_STATEMENT_LINES)[number]

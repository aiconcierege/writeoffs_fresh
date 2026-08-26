/** Canonical customer destinations. Query parameters select a workflow; they do not create routes. */
export const customerRoutes = {
  home: '/home',
  getStarted: '/get-started',
  transactions: '/transactions',
  uploadReceipts: '/receipts',
  moneyReceived: '/money?kind=received',
  moneySpent: '/money?kind=spent',
  mileage: '/mileage',
  invoices: '/invoices',
  questions: '/questions',
  reports: '/reports',
  taxTime: '/reports/tax-time',
  settings: '/settings',
  bankConnections: '/settings/banking',
  csvImport: '/import',
} as const

export const dynamicCustomerRoutes = {
  invoiceDetail: '/invoices/[id]',
  invoicePrint: '/invoices/[id]/print',
  transactionDetail: '/transactions/[id]',
} as const

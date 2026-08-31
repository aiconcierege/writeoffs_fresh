import { describe, expect, it } from 'vitest'
import { deriveHomeRecentActivity } from '../../app/lib/home/recently-handled'
import type { TransactionReadRow } from '../../app/lib/bookkeeping/transaction-read-model'

function row(overrides: Partial<TransactionReadRow>): TransactionReadRow {
  return {
    id: 'transaction-1', sourceModel: 'canonical', date: '2026-08-20', vendor: 'Office Depot',
    description: null, amount: -25, amountCents: -2500, currency: 'USD', category_key: null,
    has_receipt: false, receipt_waived: false, treatmentLabel: 'Business', decisionReason: null,
    decisionProvenance: 'system', correctionCount: 0, recordId: 'record-1', currentDecisionId: 'decision-1',
    bookkeepingNature: 'expense', treatment: 'business',
    history: [{ id: 'decision-1', summary: 'Business', explanation: null, createdAt: '2026-08-21T12:00:00.000Z' }],
    evidenceLinks: [], receiptLost: false, sourceLabel: null, sourceKind: 'financial_transaction', contractorName: null,
    ...overrides,
  }
}

describe('Home recent records', () => {
  it('shows recent relevant transactions with truthful plain-language states', () => {
    const activity = deriveHomeRecentActivity([
      row({ id: 'business', date: '2026-08-24' }),
      row({ id: 'mixed', date: '2026-08-23', treatment: 'mixed_use' }),
      row({ id: 'income', date: '2026-08-22', bookkeepingNature: 'income', amountCents: 9000 }),
      row({ id: 'unresolved', date: '2026-08-21', treatment: 'unresolved' }),
      row({ id: 'personal', date: '2026-08-25', treatment: 'personal' }),
      row({ id: 'legacy', date: '2026-08-26', sourceModel: 'legacy' }),
    ])
    expect(activity.transactions.map(item => item.status)).toEqual([
      'Business', 'Business + personal', 'Income', 'Still working on it',
    ])
    expect(activity.transactions.map(item=>item.id)).not.toContain('personal')
  })

  it('derives only real receipt links and does not pad either list', () => {
    const activity=deriveHomeRecentActivity([row({id:'matched',evidenceLinks:[{id:'link',receiptId:'receipt',attachedAt:'2026-08-30T12:00:00.000Z'}]})])
    expect(activity.transactions).toHaveLength(1)
    expect(activity.receiptMatches).toEqual([{id:'link',merchant:'Office Depot',date:'2026-08-30',amountCents:-2500,href:'/transactions/matched'}])
    expect(deriveHomeRecentActivity([row({id:'no-match'})]).receiptMatches).toEqual([])
  })

  it('caps compact lists at five without fabricating rows',()=>{
    const activity=deriveHomeRecentActivity(Array.from({length:7},(_,index)=>row({id:`${index}`,date:`2026-08-${String(10+index).padStart(2,'0')}`})))
    expect(activity.transactions).toHaveLength(5)
    expect(activity.receiptMatches).toHaveLength(0)
  })
})

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const component=readFileSync('app/components/BankConnect.tsx','utf8')
const banking=readFileSync('app/settings/banking/page.tsx','utf8')
const started=readFileSync('app/get-started/page.tsx','utf8')

describe('customer account-use settings',()=>{
  it('loads only the canonical current account-use projection',()=>{
    expect(banking).toContain("from('current_financial_account_use')")
    expect(started).toContain("from('current_financial_account_use')")
    expect(banking).toContain('accountUses={accountUses ?? []}')
    expect(started).toContain('accountUses={accountUses??[]}')
    expect(`${banking}\n${started}\n${component}`).not.toContain('expected_financial_account_use')
  })

  it('shows the approved plain-language choices and saved/unknown states',()=>{
    expect(component).toContain('How do you use this account?')
    expect(component).toContain("business_only: 'Business only'")
    expect(component).toContain("business_and_personal: 'Business and personal'")
    expect(component).toContain('Current choice:')
    expect(component).toContain('Not chosen yet')
    expect(component).not.toMatch(/percentage|accounting categor|deductib/i)
  })

  it('uses the canonical authenticated endpoint with loading, success, and error states',()=>{
    expect(component).toContain('await persistAccountUse(accountId,')
    expect(component).toContain('requestId: crypto.randomUUID()')
    expect(component).toContain("message: 'Saving…'")
    expect(component).toContain("message: 'Saved.'")
    expect(component).toContain('role="alert"')
    expect(component).toContain('router.refresh()')
  })

  it('uses one-column mobile controls that expand without shrinking tap targets',()=>{
    expect(component).toContain('grid gap-2 sm:grid-cols-2')
    expect(component).toContain('min-h-12')
    expect(component).toContain('<fieldset')
    expect(component).toContain('type="radio"')
  })

  it('keeps existing account-use controls available when new connections are disabled',()=>{
    expect(component).not.toContain('if (!input.enabled) return')
    expect(component).toContain('You can still choose how you use accounts already connected.')
    expect(component).toContain('{input.enabled && <div className="flex gap-2">')
  })
})

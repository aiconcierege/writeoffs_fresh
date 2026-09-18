import * as React from 'react'
import {createRequire} from 'node:module'
const {renderToStaticMarkup}=createRequire(import.meta.url)('react-dom/server') as {renderToStaticMarkup:(node:React.ReactNode)=>string}
import {describe,it,expect,vi} from 'vitest'
import {SpecialTransactionFlow} from '../../app/components/SpecialTransactionFlow'
import type {SpecialWork} from '../../app/lib/bookkeeping/special-transactions'
vi.stubGlobal('React',React)
vi.mock('next/navigation',()=>({useRouter:()=>({refresh:vi.fn()})}))
vi.mock('../../app/documents/DocumentIntake',()=>({DocumentIntake:({guided}:{guided:boolean})=>React.createElement('div',{'data-guided-upload':guided})}))
const base:SpecialWork={recordId:'record',decisionId:'decision',nature:'refund',treatment:'unresolved',amountCents:3000,kind:'refund',lastAction:null,candidates:[],linked:false}
const view=(work:Partial<SpecialWork>)=>renderToStaticMarkup(React.createElement(SpecialTransactionFlow,{work:{...base,...work},returnTo:'/home',embedded:true}))
describe('one material special-transaction question at a time',()=>{
 it('asks refund nature before asking for the related purchase',()=>{const html=view({});expect(html).toContain('Was this money returned');expect(html).not.toContain('Which purchase was returned?');expect(html.match(/<h1/g)).toHaveLength(1)})
 it('does not re-ask refund nature after the canonical merchant-return answer',()=>{const html=view({lastAction:'merchant_return'});expect(html).toContain('Which purchase was returned?');expect(html).not.toContain('Was this money returned');expect(html.match(/<h1/g)).toHaveLength(1)})
 it('requests reimbursement evidence without pretending it is a merchant return',()=>{const html=view({lastAction:'reimbursement'});expect(html).toContain('Send me the reimbursement records.');expect(html).not.toContain('Which purchase was returned?');expect(html).toContain('data-guided-upload="true"')})
 it('uses contextual unified upload for a loan instead of purchase receipts',()=>{const html=view({kind:'loan',nature:'loan_principal_payment'});expect(html).toContain('Send me the loan statement.');expect(html).toContain('data-guided-upload="true"');expect(html).not.toContain('Which purchase was returned?')})
})

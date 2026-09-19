import * as React from 'react'
import {createRequire} from 'node:module'
import {describe,it,expect,vi} from 'vitest'
import {QuestionFlow} from '../../app/questions/QuestionFlow'
import type {CustomerQuestion} from '../../app/lib/bookkeeping/customer-questions'
const {renderToStaticMarkup}=createRequire(import.meta.url)('react-dom/server') as {renderToStaticMarkup:(node:React.ReactNode)=>string}
vi.stubGlobal('React',React)
vi.mock('next/navigation',()=>({useRouter:()=>({refresh:vi.fn()})}))
const base:CustomerQuestion={id:'q',version:'v',recordId:'r',source:'bookkeeping',kind:'transaction_type',
 prompt:'What was this money for?',understanding:'I can see money came in, but I can’t tell where it came from.',
 transaction:{merchant:'A bank credit',date:'2026-05-11',amountCents:73544,currency:'USD'},
 options:[{id:'earned_money',label:'Payment from a customer'},{id:'borrowed_money',label:'Loan proceeds'}]}
describe('progressive confirmation presentation',()=>{
 it('retains broad factual options for genuine ambiguity',()=>{
  const html=renderToStaticMarkup(React.createElement(QuestionFlow,{initialQuestions:[base],guided:true}))
  expect(html).toContain('Loan proceeds');expect(html).toContain('Payment from a customer');expect(html).toContain(base.understanding!)
 })
 it('states the canonical hypothesis before asking for confirmation',()=>{
  const q={...base,prompt:'Is that right?',understanding:'This looks like customer payments from a processor.',confirmation:{optionId:'earned_money',label:'Yes, that’s right'}}
  const html=renderToStaticMarkup(React.createElement(QuestionFlow,{initialQuestions:[q],guided:true}))
  expect(html).toContain(q.understanding);expect(html).toContain('Yes, that’s right');expect(html).toContain('No, something else')
  expect(html).not.toContain('Loan proceeds');expect(html).not.toContain('I’m not sure')
  expect(html).toContain('I’ll come back to this');expect(html.match(/<h1/g)).toHaveLength(1)
 })
})

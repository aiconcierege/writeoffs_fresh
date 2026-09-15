import { describe, expect, it } from 'vitest'
import { questionVersionKey, reconcileQuestionSession } from '../../app/questions/question-session'
import type { CustomerQuestion } from '../../app/lib/bookkeeping/customer-questions'
const question=(id:string,version='v1'):CustomerQuestion=>({id,version,kind:'meal_relationship',prompt:'Who was the meal with?',transaction:{merchant:'Test cafe',amountCents:-433,currency:'USD',date:'2026-05-11'}})
describe('active Check-in queue',()=>{
 it('preserves pending order and appends discoveries even when server priority changes',()=>{
  const a=question('a'),b=question('b'),c=question('c')
  expect(reconcileQuestionSession([a,b],[c,b,a],new Set()).map(q=>q.id)).toEqual(['a','b','c'])
 })
 it('does not reintroduce an acknowledged immutable version from a stale read',()=>{
  const a=question('a'),b=question('b')
  expect(reconcileQuestionSession([a,b],[a,b],new Set([questionVersionKey(a)]))).toEqual([b])
 })
 it('accepts a genuinely changed question and removes resolved questions',()=>{
  const a=question('a'),b=question('b'),updated=question('b','v2')
  expect(reconcileQuestionSession([a,b],[updated],new Set([questionVersionKey(b)]))).toEqual([updated])
 })
 it('keeps a newly needed follow-up with its transaction while other discoveries append',()=>{
  const pending=question('pending'),discovered=question('new'),followUp={...question('follow-up'),recordId:'record-a'}
  expect(reconcileQuestionSession([pending],[discovered,pending,followUp],new Set(),'record-a').map(q=>q.id)).toEqual(['follow-up','pending','new'])
 })
 it('deduplicates a repeated queue entry',()=>{
  const a=question('a')
  expect(reconcileQuestionSession([], [a,a], new Set())).toEqual([a])
 })
})

'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { BettiIllustration } from '../components/BettiIllustration'
import {
  parsePositiveDollarCents,
  type CustomerQuestion,
} from '../lib/bookkeeping/customer-questions'

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

export function QuestionFlow({ initialQuestions,range,recordId,embedded=false,onComplete }: { initialQuestions: CustomerQuestion[];range?:{start:string;end:string};recordId?:string;embedded?:boolean;onComplete?:(result:{unresolvedCount:number})=>void }) {
  const [questions, setQuestions] = useState(initialQuestions)
  const [answered, setAnswered] = useState(0)
  const [purpose, setPurpose] = useState('')
  const [mealRelationship, setMealRelationship] = useState('')
  const [mixedAmount, setMixedAmount] = useState('')
  const [mixedMode,setMixedMode]=useState<'dollars'|'percentage'>('dollars')
  const [mixedPercentage,setMixedPercentage]=useState('')
  const [showAmount, setShowAmount] = useState(false)
  const [factValue, setFactValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [unresolvedKept, setUnresolvedKept] = useState(0)
  const heading = useRef<HTMLHeadingElement>(null)
  const deferredInThisSession = useRef(new Set<string>())
  const mixedOnly=useRef(initialQuestions.length>0&&initialQuestions.every(item=>item.kind==='mixed_use'))
  const total = answered + questions.length
  const question = questions[0]

  async function submit(command: Record<string, unknown>) {
    if (!question || busy) return
    setBusy(true)
    setError('')
    try {
      const response = await fetch(`/api/bookkeeping/questions/${question.id}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'if-match': question.version },
        body: JSON.stringify(command),
      })
      const result = await response.json() as { error?: string }
      if (!response.ok) throw new Error(result.error || 'Unable to save that answer.')
      if (command.action === 'defer') deferredInThisSession.current.add(question.id)
      const queueResponse = await fetch('/api/bookkeeping/questions', { cache: 'no-store' })
      const queueResult = await queueResponse.json() as { questions?: CustomerQuestion[]; error?: string }
      if (!queueResponse.ok || !queueResult.questions) {
        throw new Error(queueResult.error || 'Unable to load the next question.')
      }
      setAnswered((value) => value + 1)
      setQuestions(queueResult.questions.filter((candidate) => (!mixedOnly.current||candidate.kind==='mixed_use')
        &&!deferredInThisSession.current.has(candidate.id)
        &&(!recordId||candidate.recordId===recordId)
        &&(!range||(candidate.transaction.date!=null&&candidate.transaction.date>=range.start&&candidate.transaction.date<=range.end))))
      setPurpose('')
      setMealRelationship('')
      setMixedAmount('')
      setMixedMode('dollars')
      setMixedPercentage('')
      setShowAmount(false)
      setFactValue('')
      requestAnimationFrame(() => heading.current?.focus())
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save that answer.')
    } finally {
      setBusy(false)
    }
  }

  function keepUnresolvedAndContinue() {
    if (!question || question.kind !== 'percentage') return
    setAnswered((value) => value + 1)
    setUnresolvedKept((value) => value + 1)
    setQuestions((value) => value.slice(1))
    setFactValue('')
    requestAnimationFrame(() => heading.current?.focus())
  }

  useEffect(()=>{if(!question&&embedded)onComplete?.({unresolvedCount:unresolvedKept})},[question,embedded,onComplete,unresolvedKept])

  if (!question) {
    if(embedded)return <div className="weekly-question-complete" role="status"><strong>{unresolvedKept>0?'We can keep going.':'That’s everything I needed.'}</strong><p>{unresolvedKept>0?`I kept ${unresolvedKept} ${unresolvedKept===1?'item':'items'} on your list for more information.`:'I’ve saved your answers with this week’s records.'}</p></div>
    return (
      <main className="app-page -mx-4 -mb-10 sm:-mx-6 lg:-mx-8"><section className="question-caught-up mx-auto flex min-h-[72vh] max-w-2xl flex-col items-center justify-center px-6 py-16 text-center">
          <BettiIllustration state="caught-up" className="question-betti-caught" priority sizes="(max-width: 639px) 13rem, 18rem" />
          <h1 ref={heading} tabIndex={-1} className="text-4xl font-semibold tracking-[-.045em] text-[#17211d]">You’re all caught up.</h1>
          <p className="mt-4 text-[#59665f]">WriteOffs will keep working in the background.</p>
          <Link href="/home" className="btn btn-primary mt-8">Back to Home</Link>
        </section>
      </main>
    )
  }

  const amount = question.transaction.amountCents == null
    ? null
    : money.format(Math.abs(question.transaction.amountCents) / 100)
  const enteredCents = parsePositiveDollarCents(mixedAmount)
  const transactionTotalCents = Math.abs(question.transaction.amountCents??0)

  const conversation=<><div className="flex items-center justify-between text-base font-medium text-[#65736b]"><p>Question {answered + 1} of {total}</p>{!embedded&&<Link href="/home" className="text-[#243186]">Finish later</Link>}</div>
      <section className={`question-conversation surface relative mt-4 overflow-visible p-5 sm:p-8${embedded?' weekly-question-embedded':''}`}>
        {!embedded&&<BettiIllustration state="question" className="question-betti" priority sizes="(max-width: 639px) 7rem, 10rem" />}
        <div className="surface-subtle p-4 text-sm">
          <div className="font-semibold">{question.transaction.merchant}</div>
          <div className="mt-1 flex flex-wrap gap-x-4 text-muted">
            {amount && <span>{amount}</span>}
            {question.transaction.date && <span>{question.transaction.date}</span>}
          </div>
        </div>
        {question.evidence&&<a href={question.evidence.receiptUrl} target="_blank" rel="noreferrer" className="mt-4 flex min-h-12 items-center justify-between rounded-xl border border-[#dce3de] bg-white px-4 text-sm font-semibold text-[#243186]"><span>View supporting receipt</span><span aria-hidden="true">↗</span></a>}
        <h1 ref={heading} tabIndex={-1} className="mt-8 text-[1.75rem] font-semibold leading-tight tracking-[-.035em] text-[#17211d] outline-none sm:text-3xl">
          {showAmount ? `How much of the ${amount??'total'} was for your business?` : question.prompt}
        </h1>
        {question.guidance && !showAmount && <p className="mt-2 text-muted">{question.guidance}</p>}
        {showAmount && <p className="mt-2 text-muted">Enter the business dollars. I’ll handle the allocation.</p>}

        <div className="mt-7 grid gap-3">
          {question.kind === 'business_use' && <>
            <Action onClick={() => submit({ action: 'business_use', use: 'business' })} busy={busy}>Yes, business</Action>
            <Action onClick={() => submit({ action: 'business_use', use: 'personal' })} busy={busy}>No, personal</Action>
            <Action onClick={() => submit({ action: 'business_use', use: 'mixed' })} busy={busy}>Partly</Action>
            <Action onClick={() => submit({ action: 'not_sure' })} busy={busy}>Not sure</Action>
          </>}
          {question.kind === 'business_purpose' && <>
            <label htmlFor="purpose" className="sr-only">What was this purchase for?</label>
            <textarea id="purpose" value={purpose} onChange={(event) => setPurpose(event.target.value)}
              maxLength={1000} rows={4} className="w-full rounded-lg border border-slate-300 p-3"
              placeholder="For example, lunch with a client" />
            <Action onClick={() => submit({ action: 'business_purpose', businessPurpose: purpose })} busy={busy || !purpose.trim()}>Continue</Action>
            <Action onClick={() => submit({ action: 'not_sure' })} busy={busy}>Not sure</Action>
          </>}
          {question.kind === 'meal_relationship' && <>
            <label htmlFor="meal-relationship" className="sr-only">Who was the meal with?</label>
            <textarea id="meal-relationship" value={mealRelationship}
              onChange={(event) => setMealRelationship(event.target.value)} maxLength={1000} rows={4}
              className="w-full rounded-lg border border-slate-300 p-3"
              placeholder="For example, Sarah Jones, client; Luis Garcia, prospective customer" />
            <Action onClick={() => submit({ action: 'meal_relationship', attendeeRelationship: mealRelationship })}
              busy={busy || !mealRelationship.trim()}>Continue</Action>
            <Action onClick={() => submit({ action: 'defer' })} busy={busy}>I’ll add this later</Action>
          </>}
          {question.kind === 'mixed_use' && !showAmount && <>
            <Action onClick={() => submit({ action: 'mixed_all_business' })} busy={busy}>No, all business</Action>
            <Action onClick={() => setShowAmount(true)} busy={busy}>Yes, partly personal</Action>
            <Action onClick={() => submit({ action: 'not_sure' })} busy={busy}>Not sure</Action>
          </>}
          {question.kind === 'mixed_use' && showAmount && <>
            <div className="weekly-mixed-input-modes" role="group" aria-label="How to enter the business portion">
              <button type="button" className={mixedMode==='dollars'?'is-active':''} onClick={()=>setMixedMode('dollars')}>Business dollars</button>
              <button type="button" className={mixedMode==='percentage'?'is-active':''} onClick={()=>setMixedMode('percentage')}>Business percentage</button>
            </div>
            {mixedMode==='dollars'?<>
            <label htmlFor="mixed-amount" className="text-base font-medium">Business amount</label>
            <div className="flex items-center rounded-lg border border-slate-300 px-3 focus-within:ring-2">
              <span aria-hidden="true">$</span>
              <input id="mixed-amount" inputMode="decimal" value={mixedAmount}
                onChange={(event) => setMixedAmount(event.target.value)} className="w-full p-3 outline-none"
                placeholder="0.00" />
            </div>
            <Action onClick={() => enteredCents != null && enteredCents<transactionTotalCents && submit({
              action: 'mixed_business_amount', businessAmountCents: enteredCents,
            })} busy={busy || enteredCents == null || enteredCents>=transactionTotalCents}>Continue</Action>
            </>:<>
            <label htmlFor="mixed-percentage" className="text-base font-medium">Business percentage</label>
            <div className="flex items-center rounded-lg border border-slate-300 px-3 focus-within:ring-2">
              <input id="mixed-percentage" inputMode="decimal" value={mixedPercentage}
                onChange={(event)=>setMixedPercentage(event.target.value)} className="w-full p-3 outline-none" placeholder="40"/>
              <span aria-hidden="true">%</span>
            </div>
            <p className="text-muted">I’ll turn that into an exact dollar split.</p>
            <Action onClick={()=>submit({action:'mixed_business_percentage',businessPercentage:mixedPercentage})}
              busy={busy||!/^(100(?:\.0{1,2})?|(?:[0-9]|[1-9][0-9])(?:\.[0-9]{1,2})?)$/.test(mixedPercentage)}>Continue</Action>
            </>}
            <Action onClick={() => submit({ action: 'not_sure' })} busy={busy}>Not sure</Action>
          </>}
          {question.kind === 'factual_choice' && question.options?.map((option) =>
            <Action key={option.id} onClick={() => submit({ action: 'factual_choice', optionId: option.id })} busy={busy}>
              {option.label}
            </Action>
          )}
          {question.kind==='transaction_type'&&question.options?.map(option=><Action key={option.id}
            onClick={()=>submit({action:'transaction_type',activity:option.id})} busy={busy}>{option.label}</Action>)}
          {question.kind === 'percentage' && embedded && <div className="weekly-question-blocked" role="status">
            <strong>I still need a little more information about this item.</strong>
            <p>I’ll keep it on your list while we finish the rest of your review.</p>
            <Action onClick={keepUnresolvedAndContinue} busy={busy}>Keep this on my list and continue</Action>
          </div>}
          {question.kind === 'percentage' && !embedded && <>
            <label htmlFor="percentage" className="text-sm font-medium">Business use percentage</label>
            <div className="flex items-center rounded-lg border border-slate-300 px-3 focus-within:ring-2">
              <input id="percentage" inputMode="numeric" value={factValue}
                onChange={(event) => setFactValue(event.target.value)} className="w-full p-3 outline-none"
                placeholder="70" /><span aria-hidden="true">%</span>
            </div>
            <Action onClick={() => submit({ action: 'deduction_fact', value: Number(factValue) })}
              busy={busy || !Number.isInteger(Number(factValue)) || Number(factValue) < 1 || Number(factValue) > 100}>Continue</Action>
          </>}
          {question.kind === 'yes_no' && <>
            <Action onClick={() => submit({ action: 'deduction_fact', value: true })} busy={busy}>Yes</Action>
            <Action onClick={() => submit({ action: 'deduction_fact', value: false })} busy={busy}>No</Action>
          </>}
          {question.kind === 'integer' && <>
            <label htmlFor="whole-number" className="text-sm font-medium">Whole number</label>
            <input id="whole-number" inputMode="numeric" value={factValue}
              onChange={(event) => setFactValue(event.target.value)} className="field" />
            <Action onClick={() => submit({ action: 'deduction_fact', value: Number(factValue) })}
              busy={busy || !Number.isInteger(Number(factValue)) || Number(factValue) < 1}>Continue</Action>
          </>}
          {question.kind === 'date' && <>
            <label htmlFor="fact-date" className="text-sm font-medium">Date</label>
            <input id="fact-date" type="date" value={factValue}
              onChange={(event) => setFactValue(event.target.value)} className="field" />
            <Action onClick={() => submit({ action: 'deduction_fact', value: factValue })}
              busy={busy || !/^\d{4}-\d{2}-\d{2}$/.test(factValue)}>Continue</Action>
          </>}
        </div>
        {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}
        {!(embedded && question.kind === 'percentage') && <button type="button" disabled={busy} onClick={() => submit({ action: 'defer' })}
          className="mt-6 w-full text-sm font-medium text-muted underline disabled:opacity-50">
          Do this later
        </button>}
      </section></>
  if(embedded)return <div className="weekly-question-flow">{conversation}</div>
  return <main className="app-page -mx-4 -mb-10 px-4 sm:-mx-6 sm:px-6 lg:-mx-8"><div className="mx-auto max-w-2xl py-6 sm:py-10">{conversation}</div></main>
}

function Action(props: { children: React.ReactNode; onClick: () => void; busy: boolean }) {
  return <button type="button" disabled={props.busy} onClick={props.onClick}
    className="btn btn-secondary min-h-14 w-full justify-center text-base disabled:opacity-50">{props.children}</button>
}

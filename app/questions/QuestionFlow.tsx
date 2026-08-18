'use client'

import Link from 'next/link'
import { useRef, useState } from 'react'
import {
  parsePositiveDollarCents,
  type CustomerQuestion,
} from '../lib/bookkeeping/customer-questions'

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

export function QuestionFlow({ initialQuestions }: { initialQuestions: CustomerQuestion[] }) {
  const [questions, setQuestions] = useState(initialQuestions)
  const [answered, setAnswered] = useState(0)
  const [purpose, setPurpose] = useState('')
  const [personalAmount, setPersonalAmount] = useState('')
  const [showAmount, setShowAmount] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const heading = useRef<HTMLHeadingElement>(null)
  const deferredInThisSession = useRef(new Set<string>())
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
      setQuestions(queueResult.questions.filter(
        (candidate) => !deferredInThisSession.current.has(candidate.id)
      ))
      setPurpose('')
      setPersonalAmount('')
      setShowAmount(false)
      requestAnimationFrame(() => heading.current?.focus())
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save that answer.')
    } finally {
      setBusy(false)
    }
  }

  if (!question) {
    return (
      <main className="mx-auto flex min-h-[70vh] max-w-xl items-center px-6 py-16">
        <section className="card w-full p-8 text-center">
          <h1 ref={heading} tabIndex={-1} className="text-3xl font-bold">You’re all caught up.</h1>
          <p className="mt-3 text-muted">WriteOffs will keep working in the background.</p>
          <Link href="/dashboard" className="btn btn-accent mt-8 inline-flex">Back to Home</Link>
        </section>
      </main>
    )
  }

  const amount = question.transaction.amountCents == null
    ? null
    : money.format(Math.abs(question.transaction.amountCents) / 100)
  const personalCents = parsePositiveDollarCents(personalAmount)

  return (
    <main className="mx-auto max-w-xl px-6 py-12">
      <p className="text-sm font-medium text-muted">Question {answered + 1} of {total}</p>
      <section className="card mt-3 p-6 sm:p-8">
        <div className="rounded-lg bg-slate-50 p-4 text-sm">
          <div className="font-semibold">{question.transaction.merchant}</div>
          <div className="mt-1 flex flex-wrap gap-x-4 text-muted">
            {amount && <span>{amount}</span>}
            {question.transaction.date && <span>{question.transaction.date}</span>}
          </div>
        </div>
        <h1 ref={heading} tabIndex={-1} className="mt-7 text-2xl font-bold outline-none">
          {showAmount ? 'About how much was personal?' : question.prompt}
        </h1>
        {question.guidance && !showAmount && <p className="mt-2 text-muted">{question.guidance}</p>}
        {showAmount && <p className="mt-2 text-muted">Enter a dollar amount. WriteOffs will calculate the business portion.</p>}

        <div className="mt-7 grid gap-3">
          {question.kind === 'business_use' && <>
            <Action onClick={() => submit({ action: 'business_use', use: 'business' })} busy={busy}>Yes, business</Action>
            <Action onClick={() => submit({ action: 'business_use', use: 'personal' })} busy={busy}>No, personal</Action>
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
          {question.kind === 'mixed_use' && !showAmount && <>
            <Action onClick={() => submit({ action: 'mixed_all_business' })} busy={busy}>No, all business</Action>
            <Action onClick={() => setShowAmount(true)} busy={busy}>Yes, partly personal</Action>
            <Action onClick={() => submit({ action: 'not_sure' })} busy={busy}>Not sure</Action>
          </>}
          {question.kind === 'mixed_use' && showAmount && <>
            <label htmlFor="personal-amount" className="text-sm font-medium">Personal amount</label>
            <div className="flex items-center rounded-lg border border-slate-300 px-3 focus-within:ring-2">
              <span aria-hidden="true">$</span>
              <input id="personal-amount" inputMode="decimal" value={personalAmount}
                onChange={(event) => setPersonalAmount(event.target.value)} className="w-full p-3 outline-none"
                placeholder="0.00" />
            </div>
            <Action onClick={() => personalCents != null && submit({
              action: 'mixed_personal_amount', personalAmountCents: personalCents,
            })} busy={busy || personalCents == null}>Continue</Action>
            <Action onClick={() => submit({ action: 'not_sure' })} busy={busy}>Not sure</Action>
          </>}
          {question.kind === 'factual_choice' && question.options?.map((option) =>
            <Action key={option.id} onClick={() => submit({ action: 'factual_choice', optionId: option.id })} busy={busy}>
              {option.label}
            </Action>
          )}
        </div>
        {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}
        <button type="button" disabled={busy} onClick={() => submit({ action: 'defer' })}
          className="mt-6 w-full text-sm font-medium text-muted underline disabled:opacity-50">
          Do this later
        </button>
      </section>
    </main>
  )
}

function Action(props: { children: React.ReactNode; onClick: () => void; busy: boolean }) {
  return <button type="button" disabled={props.busy} onClick={props.onClick}
    className="btn btn-secondary w-full justify-center py-3 disabled:opacity-50">{props.children}</button>
}

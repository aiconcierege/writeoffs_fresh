'use client'
import type {GuidedWorkProjection} from '../lib/bookkeeping/guided-work-projection'
import type {HomeCommand} from '../lib/home/command-center'

import Link from 'next/link'
import {useRouter} from 'next/navigation'
import { safeReturnTo, returnLabel } from '../lib/navigation-context'
import { useEffect, useRef, useState } from 'react'
import { questionVersionKey, reconcileQuestionSession } from './question-session'
import { BettiIllustration } from '../components/BettiIllustration'
import { parsePositiveDollarCents } from '../lib/bookkeeping/question-input'
import type { CustomerQuestion } from '../lib/bookkeeping/customer-questions'

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
const customerDate = new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'})

export function QuestionFlow({ initialQuestions,range,recordId,embedded=false,onComplete,experience='questions',ongoingFrom,otherWorkWaiting=false,returnTo:origin='/home',initialWorkMessage,initialActionCount,guided=false,onGuidedAnswer,onGuidedRefresh,onGuidedPending }: {onGuidedPending?:(pending:boolean)=>void;guided?:boolean;onGuidedAnswer?:(deferred:boolean,message?:string,work?:GuidedWorkProjection)=>Promise<void>;onGuidedRefresh?:()=>Promise<void>;initialWorkMessage?:HomeCommand;initialActionCount?:number;returnTo?:string;ongoingFrom?:string;otherWorkWaiting?:boolean; initialQuestions: CustomerQuestion[];range?:{start:string;end:string};recordId?:string;embedded?:boolean;onComplete?:(result:{unresolvedCount:number})=>void;experience?:'questions'|'check-in' }) {
  const router=useRouter()
  const returnTo=safeReturnTo(origin,'/home')
  const [workMessage,setWorkMessage]=useState(initialWorkMessage)
  const [actionCount,setActionCount]=useState(initialActionCount)
  const [success,setSuccess]=useState('Got it.')
  const [questions, setQuestions] = useState(initialQuestions)
  const [deferredCount,setDeferredCount]=useState(0)
  const [answered, setAnswered] = useState(0)
  const [purpose, setPurpose] = useState('')
  const [otherActivity, setOtherActivity] = useState(false)
  const [showAlternatives,setShowAlternatives]=useState(false)
  const [mealRelationship, setMealRelationship] = useState('')
  const [mixedAmount, setMixedAmount] = useState('')
  const [mixedMode,setMixedMode]=useState<'dollars'|'percentage'>('dollars')
  const [mixedPercentage,setMixedPercentage]=useState('')
  const [showAmount, setShowAmount] = useState(false)
  const [factValue, setFactValue] = useState('')
  const [submitting, setBusy] = useState(false)
  const [queueNeedsReload, setQueueNeedsReload] = useState(false)
  const submitLock = useRef(false)
  const followUpRecord=useRef<string|null>(null)
  const completedVersions = useRef(new Set<string>())
  const busy = submitting || queueNeedsReload
  const [error, setError] = useState('')
  const [unresolvedKept, setUnresolvedKept] = useState(0)
  const heading = useRef<HTMLHeadingElement>(null)
  const deferredInThisSession = useRef(new Set<string>())
  const mixedOnly=useRef(experience!=='check-in'&&initialQuestions.length>0
    &&initialQuestions.every(item=>item.kind==='mixed_use'))
  const total = answered + questions.length
  const question = questions[0]

  function currentQuestions(queue:CustomerQuestion[]){return queue.filter((candidate) =>
    (!mixedOnly.current||candidate.kind==='mixed_use')&&!deferredInThisSession.current.has(candidate.id)
    &&(!recordId||candidate.recordId===recordId)
    &&(!ongoingFrom||candidate.transaction.date==null||candidate.transaction.date>=ongoingFrom)
    &&(!range||(candidate.transaction.date!=null&&candidate.transaction.date>=range.start&&candidate.transaction.date<=range.end))) }

  async function reloadAuthoritativeQueue(){
    setQueueNeedsReload(true)
    const reconciled = await fetch('/api/bookkeeping/questions/reconcile', { method: 'POST', signal: AbortSignal.timeout(15_000) })
    if (!reconciled.ok) throw new Error('Questions could not be refreshed. Please try again.')
    const queueResponse=await fetch('/api/bookkeeping/questions',{cache:'no-store',signal:AbortSignal.timeout(15_000)})
    const queueResult=await queueResponse.json() as {questions?:CustomerQuestion[];error?:string;home?:HomeCommand;count?:number;actions?:{type:string;href:string}[]}
    if(!queueResponse.ok||!queueResult.questions)throw new Error(queueResult.error||'Unable to load the next question.')
    setWorkMessage(queueResult.home);setActionCount(queueResult.count)
    if(queueResult.actions?.[0]?.type==='account_use')router.refresh()
    const followUp=followUpRecord.current
    setQuestions(previous => reconcileQuestionSession(previous, currentQuestions(queueResult.questions!), completedVersions.current,followUp))
    followUpRecord.current=null
    setQueueNeedsReload(false)
  }

  async function submit(command: Record<string, unknown>) {
    if (!question || busy || submitLock.current) return
    submitLock.current = true
    onGuidedPending?.(true)
    setBusy(true)
    setError('')
    try {
      const response = await fetch(`/api/bookkeeping/questions/${question.id}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'if-match': question.version, ...(guided?{'x-betti-guided':'1'}:{}) },
        body: JSON.stringify(command),
        signal:AbortSignal.timeout(15_000),
      })
      const result = await response.json() as { error?: string;work?:GuidedWorkProjection }
      if (!response.ok) {
        if(response.status===409){if(onGuidedRefresh)await onGuidedRefresh();else await reloadAuthoritativeQueue()}
        throw new Error(result.error || 'Unable to save that answer.')
      }
      if(onGuidedAnswer){await onGuidedAnswer(command.action==='defer',undefined,result.work);return}
      if (command.action === 'defer') {deferredInThisSession.current.add(question.id);setDeferredCount(value=>value+1)}
      followUpRecord.current=command.action==='defer'?null:question.recordId??null
      completedVersions.current.add(questionVersionKey(question))
      // A committed answer stays committed even if the next queue read fails.
      setQueueNeedsReload(true)
      setQuestions(previous => previous.filter(candidate => questionVersionKey(candidate) !== questionVersionKey(question)))
      if (command.action !== 'defer') { setAnswered((value) => value + 1); setSuccess(command.activity==='paid_card' ? 'Got it. I marked this as a credit card payment. It won’t be counted as a business expense.' : 'Got it.') }
      setPurpose('')
      setOtherActivity(false)
      setMealRelationship('')
      setMixedAmount('')
      setMixedMode('dollars')
      setMixedPercentage('')
      setShowAmount(false)
      setFactValue('')
      await reloadAuthoritativeQueue()
      if(command.activity==='received_refund'&&question.recordId)router.push(`/check-in?record=${question.recordId}&returnTo=${encodeURIComponent(returnTo)}`)
      requestAnimationFrame(() => heading.current?.focus())
    } catch (cause) {
      // A transport failure can happen after commit. Require an authoritative
      // reload before allowing another answer against an uncertain version.
      const uncertain=!(cause instanceof Error)||['TimeoutError','TypeError','SyntaxError'].includes(cause.name)
      if(uncertain)setQueueNeedsReload(true)
      setError(cause instanceof Error&&cause.name!=='TimeoutError' ? cause.message : 'That took too long. Your answer may have saved, so reload the current question before trying again.')
      if(uncertain&&onGuidedRefresh)await onGuidedRefresh()
    } finally {
      submitLock.current = false
      onGuidedPending?.(false)
      setBusy(false)
    }
  }

  async function retryQueue(){
    if(submitting||submitLock.current)return
    submitLock.current=true
    setBusy(true);setError('')
    try{await reloadAuthoritativeQueue()}
    catch{setError('I still can’t load the current question. Please try again in a moment.')}
    finally{submitLock.current=false;setBusy(false)}
  }

  function keepUnresolvedAndContinue() {
    if (!question || question.kind !== 'percentage') return
    setAnswered((value) => value + 1)
    setUnresolvedKept((value) => value + 1)
    setQuestions((value) => value.slice(1))
    setFactValue('')
    requestAnimationFrame(() => heading.current?.focus())
  }

  useEffect(() => {
    setPurpose(''); setMealRelationship(''); setMixedAmount(''); setMixedPercentage('')
    setMixedMode('dollars'); setShowAmount(false); setFactValue('')
    setShowAlternatives(false); setOtherActivity(false)
  }, [question?.id, question?.version])

  useEffect(()=>{if(!question&&!queueNeedsReload&&embedded)onComplete?.({unresolvedCount:unresolvedKept})},[question,queueNeedsReload,embedded,onComplete,unresolvedKept])

  useEffect(()=>{
    if(experience!=='check-in'||guided)return
    let live=true
    const refresh=async()=>{
      if(document.visibilityState!=='visible'||submitLock.current)return
      try{
        const response=await fetch('/api/bookkeeping/questions',{cache:'no-store'})
        if(!response.ok)return
        const result=await response.json()
        if(!live||submitLock.current||!Array.isArray(result.questions))return
        setWorkMessage(result.home);setActionCount(result.count)
        setQuestions(previous=>reconcileQuestionSession(previous,currentQuestions(result.questions),completedVersions.current))
        if(result.actions?.[0]?.type==='account_use')router.refresh()
      }catch{/* Keep the last known state; submission still revalidates authority. */}
    }
    window.addEventListener('focus',refresh)
    const timer=setInterval(refresh,15000)
    return()=>{live=false;window.removeEventListener('focus',refresh);clearInterval(timer)}
    // Session refs preserve completed/deferred identity across background reads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[experience,recordId])

  if (!question && queueNeedsReload) return <div role="alert" className="app-page"><p>{error || 'Loading the next question…'}</p><button type="button" disabled={submitting} onClick={()=>void retryQueue()} className="btn btn-secondary">Reload current question</button></div>

  if (!question) {
    if(embedded)return <div className="weekly-question-complete" role="status"><strong>{unresolvedKept>0?'We can keep going.':'That’s everything I needed.'}</strong><p>{unresolvedKept>0?`I kept ${unresolvedKept} ${unresolvedKept===1?'item':'items'} on your list for more information.`:'I’ll keep working from here.'}</p></div>
    return (
      <main data-current-action-count={actionCount} className="app-page -mx-4 -mb-10 sm:-mx-6 lg:-mx-8"><section className="question-caught-up mx-auto flex min-h-[64vh] max-w-2xl flex-col items-center justify-center px-6 py-10 text-center sm:py-16">
          <BettiIllustration state="caught-up" className="question-betti-caught" priority sizes="(max-width: 639px) 13rem, 18rem" />
          {experience==='check-in'&&<p className="home-kicker">Check in with Betti</p>}
          <h1 ref={heading} tabIndex={-1} className="mt-2 text-3xl font-semibold tracking-[-.045em] text-[#17211d] sm:text-4xl">{deferredCount>0?'Your progress is saved.':answered>0?'Got it.':workMessage?.heading??(otherWorkWaiting?'You’re ready for the next step.':'Nothing to answer right now.')}</h1>
          <p className="mt-4 text-[#59665f]">{deferredCount>0?'I kept the deferred items on your list. You can come back when you have the facts.':answered>0?success:otherWorkWaiting?'Other work remains in your books. Betti will guide you to the next step.':workMessage?'': 'There are no questions available right now.'}</p>
          {workMessage&&<p className="mt-4 text-slate-600">{workMessage.supporting}</p>}
          {workMessage?.action&&<Link className="btn btn-primary mt-4" href={workMessage.action.href}>{workMessage.action.label}</Link>}
          {workMessage?.alternative&&<Link className="mt-4 underline" href={workMessage.alternative.href}>{workMessage.alternative.label}</Link>}
          <Link href={returnTo} className="btn btn-secondary mt-8">{returnLabel(returnTo)}</Link>
        </section>
      </main>
    )
  }

  const amount = question.transaction.amountCents == null
    ? null
    : money.format(Math.abs(question.transaction.amountCents) / 100)
  const enteredCents = parsePositiveDollarCents(mixedAmount)
  const transactionTotalCents = Math.abs(question.transaction.amountCents??0)

  const cashWithdrawal=question.kind==='transaction_type'&&(question.transaction.amountCents??0)<0
    &&/\bATM\b.*\bWITHDRAWAL\b/i.test(question.transaction.merchant)
  const shownPrompt=cashWithdrawal?'What did you use the cash for?':guided?question.prompt:question.prompt==='What was this purchase for?'?'What did you buy?':question.prompt
  const shownGuidance=cashWithdrawal?undefined:!guided&&question.kind==='business_purpose'&&question.evidence
    ?'I have the receipt, but I can’t tell what this was for.'
    :question.guidance
  const conversation=<>{!embedded && !guided && <header className="mb-2 flex items-center justify-between gap-4 text-sm">
        <Link href={returnTo} className="inline-flex min-h-11 items-center font-semibold text-[#243186]">← {returnLabel(returnTo)}</Link>
        {total > 1 && <p className="text-[#65736b]" role="status">{answered > 0 ? `${answered} answered` : 'One at a time'}{questions.length > 1 ? ' · More waiting' : ''}</p>}
      </header>}
      <section className={`question-conversation relative py-3 sm:py-6${embedded?' weekly-question-embedded':''}`}>
        <div className="question-identity">{!embedded&&<BettiIllustration state="question" className="question-betti" priority sizes="3rem" />}<span>Betti</span></div>
        {question.understanding && !showAlternatives && <p className="betti-understanding">{question.understanding}</p>}
        <h1 ref={heading} tabIndex={-1} aria-describedby={guided?'guided-transaction':undefined} className="text-[1.65rem] font-semibold leading-tight tracking-[-.035em] text-[#17211d] outline-none sm:text-3xl">
          {showAmount ? `How much of the ${amount??'total'} was for your business?` : showAlternatives && question.confirmation ? 'What was this money for?' : shownPrompt}
        </h1>
        <div className="question-transaction-context my-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-[#59665f]">
          <span className="font-semibold break-words">{question.transaction.merchant}</span>
          {question.transaction.date && <time dateTime={question.transaction.date}>· {customerDate.format(new Date(`${question.transaction.date}T00:00:00Z`))}</time>}
          {amount && <span>· {amount}</span>}
          {question.evidence&&<a href={question.evidence.receiptUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center font-semibold text-[#243186]">View receipt ↗</a>}
        </div>
        {guided && question.evidence && <a className="betti-evidence-link" href={question.evidence.receiptUrl} target="_blank" rel="noreferrer">View receipt ↗</a>}
        {shownGuidance && !showAmount && <p className="mt-2 text-muted">{shownGuidance}</p>}
        {showAmount && <p className="mt-2 text-muted">Tell me how much was for business.</p>}

        <p role="status" className="betti-answer-status">{submitting?'Got it. Saving your answer…':'\u00a0'}</p>
        <div className="question-answer-options mt-4 grid gap-2" data-answer-layout={guided&&question.confirmation&&!showAlternatives?'confirmation':guided && (question.options || ['business_use', 'factual_choice', 'transaction_type'].includes(question.kind)) && !otherActivity ? 'choices' : 'field'}>
          {question.kind === 'business_use' && <>
            <Action onClick={() => submit({ action: 'business_use', use: 'business' })} busy={busy}>Yes, business</Action>
            <Action onClick={() => submit({ action: 'business_use', use: 'personal' })} busy={busy}>No, personal</Action>
            <Action onClick={() => submit({ action: 'business_use', use: 'mixed' })} busy={busy}>Partly</Action>
            <Action onClick={() => submit({ action: 'not_sure' })} busy={busy}>I’m not sure</Action>
          </>}
          {question.kind === 'business_purpose' && <>
            {question.options && !otherActivity ? question.options.map(option => <Action key={option.id} busy={busy}
              onClick={()=>option.id==='other'?setOtherActivity(true):submit({action:'business_purpose',businessPurpose:option.id})}>{option.label}</Action>) : <>
            <label htmlFor="purpose" className="sr-only">What was this purchase for?</label>
            <textarea id="purpose" value={purpose} onChange={(event) => { setPurpose(event.target.value); growResponse(event.currentTarget) }}
              maxLength={1000} rows={2} className="w-full rounded-lg border border-slate-300 p-3"
              placeholder={question.prompt.toLowerCase().includes('meal')?'For example, lunch to discuss a client project':guided?question.prompt.toLowerCase().includes('travel')?'Destination, dates, and business reason':'A short note in your own words':'For example, printer paper for customer projects'} />
            <Action onClick={() => submit({ action: 'business_purpose', businessPurpose: purpose })} busy={busy || !purpose.trim()}>Continue</Action>
            </>}
            <Action onClick={() => submit({ action: 'not_sure' })} busy={busy}>I’m not sure</Action>
          </>}
          {question.kind === 'meal_relationship' && <>
            <label htmlFor="meal-relationship" className="sr-only">Who was the meal with?</label>
            <textarea id="meal-relationship" value={mealRelationship}
              onChange={(event) => { setMealRelationship(event.target.value); growResponse(event.currentTarget) }} maxLength={1000} rows={2}
              className="w-full rounded-lg border border-slate-300 p-3"
              placeholder="For example, Sarah Jones, client; Luis Garcia, prospective customer" />
            <Action onClick={() => submit({ action: 'meal_relationship', attendeeRelationship: mealRelationship })}
              busy={busy || !mealRelationship.trim()}>Continue</Action>
            <button type="button" disabled={busy} onClick={() => submit({ action: 'defer' })} className="min-h-11 text-sm font-semibold text-[#59665f] underline underline-offset-4 disabled:opacity-50">I’ll come back to this</button>
          </>}
          {question.kind === 'mixed_use' && !showAmount && <>
            <Action onClick={() => submit({ action: 'mixed_all_business' })} busy={busy}>No, all business</Action>
            <Action onClick={() => setShowAmount(true)} busy={busy}>Yes, partly personal</Action>
            <Action onClick={() => submit({ action: 'not_sure' })} busy={busy}>I’m not sure</Action>
          </>}
          {question.kind === 'mixed_use' && showAmount && <>
            <div className="weekly-mixed-input-modes" role="group" aria-label="How to enter the business portion">
              <button type="button" className={mixedMode==='dollars'?'is-active':''} onClick={()=>setMixedMode('dollars')}>Business dollars</button>
              <button type="button" className={mixedMode==='percentage'?'is-active':''} onClick={()=>setMixedMode('percentage')}>Business percentage</button>
            </div>
            {mixedMode==='dollars'?<>
            <label htmlFor="mixed-amount" className="text-base font-medium">Business amount</label>
            <div className="betti-percentage-control flex items-center rounded-lg border border-slate-300 px-3 focus-within:ring-2">
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
            <div className="betti-percentage-control flex items-center rounded-lg border border-slate-300 px-3 focus-within:ring-2">
              <input id="mixed-percentage" inputMode="decimal" value={mixedPercentage}
                onChange={(event)=>setMixedPercentage(event.target.value)} className="w-full p-3 outline-none" placeholder="40"/>
              <span aria-hidden="true">%</span>
            </div>
            <p className="text-muted">I’ll work out the amount.</p>
            <Action onClick={()=>submit({action:'mixed_business_percentage',businessPercentage:mixedPercentage})}
              busy={busy||!/^(100(?:\.0{1,2})?|(?:[0-9]|[1-9][0-9])(?:\.[0-9]{1,2})?)$/.test(mixedPercentage)}>Continue</Action>
            </>}
            <Action onClick={() => submit({ action: 'not_sure' })} busy={busy}>I’m not sure</Action>
          </>}
          {question.kind === 'factual_choice' && question.options?.map((option) =>
            <Action key={option.id} onClick={() => submit({ action: 'factual_choice', optionId: option.id })} busy={busy}>
              {option.label}
            </Action>
          )}
          {question.kind==='transaction_type'&&<>
            {question.confirmation && !showAlternatives ? <>
              <button type="button" className="btn btn-primary" disabled={busy} onClick={()=>void submit({action:'transaction_type',activity:question.confirmation!.optionId})}>{question.confirmation.label}</button>
              <button type="button" className="betti-defer" disabled={busy} onClick={()=>setShowAlternatives(true)}>No, something else</button>
            </> : !otherActivity ? question.options?.map(option=><Action key={option.id}
              onClick={()=>option.id==='other'?setOtherActivity(true):submit({action:'transaction_type',activity:option.id})} busy={busy}>{option.label}</Action>) : <>
              <label htmlFor="money-source" className="text-sm font-medium">{(question.transaction.amountCents??0)<0?'Tell me what you used it for':'Tell me where this money came from'}</label>
              <textarea id="money-source" rows={2} maxLength={1000} value={purpose} onChange={event=>setPurpose(event.target.value)} className="w-full rounded-lg border border-slate-300 p-3"/>
              <Action onClick={()=>submit({action:'transaction_type',activity:'other',details:purpose})} busy={busy||!purpose.trim()}>Continue</Action>
              <button type="button" disabled={busy} onClick={()=>setOtherActivity(false)} className="min-h-11 underline">Back to choices</button>
            </>}
            {(!question.confirmation||showAlternatives)&&<button type="button" disabled={busy} onClick={()=>void submit({action:'not_sure'})} className="min-h-11 text-sm underline">I’m not sure</button>}
          </>}
          {question.kind === 'percentage' && embedded && <div className="weekly-question-blocked" role="status">
            <strong>I still need a little more information about this item.</strong>
            <p>I’ll keep it on your list while we finish the rest of your review.</p>
            <Action onClick={keepUnresolvedAndContinue} busy={busy}>Keep this on my list and continue</Action>
          </div>}
          {question.kind === 'percentage' && !embedded && <>
            <label htmlFor="percentage" className="text-sm font-medium">Business use percentage</label>
            <div className="betti-percentage-control flex items-center rounded-lg border border-slate-300 px-3 focus-within:ring-2">
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
        {error && <div role="alert" className="mt-4 text-sm text-red-700"><p>{error}</p><button type="button" disabled={submitting} onClick={()=>void retryQueue()} className="mt-2 min-h-11 font-semibold text-[#243186]">Reload current question</button></div>}
        {!(embedded && question.kind === 'percentage') && question.kind!=='meal_relationship' && <button type="button" disabled={busy} onClick={() => submit({ action: 'defer' })}
          className="mt-4 min-h-11 w-full text-sm font-medium text-muted underline disabled:opacity-50">
          I’ll come back to this
        </button>}
      </section></>
  if(guided)return <div className="betti-question-controls">{conversation}</div>
  if(embedded)return <div className="weekly-question-flow">{conversation}</div>
  return <main className="app-page -mx-4 -mb-10 px-4 sm:-mx-6 sm:px-6 lg:-mx-8"><div className="mx-auto max-w-2xl py-2 sm:py-3">{conversation}</div></main>
}

function Action(props: { children: React.ReactNode; onClick: () => void; busy: boolean }) {
  return <button type="button" disabled={props.busy} onClick={props.onClick}
    className={props.children==='I’m not sure'?'min-h-11 w-full text-sm font-medium text-muted underline disabled:opacity-50':`btn ${props.children === 'Continue' ? 'btn-primary' : 'btn-secondary'} min-h-12 w-full justify-center text-base disabled:opacity-50`}>{props.children}</button>
}

function growResponse(control: HTMLTextAreaElement) {
  control.style.height = 'auto'
  control.style.height = `${Math.min(control.scrollHeight, 180)}px`
}

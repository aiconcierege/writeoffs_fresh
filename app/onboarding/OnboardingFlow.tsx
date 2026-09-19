'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { validateOnboardingBusinessPatch } from '../lib/onboarding/validation'
import {catchUpQuote, displayMonth, monthAt, monthIndex} from '../lib/onboarding/catch-up'
import { BettiPresence } from '../components/experience/BettiPresence'
import { MonthYearField } from '../components/experience/MonthYearField'
import './onboarding.css'
import {
  activeOnboardingSteps, getFirstIncompleteOnboardingStep,
  type OnboardingBusinessData, type OnboardingUiStep,
} from '../lib/onboarding/progress'

const TITLES: Record<OnboardingUiStep, string> = {
  business: 'Your business', eligibility: 'A good fit', history: 'Your beginning',
  operations: 'How you work',
  catch_up: 'Starting point', starting_method: 'Working together', review: 'Ready to begin',
}
const FIELD = 'w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-base text-slate-950 outline-none focus:border-[#243186] focus:ring-2 focus:ring-[#243186]/20'

export default function OnboardingFlow({ initialBusiness, joinedMonth, editing = false }: {
  initialBusiness: OnboardingBusinessData
  joinedMonth: string
  editing?: boolean
}) {
  const router = useRouter()
  const [business, setBusiness] = useState(() => ({
    ...initialBusiness,
    catch_up_start_date: initialBusiness.catch_up_start_date ?? `${joinedMonth}-01`,
  }))
  const [step, setStep] = useState<OnboardingUiStep>(() => getFirstIncompleteOnboardingStep(initialBusiness,new Date(),joinedMonth))
  const [saving, setSaving] = useState(false)
  const [catchUpAgreed,setCatchUpAgreed]=useState(false)
  const [serverQuote,setServerQuote]=useState<{startMonth:string;additionalMonths:number;totalCents:number;includedFrom:string}|null>(null)
  useEffect(()=>{
    if(step!=='catch_up')return
    const controller=new AbortController(),startMonth=business.catch_up_start_date?.slice(0,7)
    void fetch('/api/onboarding/catch-up',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({startMonth,preview:true}),signal:controller.signal})
      .then(async response=>{if(!response.ok)throw new Error();return response.json()})
      .then(quote=>{if(!controller.signal.aborted)setServerQuote({...quote,startMonth})})
      .catch(()=>{if(!controller.signal.aborted)setError('We couldn’t confirm the catch-up price. Refresh to try again.')})
    return ()=>controller.abort()
  },[step,business.catch_up_start_date])
  const activeQuote=serverQuote?.startMonth===business.catch_up_start_date?.slice(0,7)?serverQuote:null
  const [error, setError] = useState<string | null>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const pendingRequests = useRef(new Map<string, string>())
  const steps = activeOnboardingSteps(business,joinedMonth)
  const stepIndex = Math.max(0, steps.indexOf(step))

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: false })
  }, [step])

  function update<K extends keyof OnboardingBusinessData>(field: K, value: OnboardingBusinessData[K]) {
    setBusiness((current) => ({ ...current, [field]: value }))
  }

  async function save(stepToSave: Exclude<OnboardingUiStep, 'review'>, data: Record<string, unknown>) {
    const checked = validateOnboardingBusinessPatch({ step: stepToSave, data })
    if (!checked.ok) throw new Error(checked.error)
    const fingerprint = `${stepToSave}:${JSON.stringify(data)}`
    const requestId = pendingRequests.current.get(fingerprint) ?? crypto.randomUUID()
    pendingRequests.current.set(fingerprint, requestId)
    const response = await fetch('/api/onboarding/business', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        step: stepToSave,
        data,
        request_id: requestId,
        expected_fact_event_ids: business.sensitive_fact_revisions,
        source: editing ? 'settings' : 'onboarding',
      }),
    })
    const body = await response.json().catch(() => ({}))
    if (response.status === 401) throw new Error('Your session expired. Log in again to continue.')
    if (response.status === 409) throw new Error('These business details changed in another session. Refresh to review the latest answers.')
    if (!response.ok) throw new Error(body.error || 'We couldn’t save this answer.')
    pendingRequests.current.delete(fingerprint)
    setBusiness((current) => ({ ...current, ...checked.update,
      sensitive_fact_revisions: { ...current.sensitive_fact_revisions, ...(body.factRevisions ?? {}) },
      onboarding_state: current.onboarding_state === 'completed' ? 'completed' : 'in_progress',
      onboarding_version: 3 }))
  }

  function nextStep() {
    const currentSteps = activeOnboardingSteps(business,joinedMonth)
    const index = currentSteps.indexOf(step)
    if (currentSteps[index + 1]) setStep(currentSteps[index + 1])
  }

  async function continueStep() {
    setSaving(true); setError(null)
    try {
      if (step === 'business') await save('business', {
        name: business.name, business_description: business.business_description,
      })
      if (step === 'eligibility') {
        await save('eligibility', { schedule_c_eligibility: business.schedule_c_eligibility })
        if (business.schedule_c_eligibility !== 'yes') return
      }
      if (step === 'history') await save('history', {
        business_stage: business.business_stage,
        business_start_month: business.business_start_month?.slice(0, 7),
      })
      if (step === 'operations') {
        await save('operations', {
          schedule_c_eligibility: business.schedule_c_eligibility,
          uses_customer_job_materials: business.uses_customer_job_materials,
          keeps_future_sale_merchandise: business.keeps_future_sale_merchandise,
        })
        if (business.keeps_future_sale_merchandise !== 'no') return
      }
      if (step === 'catch_up') {
        const response=await fetch('/api/onboarding/catch-up',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({startMonth:business.catch_up_start_date?.slice(0,7),agreed:catchUpAgreed,expectedTotalCents:activeQuote?.totalCents})})
        const result=await response.json()
        if(!response.ok)throw new Error(result.error || 'We couldn’t save your starting month.')
        if(result.url){window.location.assign(result.url);return}
        if(!result.ready)throw new Error('Please review and agree to the one-time catch-up charge before continuing.')
      }
      if (step === 'starting_method') await save('starting_method', { onboarding_start_method: business.onboarding_start_method })
      nextStep()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'We couldn’t save this answer.')
    } finally { setSaving(false) }
  }

  async function complete() {
    setSaving(true); setError(null)
    try {
      const response = await fetch('/api/onboarding/complete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }) })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error || 'A required answer still needs attention.')
      router.push('/home')
      router.refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'We couldn’t complete setup.')
    } finally { setSaving(false) }
  }

  function back() {
    const currentSteps = activeOnboardingSteps(business,joinedMonth)
    const previous = currentSteps[currentSteps.indexOf(step) - 1]
    if (previous) setStep(previous)
  }

  const blocked = (step === 'eligibility' && business.schedule_c_eligibility !== 'yes' && business.schedule_c_eligibility !== null)
    || (step === 'operations' && business.keeps_future_sale_merchandise !== 'no' && business.keeps_future_sale_merchandise !== null)

  return (
    <section className="wo-onboarding wo-experience" data-onboarding-step={step}>
      <div className="wo-onboarding-progress">
        <span>{TITLES[step]}</span><span>Step {stepIndex + 1} of {steps.length}</span>
        <div role="progressbar" aria-valuemin={1} aria-valuemax={steps.length} aria-valuenow={stepIndex + 1} aria-label="Onboarding progress"><div style={{ width: `${((stepIndex + 1) / steps.length) * 100}%` }} /></div>
      </div>
      <div className="wo-onboarding-composition">
        <aside className="wo-onboarding-guide">
          <p className="wo-eyebrow">Betti · Your bookkeeper</p>
          <p className="wo-onboarding-intro">{step === 'review' ? 'Your business. In good hands.' : 'A little about you. Then I’ll take it from here.'}</p>
          <BettiPresence state={step === 'review' ? 'caught-up' : 'welcome'} className="wo-onboarding-art" priority sizes="(max-width:639px) 110px, 300px" />
        </aside>
        <form className="onboarding-conversation" aria-busy={saving} onSubmit={(event) => { event.preventDefault(); void (step === 'review' ? complete() : continueStep()) }}>
          <Step step={step} business={business} update={update} headingRef={headingRef} edit={setStep} joinedMonth={joinedMonth} agreed={catchUpAgreed} setAgreed={setCatchUpAgreed} serverQuote={activeQuote} />
          {error && <div id="onboarding-error" role="alert" aria-live="assertive" className="wo-onboarding-error">{error}</div>}
          <div className="wo-onboarding-actions">
            <button type="button" onClick={back} disabled={saving || stepIndex === 0} className="wo-onboarding-back min-h-11">Back</button>
            {!blocked && <button type="submit" disabled={saving||(step==='catch_up'&&!activeQuote)} className="btn btn-primary min-h-11">{saving ? 'Saving…' : step === 'review' ? 'Go to WriteOffs' : 'Continue'} <span aria-hidden="true">→</span></button>}
          </div>
          <p className="wo-onboarding-saved">Your progress is saved as you go.</p>
        </form>
      </div>
    </section>
  )
}

type StepProps = {
  step: OnboardingUiStep; business: OnboardingBusinessData
  update: <K extends keyof OnboardingBusinessData>(field: K, value: OnboardingBusinessData[K]) => void
  serverQuote: {startMonth:string;additionalMonths:number;totalCents:number;includedFrom:string}|null
  joinedMonth: string; agreed: boolean; setAgreed: (value:boolean)=>void
  headingRef: React.RefObject<HTMLHeadingElement | null>; edit: (step: OnboardingUiStep) => void
}

function Step({ step, business, update, headingRef, edit, joinedMonth, agreed, setAgreed, serverQuote }: StepProps) {
  const heading = 'wo-onboarding-title'
  if (step === 'business') return <div><h1 ref={headingRef} tabIndex={-1} className={heading}>Let’s meet your business.</h1><p className="mt-3 text-sm leading-6 text-slate-600">Tell me what you do. I’ll handle the bookkeeping, and ask when I need a fact from you.</p><div className="mt-7 space-y-5"><Field label="Business name" optional><input className={FIELD} value={business.name ?? ''} maxLength={200} onChange={(e) => update('name', e.target.value)} /></Field><Field label="What does your business do?"><textarea required rows={4} maxLength={2000} className={FIELD} value={business.business_description ?? ''} onChange={(e) => update('business_description', e.target.value)} placeholder="I install and service residential heating and cooling systems." /></Field></div></div>
  if (step === 'eligibility') return <div><h1 ref={headingRef} tabIndex={-1} className={heading}>How do you report this business on your taxes?</h1><p className="mt-3 text-sm leading-6 text-slate-600">WriteOffs is built for people who report their self-employed business with their personal tax return.</p><Choices legend="Schedule C reporting"><Choice name="schedule" selected={business.schedule_c_eligibility === 'yes'} onClick={() => update('schedule_c_eligibility', 'yes')} label="With my personal tax return" detail="Usually called Schedule C." /><Choice name="schedule" selected={business.schedule_c_eligibility === 'no'} onClick={() => update('schedule_c_eligibility', 'no')} label="As a separate business tax return" /><Choice name="schedule" selected={business.schedule_c_eligibility === 'not_sure'} onClick={() => update('schedule_c_eligibility', 'not_sure')} label="I’m not sure" /></Choices>{business.schedule_c_eligibility === 'no' && <Unsupported title="This setup isn’t supported yet">WriteOffs v1 does not yet provide entity-level books for partnerships or corporations. This is only a product limitation.</Unsupported>}{business.schedule_c_eligibility === 'not_sure' && <Unsupported title="Confirm this before continuing">A tax professional can tell you whether this business is reported on Schedule C. We’ll keep your saved answers here.</Unsupported>}</div>
  if (step === 'history') return <div><h1 ref={headingRef} tabIndex={-1} className={heading}>Is this a new or existing business?</h1><Choices legend="Business history"><Choice name="stage" selected={business.business_stage === 'new'} onClick={() => update('business_stage', 'new')} label="I’m starting a new business" /><Choice name="stage" selected={business.business_stage === 'existing'} onClick={() => update('business_stage', 'existing')} label="This business already exists" /></Choices><MonthYearField label="When did the business start?" max={new Date().toISOString().slice(0, 7)} value={business.business_start_month?.slice(0, 7) ?? ''} onChange={value => update('business_start_month', value)} /></div>
  if (step === 'operations') return <div><h1 ref={headingRef} tabIndex={-1} className={heading}>Does your business buy parts or materials for customer jobs?</h1><p className="mt-3 text-sm leading-6 text-slate-600">This includes items you install, use, or provide while completing a customer’s job.</p><Choices legend="Customer-job materials"><Choice name="materials" selected={business.uses_customer_job_materials === 'yes'} onClick={() => update('uses_customer_job_materials', 'yes')} label="Yes" detail="For example, fixtures, parts, paint, wire, equipment, or project materials." /><Choice name="materials" selected={business.uses_customer_job_materials === 'no'} onClick={() => update('uses_customer_job_materials', 'no')} label="No" /><Choice name="materials" selected={business.uses_customer_job_materials === 'not_sure'} onClick={() => update('uses_customer_job_materials', 'not_sure')} label="I’m not sure" /></Choices><div className="mt-8"><h2 className="text-lg font-semibold text-slate-950">Does your business keep a significant amount of products or merchandise in stock to sell later?</h2><p className="mt-2 text-sm leading-6 text-slate-600">Don’t count normal leftover parts or materials you keep for future jobs.</p><Choices legend="Products kept for future sale"><Choice name="inventory" selected={business.keeps_future_sale_merchandise === 'yes'} onClick={() => update('keeps_future_sale_merchandise', 'yes')} label="Yes" /><Choice name="inventory" selected={business.keeps_future_sale_merchandise === 'no'} onClick={() => update('keeps_future_sale_merchandise', 'no')} label="No" /><Choice name="inventory" selected={business.keeps_future_sale_merchandise === 'not_sure'} onClick={() => update('keeps_future_sale_merchandise', 'not_sure')} label="I’m not sure" /></Choices></div><p className="mt-5 text-sm leading-6 text-slate-600">Changing these answers later may affect how WriteOffs handles some business expenses, but it will not rewrite prior answers.</p>{business.keeps_future_sale_merchandise === 'yes' && <Unsupported title="WriteOffs isn’t the right fit for this setup yet">WriteOffs supports trades and service businesses with job materials and normal leftover parts. It does not yet manage substantial merchandise kept for later sale.</Unsupported>}{business.keeps_future_sale_merchandise === 'not_sure' && <Unsupported title="A little clarification is needed">Normal truck or shop stock is okay. Confirm whether your business primarily maintains substantial merchandise for future customers.</Unsupported>}</div>
  if (step === 'catch_up') {
    const preview=catchUpQuote(business.catch_up_start_date?.slice(0,7) || joinedMonth,joinedMonth)
    const quote={...preview,...(serverQuote??{}),includedFrom:(serverQuote?.includedFrom??preview.includedFrom).slice(0,7)}
    const choose=(month:string)=>{if(!/^(19|20)\d{2}-(0[1-9]|1[0-2])$/.test(month)||month>joinedMonth)return;update('catch_up_start_date',`${month}-01`);setAgreed(false)}
    return <div><h1 ref={headingRef} tabIndex={-1} className={heading}>When should I start keeping your books?</h1>
      <p className="mt-4 leading-7 text-[#59665f]">{displayMonth(quote.includedFrom)} and {displayMonth(joinedMonth)} are included in your membership.</p>
      <Choices legend="Starting month">{[[joinedMonth,'Start this month'],[monthAt(monthIndex(joinedMonth)-1),'Start with last month'],[`${joinedMonth.slice(0,4)}-01`,'Start in January']].filter(([month],index,rows)=>rows.findIndex(row=>row[0]===month)===index).map(([month,label])=><Choice key={month} name="start-month" selected={quote.startMonth===month} onClick={()=>choose(month)} label={label}/>)}</Choices>
      <MonthYearField label="Choose another starting month" max={joinedMonth} value={quote.startMonth} onChange={choose} />
      <div className="mt-7 border-y border-[#dce3de] py-6" aria-live="polite"><p className="font-semibold">Starting {displayMonth(quote.startMonth)}</p><p className="mt-2 leading-6 text-[#59665f]">{!serverQuote?'Confirming your price…':quote.additionalMonths ? `${quote.additionalMonths} additional historical months × $20 = $${quote.totalCents/100}, one time.` : 'No catch-up charge.'}</p>
      {quote.additionalMonths>0&&<label className="mt-5 flex items-start gap-3 leading-6"><input type="checkbox" disabled={!serverQuote} checked={agreed} onChange={e=>setAgreed(e.target.checked)} className="mt-1 h-5 w-5 shrink-0"/><span>I agree to the one-time ${quote.totalCents/100} catch-up charge. Continue to secure checkout.</span></label>}</div>
    </div>
  }
  if (step === 'starting_method') return <div><h1 ref={headingRef} tabIndex={-1} className={heading}>Give Betti your financial activity</h1><p className="mt-4 leading-7 text-[#59665f]">Connecting your bank accounts and credit cards is the easiest way to keep Betti up to date. Statements and documents work too—you can use either or both.</p><Choices legend="How to get started"><Choice name="start" selected={business.onboarding_start_method === 'connected_financial_accounts'} onClick={() => update('onboarding_start_method', 'connected_financial_accounts')} label="Connect my accounts" detail="Recommended. Betti can keep your books up to date as new activity arrives."/><Choice name="start" selected={business.onboarding_start_method === 'statement_uploads' || business.onboarding_start_method === 'receipts'} onClick={() => update('onboarding_start_method', 'statement_uploads')} label="Send Betti documents" detail="Send receipts and statements. Betti will figure out where they belong."/></Choices></div>
  return <div><h1 ref={headingRef} tabIndex={-1} className={heading}>I’ve got what I need to start.</h1><p className="mt-4 leading-7 text-[#59665f]">I’ll take it from here and ask when I need something. Your books, records, and reports will be waiting on Home.</p>
    <details className="wo-onboarding-review"><summary>Review your details</summary><div>{[
      {title:'Your business',target:'business',lines:[business.name || business.business_description || 'Your business',`${business.business_stage==='existing'?'Existing business':'New business'} · Started ${formatDate(business.business_start_month)}`]},
      {title:'How we’ll get started',target:'catch_up',lines:[`Organizing records starting ${formatDate(business.catch_up_start_date)}`,business.onboarding_start_method==='connected_financial_accounts'?'Connected accounts':'Documents sent to Betti']},
      {title:'About your business',target:'operations',lines:[business.uses_customer_job_materials==='yes'?'Buys materials for customer jobs':business.uses_customer_job_materials==='no'?'Doesn’t buy materials for customer jobs':'Materials use still to clarify','Doesn’t keep significant inventory for resale']},
    ].map(section=><section key={section.title} className="border-t border-[#dce3de] pt-5"><div className="flex items-center justify-between gap-4"><h2 className="text-sm font-semibold text-[#59665f]">{section.title}</h2><button type="button" onClick={()=>edit(section.target as OnboardingUiStep)} className="min-h-11 px-2 text-sm font-semibold text-[#243186]">Change<span className="sr-only"> {section.title.toLowerCase()}</span></button></div>{section.lines.map(line=><p key={line} className="mt-2 text-base leading-7">{line}</p>)}</section>)}</div></details></div>
}

function Field({ label, optional, children }: { label: string; optional?: boolean; children: React.ReactNode }) { return <label className="block"><span className="text-sm font-semibold text-slate-900">{label}</span>{optional && <span className="ml-2 text-xs text-slate-500">Optional</span>}<span className="mt-2 block">{children}</span></label> }
function Choices({ legend, children }: { legend: string; children: React.ReactNode }) { return <fieldset className="wo-onboarding-choices"><legend className="sr-only">{legend}</legend>{children}</fieldset> }
function Choice({ name, selected, onClick, label, detail }: { name: string; selected: boolean; onClick: () => void; label: string; detail?: string }) { return <label className="wo-onboarding-choice" data-selected={selected}><input type="radio" name={name} checked={selected} onChange={onClick} className="mt-1" /><span><span className="block font-semibold text-slate-950">{label}</span>{detail && <span className="mt-1 block text-sm leading-5 text-slate-600">{detail}</span>}</span></label> }
function Unsupported({ title, children }: { title: string; children: React.ReactNode }) { return <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-5"><h2 className="font-semibold text-amber-950">{title}</h2><p className="mt-2 text-sm leading-6 text-amber-900">{children}</p></div> }
function formatDate(value: string | null) { if (!value) return 'Not set'; return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`)) }

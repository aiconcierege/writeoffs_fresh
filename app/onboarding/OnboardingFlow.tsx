'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { validateOnboardingBusinessPatch } from '../lib/onboarding/validation'
import {
  activeOnboardingSteps, getFirstIncompleteOnboardingStep,
  type OnboardingBusinessData, type OnboardingUiStep,
} from '../lib/onboarding/progress'

const TITLES: Record<OnboardingUiStep, string> = {
  business: 'Your business', eligibility: 'Product fit', history: 'Business history',
  operations: 'How you work', materials_history: 'Past materials handling',
  catch_up: 'Starting point', starting_method: 'First activity', review: 'Review',
}
const FIELD = 'w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-base text-slate-950 outline-none focus:border-[#243186] focus:ring-2 focus:ring-[#243186]/20'

export default function OnboardingFlow({ initialBusiness }: { initialBusiness: OnboardingBusinessData }) {
  const router = useRouter()
  const [business, setBusiness] = useState(() => ({
    ...initialBusiness,
    catch_up_start_date: initialBusiness.catch_up_start_date ?? `${new Date().getFullYear()}-01-01`,
  }))
  const [step, setStep] = useState<OnboardingUiStep>(() => getFirstIncompleteOnboardingStep(initialBusiness))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const steps = activeOnboardingSteps(business)
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
    const response = await fetch('/api/onboarding/business', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ step: stepToSave, data }),
    })
    const body = await response.json().catch(() => ({}))
    if (response.status === 401) throw new Error('Your session expired. Log in again to continue.')
    if (!response.ok) throw new Error(body.error || 'We couldn’t save this answer.')
    setBusiness((current) => ({ ...current, ...checked.update,
      onboarding_state: current.onboarding_state === 'completed' ? 'completed' : 'in_progress',
      onboarding_version: 3 }))
  }

  function nextStep() {
    const currentSteps = activeOnboardingSteps(business)
    const index = currentSteps.indexOf(step)
    if (currentSteps[index + 1]) setStep(currentSteps[index + 1])
  }

  async function continueStep() {
    setSaving(true); setError(null)
    try {
      if (step === 'business') await save('business', {
        name: business.name, business_description: business.business_description,
        business_profile_context: business.business_profile_context,
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
      if (step === 'materials_history') await save('materials_history', {
        prior_materials_handling: business.prior_materials_handling,
      })
      if (step === 'catch_up') await save('catch_up', { catch_up_start_date: business.catch_up_start_date })
      if (step === 'starting_method') await save('starting_method', { onboarding_start_method: business.onboarding_start_method })
      nextStep()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'We couldn’t save this answer.')
    } finally { setSaving(false) }
  }

  async function complete() {
    setSaving(true); setError(null)
    try {
      const response = await fetch('/api/onboarding/complete', { method: 'POST' })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error || 'A required answer still needs attention.')
      router.push('/home')
      router.refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'We couldn’t complete setup.')
    } finally { setSaving(false) }
  }

  function back() {
    const currentSteps = activeOnboardingSteps(business)
    const previous = currentSteps[currentSteps.indexOf(step) - 1]
    if (previous) setStep(previous)
  }

  const blocked = (step === 'eligibility' && business.schedule_c_eligibility !== 'yes' && business.schedule_c_eligibility !== null)
    || (step === 'operations' && business.keeps_future_sale_merchandise !== 'no' && business.keeps_future_sale_merchandise !== null)

  return (
    <section className="mx-auto max-w-2xl py-6 sm:py-10">
      <div className="mb-5 px-1">
        <div className="flex items-center justify-between text-sm"><span className="font-semibold text-[#243186]">Step {stepIndex + 1} of {steps.length}</span><span className="text-slate-600">{TITLES[step]}</span></div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-valuemin={1} aria-valuemax={steps.length} aria-valuenow={stepIndex + 1} aria-label="Onboarding progress"><div className="h-full rounded-full bg-[#00d0a6]" style={{ width: `${((stepIndex + 1) / steps.length) * 100}%` }} /></div>
      </div>
      <div className="card overflow-hidden">
        <form onSubmit={(event) => { event.preventDefault(); void (step === 'review' ? complete() : continueStep()) }}>
          <div className="p-5 sm:p-8">
            <p className="text-sm font-semibold uppercase tracking-wide text-[#243186]">Set up WriteOffs</p>
            <div className="mt-4"><Step step={step} business={business} update={update} headingRef={headingRef} edit={setStep} /></div>
            {error && <div role="alert" className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>}
          </div>
          <div className="sticky bottom-0 flex gap-3 border-t border-slate-200 bg-white/95 p-4 sm:justify-between sm:px-8">
            <button type="button" onClick={back} disabled={saving || stepIndex === 0} className="btn btn-secondary min-h-11 flex-1 disabled:opacity-40 sm:flex-none">Back</button>
            {!blocked && <button type="submit" disabled={saving} className="btn btn-primary min-h-11 flex-[2] px-5 disabled:opacity-60 sm:flex-none">{saving ? 'Saving…' : step === 'review' ? 'Finish setup' : 'Continue'}</button>}
          </div>
        </form>
      </div>
      <p className="mt-5 text-center text-xs text-slate-500">Your progress is saved after every answer.</p>
    </section>
  )
}

type StepProps = {
  step: OnboardingUiStep; business: OnboardingBusinessData
  update: <K extends keyof OnboardingBusinessData>(field: K, value: OnboardingBusinessData[K]) => void
  headingRef: React.RefObject<HTMLHeadingElement | null>; edit: (step: OnboardingUiStep) => void
}

function Step({ step, business, update, headingRef, edit }: StepProps) {
  const heading = 'text-2xl font-bold text-slate-950 outline-none sm:text-3xl'
  if (step === 'business') return <div><h1 ref={headingRef} tabIndex={-1} className={heading}>Tell us about your business.</h1><p className="mt-3 text-sm leading-6 text-slate-600">A few basics help WriteOffs understand your work. Everyone uses the same bookkeeping experience.</p><div className="mt-7 space-y-5"><Field label="Business name" optional><input className={FIELD} value={business.name ?? ''} maxLength={200} onChange={(e) => update('name', e.target.value)} /></Field><Field label="What does your business do?"><textarea required rows={4} maxLength={2000} className={FIELD} value={business.business_description ?? ''} onChange={(e) => update('business_description', e.target.value)} placeholder="I install and service residential heating and cooling systems." /></Field><Choices legend="Which description fits best?"><Choice name="profile" selected={business.business_profile_context === 'general'} onClick={() => update('business_profile_context', 'general')} label="My business" detail="Use the standard WriteOffs experience." /><Choice name="profile" selected={business.business_profile_context === 'realtor'} onClick={() => update('business_profile_context', 'realtor')} label="Real estate professional" detail="Adds useful context about your work without changing the product path." /></Choices></div></div>
  if (step === 'eligibility') return <div><h1 ref={headingRef} tabIndex={-1} className={heading}>Is this business reported on Schedule C with your personal tax return?</h1><p className="mt-3 text-sm leading-6 text-slate-600">WriteOffs v1 is built for self-employed businesses reported this way.</p><Choices legend="Schedule C reporting"><Choice name="schedule" selected={business.schedule_c_eligibility === 'yes'} onClick={() => update('schedule_c_eligibility', 'yes')} label="Yes" /><Choice name="schedule" selected={business.schedule_c_eligibility === 'no'} onClick={() => update('schedule_c_eligibility', 'no')} label="No" /><Choice name="schedule" selected={business.schedule_c_eligibility === 'not_sure'} onClick={() => update('schedule_c_eligibility', 'not_sure')} label="I’m not sure" /></Choices>{business.schedule_c_eligibility === 'no' && <Unsupported title="This setup isn’t supported yet">WriteOffs v1 does not yet provide entity-level books for partnerships or corporations. This is only a product limitation.</Unsupported>}{business.schedule_c_eligibility === 'not_sure' && <Unsupported title="Confirm this before continuing">A tax professional can tell you whether this business is reported on Schedule C. We’ll keep your saved answers here.</Unsupported>}</div>
  if (step === 'history') return <div><h1 ref={headingRef} tabIndex={-1} className={heading}>Are you starting fresh or bringing in an existing business?</h1><Choices legend="Business history"><Choice name="stage" selected={business.business_stage === 'new'} onClick={() => update('business_stage', 'new')} label="I’m starting a new business" /><Choice name="stage" selected={business.business_stage === 'existing'} onClick={() => update('business_stage', 'existing')} label="This business already exists" /></Choices><div className="mt-6 max-w-sm"><Field label="When did the business start?"><input type="month" required max={new Date().toISOString().slice(0, 7)} className={FIELD} value={business.business_start_month?.slice(0, 7) ?? ''} onChange={(e) => update('business_start_month', e.target.value)} /></Field></div></div>
  if (step === 'operations') return <div><h1 ref={headingRef} tabIndex={-1} className={heading}>Does your business buy parts or materials for customer jobs?</h1><p className="mt-3 text-sm leading-6 text-slate-600">This includes items you install, use, or provide while completing a customer’s job.</p><Choices legend="Customer-job materials"><Choice name="materials" selected={business.uses_customer_job_materials === 'yes'} onClick={() => update('uses_customer_job_materials', 'yes')} label="Yes" detail="For example, fixtures, parts, paint, wire, equipment, or project materials." /><Choice name="materials" selected={business.uses_customer_job_materials === 'no'} onClick={() => update('uses_customer_job_materials', 'no')} label="No" /><Choice name="materials" selected={business.uses_customer_job_materials === 'not_sure'} onClick={() => update('uses_customer_job_materials', 'not_sure')} label="I’m not sure" /></Choices><div className="mt-8"><h2 className="text-lg font-semibold text-slate-950">Does your business keep a significant amount of products or merchandise in stock to sell later?</h2><p className="mt-2 text-sm leading-6 text-slate-600">Don’t count normal leftover parts or materials you keep for future jobs.</p><Choices legend="Products kept for future sale"><Choice name="inventory" selected={business.keeps_future_sale_merchandise === 'yes'} onClick={() => update('keeps_future_sale_merchandise', 'yes')} label="Yes" /><Choice name="inventory" selected={business.keeps_future_sale_merchandise === 'no'} onClick={() => update('keeps_future_sale_merchandise', 'no')} label="No" /><Choice name="inventory" selected={business.keeps_future_sale_merchandise === 'not_sure'} onClick={() => update('keeps_future_sale_merchandise', 'not_sure')} label="I’m not sure" /></Choices></div>{business.keeps_future_sale_merchandise === 'yes' && <Unsupported title="WriteOffs isn’t the right fit for this setup yet">WriteOffs supports trades and service businesses with job materials and normal leftover parts. It does not yet manage substantial merchandise kept for later sale.</Unsupported>}{business.keeps_future_sale_merchandise === 'not_sure' && <Unsupported title="A little clarification is needed">Normal truck or shop stock is okay. Confirm whether your business primarily maintains substantial merchandise for future customers.</Unsupported>}</div>
  if (step === 'materials_history') return <div><h1 ref={headingRef} tabIndex={-1} className={heading}>How have customer-job materials usually been handled at tax time?</h1><p className="mt-3 text-sm leading-6 text-slate-600">This saves useful history. It does not change how your taxes are handled.</p><Choices legend="Past handling"><Choice name="past" selected={business.prior_materials_handling === 'deduct_purchases'} onClick={() => update('prior_materials_handling', 'deduct_purchases')} label="I usually deduct what I buy during the year" /><Choice name="past" selected={business.prior_materials_handling === 'count_year_end'} onClick={() => update('prior_materials_handling', 'count_year_end')} label="I count what I still have at year-end" /><Choice name="past" selected={business.prior_materials_handling === 'accountant_handles'} onClick={() => update('prior_materials_handling', 'accountant_handles')} label="My accountant handles this" /><Choice name="past" selected={business.prior_materials_handling === 'not_sure'} onClick={() => update('prior_materials_handling', 'not_sure')} label="I’m not sure" /></Choices><p className="mt-5 rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-600">You can keep using WriteOffs while this is clarified. Customer-job material tax timing stays unresolved rather than being guessed.</p></div>
  if (step === 'catch_up') return <div><h1 ref={headingRef} tabIndex={-1} className={heading}>When should WriteOffs start organizing your activity?</h1><p className="mt-3 text-sm leading-6 text-slate-600">Starting January 1 of this year is usually the simplest choice. You can bring in earlier records later if needed.</p><div className="mt-7 max-w-sm"><Field label="Start date"><input type="date" required max={new Date().toISOString().slice(0, 10)} className={FIELD} value={business.catch_up_start_date ?? ''} onChange={(e) => update('catch_up_start_date', e.target.value)} /></Field></div></div>
  if (step === 'starting_method') return <div><h1 ref={headingRef} tabIndex={-1} className={heading}>What would you like to add first?</h1><p className="mt-3 text-sm leading-6 text-slate-600">You can use both options later. Bank connections are not required.</p><Choices legend="First activity"><Choice name="start" selected={business.onboarding_start_method === 'statement_uploads'} onClick={() => update('onboarding_start_method', 'statement_uploads')} label="Import a CSV" detail="Bring in bank or card activity from a downloaded CSV file." /><Choice name="start" selected={business.onboarding_start_method === 'receipts'} onClick={() => update('onboarding_start_method', 'receipts')} label="Upload receipts" detail="Start preserving receipts and expense evidence." /></Choices></div>
  return <div><h1 ref={headingRef} tabIndex={-1} className={heading}>You’re ready to use WriteOffs.</h1><p className="mt-3 text-sm leading-6 text-slate-600">WriteOffs will keep the accounting work in the background and ask simple factual questions only when they matter.</p><dl className="mt-7 divide-y divide-slate-200 rounded-xl border border-slate-200">{[
    ['Business', business.name || business.business_description || 'Your business', 'business'],
    ['Business profile', business.business_profile_context === 'realtor' ? 'Real estate professional' : 'Standard', 'business'],
    ['Start organizing', formatDate(business.catch_up_start_date), 'catch_up'],
    ['First activity', business.onboarding_start_method === 'receipts' ? 'Upload receipts' : 'Import a CSV', 'starting_method'],
  ].map(([label, value, target]) => <div key={label} className="flex items-center justify-between gap-4 p-4"><div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt><dd className="mt-1 text-sm text-slate-900">{value}</dd></div><button type="button" className="text-sm font-semibold text-[#243186]" onClick={() => edit(target as OnboardingUiStep)}>Edit</button></div>)}</dl><p className="mt-6 text-sm text-slate-600">After setup, you’ll go to Home. From there you can import activity or upload receipts.</p></div>
}

function Field({ label, optional, children }: { label: string; optional?: boolean; children: React.ReactNode }) { return <label className="block"><span className="text-sm font-semibold text-slate-900">{label}</span>{optional && <span className="ml-2 text-xs text-slate-500">Optional</span>}<span className="mt-2 block">{children}</span></label> }
function Choices({ legend, children }: { legend: string; children: React.ReactNode }) { return <fieldset className="mt-6 space-y-3"><legend className="sr-only">{legend}</legend>{children}</fieldset> }
function Choice({ name, selected, onClick, label, detail }: { name: string; selected: boolean; onClick: () => void; label: string; detail?: string }) { return <label className={`flex cursor-pointer gap-3 rounded-xl border p-4 ${selected ? 'border-[#243186] bg-indigo-50/50 ring-1 ring-[#243186]' : 'border-slate-200'}`}><input type="radio" name={name} checked={selected} onChange={onClick} className="mt-1" /><span><span className="block font-semibold text-slate-950">{label}</span>{detail && <span className="mt-1 block text-sm leading-5 text-slate-600">{detail}</span>}</span></label> }
function Unsupported({ title, children }: { title: string; children: React.ReactNode }) { return <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-5"><h2 className="font-semibold text-amber-950">{title}</h2><p className="mt-2 text-sm leading-6 text-amber-900">{children}</p></div> }
function formatDate(value: string | null) { if (!value) return 'Not set'; return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`)) }

'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  FEDERAL_TAX_REPORTING_TYPES,
  LEGAL_STRUCTURES,
  validateOnboardingBusinessPatch,
  validateOnboardingVehicle,
} from '../lib/onboarding/validation'
import {
  ONBOARDING_PLANS,
  recommendOnboardingPlan,
} from '../lib/onboarding/plan-recommendation'
import {
  ONBOARDING_UI_STEPS,
  getFirstIncompleteOnboardingStep,
  type OnboardingBusinessData,
  type OnboardingUiStep,
  type OnboardingVehicleData,
} from '../lib/onboarding/progress'

const STEP_TITLES: Record<OnboardingUiStep, string> = {
  business: 'Your business',
  organization: 'Organization',
  start_date: 'Business start',
  home_office: 'Home office',
  vehicles: 'Vehicles',
  accounts: 'Financial accounts',
  starting_method: 'How to start',
  recommendation: 'Plan recommendation',
  review: 'Review and complete',
}

const FIELD_CLASS =
  'w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-base text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-[#243186] focus:ring-2 focus:ring-[#243186]/20'

const LEGAL_LABELS: Record<(typeof LEGAL_STRUCTURES)[number], [string, string]> = {
  sole_proprietor: ['Sole proprietor', 'You operate the business personally without forming a separate company.'],
  single_member_llc: ['Single-member LLC', 'An LLC with one owner.'],
  partnership_multi_member_llc: ['Partnership / multi-member LLC', 'A business with two or more owners.'],
  corporation: ['Corporation', 'A business legally formed as a corporation.'],
  not_sure: ['I’m not sure', 'You can confirm this later with a tax professional.'],
}

const FEDERAL_LABELS: Record<(typeof FEDERAL_TAX_REPORTING_TYPES)[number], string> = {
  schedule_c: 'Schedule C',
  s_corporation: 'S Corporation',
  c_corporation: 'C Corporation',
  partnership: 'Partnership',
  not_sure: 'I’m not sure',
}

const emptyVehicle = (slot: 1 | 2): OnboardingVehicleData => ({
  slot,
  display_name: '',
  vehicle_year: null,
  make: null,
  model: null,
  is_mixed_use: null,
})

export default function OnboardingFlow({
  initialBusiness,
  initialVehicles,
}: {
  initialBusiness: OnboardingBusinessData
  initialVehicles: OnboardingVehicleData[]
}) {
  const router = useRouter()
  const [business, setBusiness] = useState(initialBusiness)
  const [vehicles, setVehicles] = useState<OnboardingVehicleData[]>(
    initialVehicles.length ? initialVehicles : [emptyVehicle(1)]
  )
  const firstStep = getFirstIncompleteOnboardingStep(
    initialBusiness,
    initialVehicles
  )
  const [step, setStep] = useState<OnboardingUiStep>(firstStep)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)

  const stepIndex = ONBOARDING_UI_STEPS.indexOf(step)
  const recommendation = useMemo(() => {
    try {
      return recommendOnboardingPlan({
        expected_financial_account_count:
          business.expected_financial_account_count,
        onboarding_start_method: business.onboarding_start_method,
      })
    } catch {
      return null
    }
  }, [business.expected_financial_account_count, business.onboarding_start_method])

  useEffect(() => {
    headingRef.current?.focus()
  }, [step])

  function updateBusiness<K extends keyof OnboardingBusinessData>(
    field: K,
    value: OnboardingBusinessData[K]
  ) {
    setBusiness((current) => ({ ...current, [field]: value }))
  }

  function updateVehicle(slot: 1 | 2, patch: Partial<OnboardingVehicleData>) {
    setVehicles((current) => {
      if (!current.some((vehicle) => vehicle.slot === slot)) {
        return [...current, { ...emptyVehicle(slot), ...patch }]
      }
      return current.map((vehicle) =>
        vehicle.slot === slot ? { ...vehicle, ...patch } : vehicle
      )
    })
  }

  async function requestJson(url: string, init: RequestInit) {
    const response = await fetch(url, init)
    const data = await response.json().catch(() => ({}))
    if (response.status === 401) {
      throw new Error('Your session has expired. Log in again to continue.')
    }
    if (!response.ok) throw new Error(data?.error || 'We couldn’t save this step.')
    return data
  }

  async function saveBusinessStep(
    businessStep: Exclude<OnboardingUiStep, 'recommendation' | 'review'>,
    data: Record<string, unknown>
  ) {
    const validation = validateOnboardingBusinessPatch({
      step: businessStep,
      data,
    })
    if (!validation.ok) throw new Error(validation.error)
    await requestJson('/api/onboarding/business', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ step: businessStep, data }),
    })
    setBusiness((current) => ({
      ...current,
      ...validation.update,
      onboarding_state:
        current.onboarding_state === 'completed' ? 'completed' : 'in_progress',
      onboarding_version: 2,
    }))
  }

  async function saveVehicle(vehicle: OnboardingVehicleData) {
    const payload = {
      display_name: vehicle.display_name,
      vehicle_year: vehicle.vehicle_year,
      make: vehicle.make,
      model: vehicle.model,
      is_mixed_use: vehicle.is_mixed_use,
    }
    const validation = validateOnboardingVehicle(payload)
    if (!validation.ok) throw new Error(`Vehicle ${vehicle.slot}: ${validation.error}`)
    await requestJson(`/api/onboarding/vehicles/${vehicle.slot}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    return { slot: vehicle.slot, ...validation.update } as OnboardingVehicleData
  }

  async function archiveVehicle(slot: 1 | 2) {
    await requestJson(`/api/onboarding/vehicles/${slot}/archive`, {
      method: 'PATCH',
    })
  }

  function advance() {
    const next = ONBOARDING_UI_STEPS[stepIndex + 1]
    if (next) setStep(next)
  }

  async function continueStep() {
    setSaving(true)
    setError(null)
    try {
      switch (step) {
        case 'business':
          await saveBusinessStep('business', {
            name: business.name,
            business_description: business.business_description,
          })
          break
        case 'organization':
          await saveBusinessStep('organization', {
            legal_structure: business.legal_structure,
            federal_tax_reporting_type: business.federal_tax_reporting_type,
          })
          break
        case 'start_date':
          await saveBusinessStep('start_date', {
            business_start_month: business.business_start_month?.slice(0, 7),
          })
          break
        case 'home_office':
          await saveBusinessStep('home_office', {
            has_qualifying_home_office:
              business.has_qualifying_home_office,
            home_office_square_feet: business.home_office_square_feet,
          })
          break
        case 'vehicles': {
          if (business.uses_vehicle_for_business === null) {
            throw new Error('Choose whether you use a vehicle for business.')
          }
          if (!business.uses_vehicle_for_business) {
            await archiveVehicle(1)
            await archiveVehicle(2)
            await saveBusinessStep('vehicles', {
              uses_vehicle_for_business: false,
            })
            setVehicles([])
          } else {
            const active = vehicles.length ? vehicles : [emptyVehicle(1)]
            const saved: OnboardingVehicleData[] = []
            for (const vehicle of active) saved.push(await saveVehicle(vehicle))
            if (!active.some((vehicle) => vehicle.slot === 2)) {
              await archiveVehicle(2)
            }
            await saveBusinessStep('vehicles', {
              uses_vehicle_for_business: true,
            })
            setVehicles(saved)
          }
          break
        }
        case 'accounts':
          await saveBusinessStep('accounts', {
            expected_financial_account_count:
              business.expected_financial_account_count,
            expected_financial_account_use:
              business.expected_financial_account_use,
          })
          break
        case 'starting_method':
          await saveBusinessStep('starting_method', {
            onboarding_start_method: business.onboarding_start_method,
          })
          break
        case 'recommendation':
          if (!recommendation) throw new Error('Complete your account preferences first.')
          break
        case 'review':
          return
      }
      advance()
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'We couldn’t save this step. Your answers are still here.'
      )
    } finally {
      setSaving(false)
    }
  }

  async function completeOnboarding() {
    setSaving(true)
    setError(null)
    try {
      const response = await fetch('/api/onboarding/complete', { method: 'POST' })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        const validationErrors: string[] = Array.isArray(data?.validation?.errors)
          ? data.validation.errors
          : []
        const incompleteStep = stepForCompletionErrors(validationErrors)
        if (incompleteStep) setStep(incompleteStep)
        const details = validationErrors.length
          ? ` ${validationErrors.join(' ')}`
          : ''
        throw new Error(
          `${data?.error || 'A few details still need attention before setup can be completed.'}${details}`
        )
      }
      if (
        typeof data.destination !== 'string' ||
        !data.destination.startsWith('/') ||
        data.destination.startsWith('//')
      ) {
        throw new Error('Onboarding completed, but the destination was invalid.')
      }
      router.push(data.destination)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'We couldn’t complete onboarding.')
    } finally {
      setSaving(false)
    }
  }

  function goBack() {
    setError(null)
    const previous = ONBOARDING_UI_STEPS[stepIndex - 1]
    if (previous) setStep(previous)
  }

  return (
    <section className="mx-auto max-w-2xl py-6 sm:py-10">
      <div className="mb-5 px-1">
        <div className="flex items-center justify-between text-sm">
          <span className="font-semibold text-[#243186]">
            Step {stepIndex + 1} of {ONBOARDING_UI_STEPS.length}
          </span>
          <span className="text-slate-600">{STEP_TITLES[step]}</span>
        </div>
        <div
          className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200"
          role="progressbar"
          aria-valuemin={1}
          aria-valuemax={ONBOARDING_UI_STEPS.length}
          aria-valuenow={stepIndex + 1}
          aria-label="Onboarding progress"
        >
          <div
            className="h-full rounded-full bg-[#00d0a6] transition-[width] motion-reduce:transition-none"
            style={{ width: `${((stepIndex + 1) / ONBOARDING_UI_STEPS.length) * 100}%` }}
          />
        </div>
      </div>

      <div className="card overflow-hidden">
        <form
          onSubmit={(event) => {
            event.preventDefault()
            if (step === 'review') void completeOnboarding()
            else void continueStep()
          }}
        >
          <div className="p-5 sm:p-8">
            <h1 className="text-sm font-semibold uppercase tracking-wide text-[#243186]">
              Set up WriteOffs
            </h1>
            <div className="mt-4">
              <StepContent
                step={step}
                business={business}
                vehicles={vehicles}
                recommendation={recommendation}
                headingRef={headingRef}
                updateBusiness={updateBusiness}
                updateVehicle={updateVehicle}
                addSecondVehicle={() =>
                  setVehicles((current) =>
                    current.some((vehicle) => vehicle.slot === 2)
                      ? current
                      : [...current, emptyVehicle(2)]
                  )
                }
                removeSecondVehicle={() =>
                  setVehicles((current) =>
                    current.filter((vehicle) => vehicle.slot !== 2)
                  )
                }
                editStep={setStep}
              />
            </div>

            {error && (
              <div
                className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
                role="alert"
                aria-live="polite"
              >
                <p className="font-semibold">We couldn’t finish that action.</p>
                <p className="mt-1">{error}</p>
                <p className="mt-1">Your answers are still here. Try again when you’re ready.</p>
              </div>
            )}
          </div>

          <div className="sticky bottom-0 flex items-center gap-3 border-t border-slate-200 bg-white/95 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur sm:justify-between sm:px-8">
            <button
              type="button"
              onClick={goBack}
              disabled={saving || stepIndex === 0}
              className="btn btn-secondary min-h-11 flex-1 disabled:cursor-not-allowed disabled:opacity-40 sm:flex-none sm:px-5"
            >
              Back
            </button>
            <button
              type="submit"
              disabled={saving}
              className="btn btn-primary min-h-11 flex-[2] px-5 disabled:cursor-wait disabled:opacity-60 sm:flex-none"
            >
              {saving
                ? step === 'review'
                  ? 'Completing…'
                  : 'Saving…'
                : error
                  ? 'Try again'
                : step === 'review'
                  ? 'Complete onboarding'
                  : step === 'recommendation'
                    ? 'Continue to review'
                    : 'Continue'}
            </button>
          </div>
        </form>
      </div>
      <p className="mt-5 text-center text-xs text-slate-500">
        Your progress is saved after each completed step.
      </p>
    </section>
  )
}

type StepContentProps = {
  step: OnboardingUiStep
  business: OnboardingBusinessData
  vehicles: OnboardingVehicleData[]
  recommendation: ReturnType<typeof recommendOnboardingPlan> | null
  headingRef: React.RefObject<HTMLHeadingElement | null>
  updateBusiness: <K extends keyof OnboardingBusinessData>(
    field: K,
    value: OnboardingBusinessData[K]
  ) => void
  updateVehicle: (slot: 1 | 2, patch: Partial<OnboardingVehicleData>) => void
  addSecondVehicle: () => void
  removeSecondVehicle: () => void
  editStep: (step: OnboardingUiStep) => void
}

function StepContent(props: StepContentProps) {
  const { step, business, headingRef } = props
  const headingClass = 'text-2xl font-bold text-slate-950 outline-none sm:text-3xl'

  if (step === 'business') {
    return (
      <div>
        <h2 ref={headingRef} tabIndex={-1} className={headingClass}>First, tell us about your business.</h2>
        <div className="mt-7 space-y-5">
          <Field label="Business name" hint="Optional">
            <input
              value={business.name ?? ''}
              onChange={(event) => props.updateBusiness('name', event.target.value)}
              maxLength={200}
              placeholder="Acme Design Studio"
              className={FIELD_CLASS}
            />
          </Field>
          <Field
            label="What does your business do?"
            description="Describe your work in your own words. WriteOffs uses this to understand the kinds of expenses your business may have."
          >
            <textarea
              required
              value={business.business_description ?? ''}
              onChange={(event) =>
                props.updateBusiness('business_description', event.target.value)
              }
              maxLength={2000}
              rows={5}
              placeholder="I design websites and provide brand consulting for small businesses."
              className={`${FIELD_CLASS} resize-y`}
            />
            <div className="mt-1 text-right text-xs text-slate-500">
              {(business.business_description ?? '').length}/2000
            </div>
          </Field>
        </div>
      </div>
    )
  }

  if (step === 'organization') {
    return (
      <div>
        <h2 ref={headingRef} tabIndex={-1} className={headingClass}>How is your business organized?</h2>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Legal structure and federal tax reporting are related, but they are not always the same. Choose each answer separately.
        </p>
        <ChoiceGroup legend="What is your legal structure?">
          {LEGAL_STRUCTURES.map((value) => (
            <Choice
              key={value}
              name="legal_structure"
              checked={business.legal_structure === value}
              onChange={() => props.updateBusiness('legal_structure', value)}
              label={LEGAL_LABELS[value][0]}
              description={LEGAL_LABELS[value][1]}
            />
          ))}
        </ChoiceGroup>
        <ChoiceGroup legend="How does your business report federal taxes?">
          {FEDERAL_TAX_REPORTING_TYPES.map((value) => (
            <Choice
              key={value}
              name="federal_tax_reporting_type"
              checked={business.federal_tax_reporting_type === value}
              onChange={() =>
                props.updateBusiness('federal_tax_reporting_type', value)
              }
              label={FEDERAL_LABELS[value]}
            />
          ))}
        </ChoiceGroup>
        {business.federal_tax_reporting_type &&
          business.federal_tax_reporting_type !== 'schedule_c' && (
            <InfoBox>
              WriteOffs is primarily designed around Schedule C expense records, but you can still use it to track and document individual business expenses.
            </InfoBox>
          )}
      </div>
    )
  }

  if (step === 'start_date') {
    const currentMonth = new Date().toISOString().slice(0, 7)
    return (
      <div>
        <h2 ref={headingRef} tabIndex={-1} className={headingClass}>When did this business start?</h2>
        <p className="mt-3 text-sm text-slate-600">This helps WriteOffs understand which months belong to this business.</p>
        <div className="mt-7 max-w-sm">
          <Field label="Business start month">
            <input
              type="month"
              required
              max={currentMonth}
              value={business.business_start_month?.slice(0, 7) ?? ''}
              onChange={(event) =>
                props.updateBusiness('business_start_month', event.target.value)
              }
              className={FIELD_CLASS}
            />
          </Field>
        </div>
      </div>
    )
  }

  if (step === 'home_office') {
    return (
      <div>
        <h2 ref={headingRef} tabIndex={-1} className={headingClass}>Do you use part of your home for your business?</h2>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          The IRS generally requires the space to be used regularly and exclusively for business. WriteOffs uses the simplified method, based on the business-use square footage you provide. Your tax professional can confirm eligibility.
        </p>
        <ChoiceGroup legend="Do you use part of your home regularly and exclusively for this business?">
          <Choice name="home_office" checked={business.has_qualifying_home_office === true} onChange={() => props.updateBusiness('has_qualifying_home_office', true)} label="Yes" />
          <Choice name="home_office" checked={business.has_qualifying_home_office === false} onChange={() => { props.updateBusiness('has_qualifying_home_office', false); props.updateBusiness('home_office_square_feet', null) }} label="No" />
        </ChoiceGroup>
        {business.has_qualifying_home_office === true && (
          <div className="mt-6 max-w-sm">
            <Field label="How many square feet are used for the home office?" description="Enter the business-use area only.">
              <input type="number" required min={1} max={10000} step={1} value={business.home_office_square_feet ?? ''} onChange={(event) => props.updateBusiness('home_office_square_feet', event.target.value ? Number(event.target.value) : null)} className={FIELD_CLASS} />
            </Field>
          </div>
        )}
      </div>
    )
  }

  if (step === 'vehicles') {
    const activeVehicles = props.vehicles.length ? props.vehicles : [emptyVehicle(1)]
    return (
      <div>
        <h2 ref={headingRef} tabIndex={-1} className={headingClass}>Do you use a vehicle for business?</h2>
        <ChoiceGroup legend="Business vehicle use">
          <Choice name="vehicle_use" checked={business.uses_vehicle_for_business === true} onChange={() => { props.updateBusiness('uses_vehicle_for_business', true); if (!props.vehicles.length) props.updateVehicle(1, {}) }} label="Yes" />
          <Choice name="vehicle_use" checked={business.uses_vehicle_for_business === false} onChange={() => props.updateBusiness('uses_vehicle_for_business', false)} label="No" />
        </ChoiceGroup>
        {business.uses_vehicle_for_business === true && (
          <div className="mt-7 space-y-6">
            {activeVehicles.map((vehicle) => (
              <VehicleEditor key={vehicle.slot} vehicle={vehicle} update={(patch) => props.updateVehicle(vehicle.slot, patch)} removable={vehicle.slot === 2} remove={props.removeSecondVehicle} />
            ))}
            {!activeVehicles.some((vehicle) => vehicle.slot === 2) && (
              <button type="button" onClick={props.addSecondVehicle} className="btn btn-secondary min-h-11">Add a second vehicle</button>
            )}
          </div>
        )}
      </div>
    )
  }

  if (step === 'accounts') {
    return (
      <div>
        <h2 ref={headingRef} tabIndex={-1} className={headingClass}>How many financial accounts do you expect WriteOffs to work with?</h2>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Most users start with one checking account and one credit card. Personal or mixed-use accounts are allowed—you do not need a business-branded account.
        </p>
        <ChoiceGroup legend="Expected number of accounts" columns>
          {Array.from({ length: 7 }, (_, count) => (
            <Choice key={count} name="account_count" checked={business.expected_financial_account_count === count} onChange={() => { props.updateBusiness('expected_financial_account_count', count); if (count === 0) props.updateBusiness('expected_financial_account_use', null) }} label={String(count)} compact />
          ))}
        </ChoiceGroup>
        {Number(business.expected_financial_account_count) > 0 ? (
          <ChoiceGroup legend="How are these accounts used overall?">
            <Choice name="account_use" checked={business.expected_financial_account_use === 'primarily_business'} onChange={() => props.updateBusiness('expected_financial_account_use', 'primarily_business')} label="Primarily for business" />
            <Choice name="account_use" checked={business.expected_financial_account_use === 'mixed_use'} onChange={() => props.updateBusiness('expected_financial_account_use', 'mixed_use')} label="Mixed business and personal" description="Mixed-use accounts work with WriteOffs, but they may create more items for your weekly review. If even one account is regularly mixed-use, choose this option." />
          </ChoiceGroup>
        ) : business.expected_financial_account_count === 0 ? (
          <InfoBox>That’s okay. You can use WriteOffs for receipts, manual expenses, and mileage without connecting an account.</InfoBox>
        ) : null}
      </div>
    )
  }

  if (step === 'starting_method') {
    return (
      <div>
        <h2 ref={headingRef} tabIndex={-1} className={headingClass}>How would you like to get started?</h2>
        <ChoiceGroup legend="Starting workflow">
          <Choice name="start_method" checked={business.onboarding_start_method === 'receipts'} onChange={() => props.updateBusiness('onboarding_start_method', 'receipts')} label="Start with receipts" description="Take photos, upload files, or enter expenses manually. Financial connections are not required for receipt tracking." />
          <Choice name="start_method" checked={business.onboarding_start_method === 'connected_financial_accounts'} onChange={() => props.updateBusiness('onboarding_start_method', 'connected_financial_accounts')} label="Connect financial accounts" description="Use account activity to help organize expenses and income. This saves your preference only; no account will be connected during onboarding." />
          <Choice name="start_method" checked={business.onboarding_start_method === 'statement_uploads'} onChange={() => props.updateBusiness('onboarding_start_method', 'statement_uploads')} label="Upload statements" description="Use statements to bring in account activity and fill historical gaps. This saves your preference only." />
        </ChoiceGroup>
        <p className="mt-5 text-sm text-slate-600">You can add other sources later. Choosing receipts does not require a connected account.</p>
      </div>
    )
  }

  if (step === 'recommendation') {
    return (
      <div>
        <h2 ref={headingRef} tabIndex={-1} className={headingClass}>Here’s the plan that best fits your answers.</h2>
        <p className="mt-3 text-sm text-slate-600">This recommendation is informational. You won’t be charged and no subscription will be created today.</p>
        {props.recommendation && <InfoBox><strong>Why this plan:</strong> {recommendationReason(props.recommendation.id)}</InfoBox>}
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          {Object.values(ONBOARDING_PLANS).map((plan) => {
            const bestMatch = props.recommendation?.id === plan.id
            return (
              <div key={plan.id} className={`rounded-2xl border p-4 ${bestMatch ? 'border-[#00b392] bg-emerald-50/60 ring-2 ring-[#00d0a6]/20' : 'border-slate-200 bg-white'}`}>
                {bestMatch && <div className="mb-2 text-xs font-bold uppercase tracking-wide text-emerald-800">Best match for your answers</div>}
                {plan.generallyRecommended && <div className="mb-2 inline-flex rounded-full bg-[#243186] px-2 py-1 text-xs font-semibold text-white">Recommended</div>}
                <h3 className="font-bold text-slate-950">{plan.name}</h3>
                <p className="mt-1 text-xl font-bold">${plan.monthlyPrice.toFixed(2)}<span className="text-sm font-normal text-slate-600">/month</span></p>
                <p className="mt-3 text-xs leading-5 text-slate-600">{plan.id === 'essential' ? 'Receipt and manual-expense tracking, plus mileage.' : plan.id === 'premium' ? 'Financial-account and statement workflows for up to two expected accounts.' : 'Designed for three to six expected financial accounts.'}</p>
                <p className="mt-3 text-xs font-medium text-slate-700">{plan.trialDays ? '30-day free trial. No credit card required.' : 'No free trial.'}</p>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <ReviewStep
      headingRef={headingRef}
      business={business}
      vehicles={props.vehicles}
      recommendation={props.recommendation}
      editStep={props.editStep}
    />
  )
}

function VehicleEditor({ vehicle, update, removable, remove }: { vehicle: OnboardingVehicleData; update: (patch: Partial<OnboardingVehicleData>) => void; removable: boolean; remove: () => void }) {
  return (
    <fieldset className="rounded-2xl border border-slate-200 p-4 sm:p-5">
      <legend className="px-1 font-semibold text-slate-950">Vehicle {vehicle.slot}</legend>
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-slate-600">Tell us enough to recognize this vehicle.</span>
        {removable && <button type="button" onClick={remove} className="text-sm font-semibold text-red-700 underline underline-offset-4">Remove Vehicle 2</button>}
      </div>
      <div className="mt-4 space-y-4">
        <Field label="Vehicle nickname"><input required maxLength={120} value={vehicle.display_name} onChange={(event) => update({ display_name: event.target.value })} placeholder="Work car" className={FIELD_CLASS} /></Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Year" hint="Optional"><input type="number" min={1900} max={2100} step={1} value={vehicle.vehicle_year ?? ''} onChange={(event) => update({ vehicle_year: event.target.value ? Number(event.target.value) : null })} className={FIELD_CLASS} /></Field>
          <Field label="Make" hint="Optional"><input value={vehicle.make ?? ''} onChange={(event) => update({ make: event.target.value })} placeholder="Toyota" className={FIELD_CLASS} /></Field>
          <Field label="Model" hint="Optional"><input value={vehicle.model ?? ''} onChange={(event) => update({ model: event.target.value })} placeholder="Camry" className={FIELD_CLASS} /></Field>
        </div>
        <ChoiceGroup legend="Do you also use this vehicle personally?">
          <Choice name={`mixed_${vehicle.slot}`} checked={vehicle.is_mixed_use === true} onChange={() => update({ is_mixed_use: true })} label="Yes, business and personal" />
          <Choice name={`mixed_${vehicle.slot}`} checked={vehicle.is_mixed_use === false} onChange={() => update({ is_mixed_use: false })} label="No, business only" />
        </ChoiceGroup>
      </div>
    </fieldset>
  )
}

function ReviewStep({ headingRef, business, vehicles, recommendation, editStep }: { headingRef: React.RefObject<HTMLHeadingElement | null>; business: OnboardingBusinessData; vehicles: OnboardingVehicleData[]; recommendation: ReturnType<typeof recommendOnboardingPlan> | null; editStep: (step: OnboardingUiStep) => void }) {
  const rows: Array<[string, string, OnboardingUiStep]> = [
    ['Business', `${business.name || 'No business name'} — ${business.business_description}`, 'business'],
    ['Organization', `${labelFor(LEGAL_LABELS, business.legal_structure)}; ${labelFor(FEDERAL_LABELS, business.federal_tax_reporting_type)}`, 'organization'],
    ['Business start', formatMonth(business.business_start_month), 'start_date'],
    ['Home office', business.has_qualifying_home_office ? `Yes — ${business.home_office_square_feet} sq. ft.` : 'No', 'home_office'],
    ['Vehicles', business.uses_vehicle_for_business ? vehicles.map((vehicle) => vehicle.display_name).join(', ') : 'No business vehicle', 'vehicles'],
    ['Financial accounts', `${business.expected_financial_account_count} expected${business.expected_financial_account_use ? ` — ${business.expected_financial_account_use === 'mixed_use' ? 'mixed use' : 'primarily business'}` : ''}`, 'accounts'],
    ['Starting workflow', business.onboarding_start_method === 'receipts' ? 'Receipts' : business.onboarding_start_method === 'connected_financial_accounts' ? 'Connect financial accounts' : 'Upload statements', 'starting_method'],
    ['Plan recommendation', recommendation?.name ?? 'Unavailable', 'recommendation'],
  ]
  return (
    <div>
      <h2 ref={headingRef} tabIndex={-1} className="text-2xl font-bold text-slate-950 outline-none sm:text-3xl">Review your setup.</h2>
      <p className="mt-3 text-sm text-slate-600">Make sure these details look right. You can go back and change anything before finishing.</p>
      <dl className="mt-6 divide-y divide-slate-200 rounded-2xl border border-slate-200">
        {rows.map(([label, value, edit]) => (
          <div key={label} className="flex items-start justify-between gap-4 p-4">
            <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt><dd className="mt-1 text-sm text-slate-800">{value}</dd></div>
            <button type="button" onClick={() => editStep(edit)} className="min-h-11 px-2 text-sm font-semibold text-[#243186] underline underline-offset-4">Edit</button>
          </div>
        ))}
      </dl>
      <InfoBox>Completing setup does not connect an account, start a subscription, or charge you.</InfoBox>
    </div>
  )
}

function Field({ label, hint, description, children }: { label: string; hint?: string; description?: string; children: React.ReactNode }) {
  return <label className="block"><span className="text-sm font-semibold text-slate-800">{label}</span>{hint && <span className="ml-2 text-xs font-normal text-slate-500">{hint}</span>}{description && <span className="mt-1 block text-sm leading-5 text-slate-600">{description}</span>}<span className="mt-2 block">{children}</span></label>
}

function ChoiceGroup({ legend, columns = false, children }: { legend: string; columns?: boolean; children: React.ReactNode }) {
  return <fieldset className="mt-7"><legend className="text-sm font-semibold text-slate-800">{legend}</legend><div className={`mt-3 grid gap-3 ${columns ? 'grid-cols-4 sm:grid-cols-7' : 'sm:grid-cols-2'}`}>{children}</div></fieldset>
}

function Choice({ name, checked, onChange, label, description, compact = false }: { name: string; checked: boolean; onChange: () => void; label: string; description?: string; compact?: boolean }) {
  return <label className={`relative flex min-h-11 cursor-pointer gap-3 rounded-xl border p-3 transition focus-within:ring-2 focus-within:ring-[#243186] focus-within:ring-offset-2 ${checked ? 'border-[#243186] bg-indigo-50' : 'border-slate-200 bg-white hover:border-slate-300'} ${compact ? 'items-center justify-center' : 'items-start'}`}><input type="radio" name={name} checked={checked} onChange={onChange} className={compact ? 'sr-only' : 'mt-1 h-4 w-4 accent-[#243186]'} /><span><span className="block text-sm font-semibold text-slate-900">{label}</span>{description && <span className="mt-1 block text-xs leading-5 text-slate-600">{description}</span>}</span></label>
}

function InfoBox({ children }: { children: React.ReactNode }) {
  return <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm leading-6 text-slate-700">{children}</div>
}

function recommendationReason(id: string) {
  if (id === 'essential') return 'You plan to start with receipts and don’t expect WriteOffs to work with connected financial accounts.'
  if (id === 'premium_plus') return 'You expect WriteOffs to work with more than two financial accounts.'
  return 'You expect WriteOffs to work with up to two accounts or want to begin with connected activity or statements.'
}

function stepForCompletionErrors(errors: string[]): OnboardingUiStep | null {
  const joined = errors.join(' ')
  if (joined.includes('business_description')) return 'business'
  if (joined.includes('legal_structure') || joined.includes('federal_tax_reporting_type')) return 'organization'
  if (joined.includes('business_start_month')) return 'start_date'
  if (joined.includes('home_office') || joined.includes('has_qualifying_home_office')) return 'home_office'
  if (joined.includes('vehicle')) return 'vehicles'
  if (joined.includes('expected_financial_account')) return 'accounts'
  if (joined.includes('onboarding_start_method')) return 'starting_method'
  return null
}

function labelFor(labels: Record<string, string | [string, string]>, value: string | null) {
  if (!value) return 'Not answered'
  const label = labels[value]
  return Array.isArray(label) ? label[0] : label || value
}

function formatMonth(value: string | null) {
  if (!value) return 'Not answered'
  const [year, month] = value.split('-').map(Number)
  return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(year, month - 1, 1)))
}

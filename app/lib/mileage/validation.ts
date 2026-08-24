export type MileageFacts = {
  vehicleId: string
  milesMilli: number
  occurredOn: string
  jobLabel: string | null
  destination: string | null
  businessPurpose: string | null
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const optional = (value: unknown, max: number) => {
  if (value == null || value === '') return null
  if (typeof value !== 'string' || value.trim().length > max) return undefined
  return value.trim() || null
}

export function parseMilesToMilli(value: unknown) {
  if (typeof value !== 'string' && typeof value !== 'number') return null
  const text = String(value).trim()
  if (!/^\d+(?:\.\d{1,3})?$/.test(text)) return null
  const [whole, fraction = ''] = text.split('.')
  const result = Number(whole) * 1000 + Number(fraction.padEnd(3, '0'))
  return Number.isSafeInteger(result) && result > 0 ? result : null
}

export function validateMileageFacts(input: unknown, today = new Date().toISOString().slice(0, 10)):
  { ok: true; value: MileageFacts } | { ok: false; error: string } {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { ok: false, error: 'Mileage details are required.' }
  const value = input as Record<string, unknown>
  const allowed = ['vehicleId', 'miles', 'occurredOn', 'jobLabel', 'destination', 'businessPurpose']
  if (Object.keys(value).some((key) => !allowed.includes(key)) || typeof value.vehicleId !== 'string' || !UUID.test(value.vehicleId))
    return { ok: false, error: 'Choose a vehicle.' }
  const milesMilli = parseMilesToMilli(value.miles)
  if (!milesMilli) return { ok: false, error: 'Enter miles greater than zero, using up to three decimal places.' }
  if (typeof value.occurredOn !== 'string' || !ISO_DATE.test(value.occurredOn)) return { ok: false, error: 'Enter a valid trip date.' }
  const parsed = new Date(`${value.occurredOn}T00:00:00Z`)
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value.occurredOn || value.occurredOn > today)
    return { ok: false, error: 'Trip date cannot be in the future.' }
  const jobLabel = optional(value.jobLabel, 200); const destination = optional(value.destination, 500)
  const businessPurpose = optional(value.businessPurpose, 1000)
  if (jobLabel === undefined || destination === undefined || businessPurpose === undefined)
    return { ok: false, error: 'One of the optional details is too long.' }
  return { ok: true, value: { vehicleId: value.vehicleId, milesMilli, occurredOn: value.occurredOn,
    jobLabel, destination, businessPurpose } }
}

export function formatMiles(milesMilli: number) {
  return (milesMilli / 1000).toLocaleString('en-US', { maximumFractionDigits: 3 })
}

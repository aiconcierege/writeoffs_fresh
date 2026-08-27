function dayPart(hour: number) {
  if (hour < 12) return 'morning'
  if (hour < 17) return 'afternoon'
  return 'evening'
}

export function greetingForTimeZone(now: Date, timeZone: string) {
  const hourPart = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(now).find((part) => part.type === 'hour')?.value
  const hour = Number(hourPart)
  if (!Number.isInteger(hour)) throw new Error('The business timezone could not be resolved.')
  return `Good ${dayPart(hour)}`
}

export function HomeGreeting({ firstName, timeZone, now = new Date() }: {
  firstName: string | null
  timeZone: string
  now?: Date
}) {
  const greeting = greetingForTimeZone(now, timeZone)
  return (
    <p className="text-base text-slate-600">
      {firstName ? `${greeting}, ${firstName}` : greeting}
    </p>
  )
}

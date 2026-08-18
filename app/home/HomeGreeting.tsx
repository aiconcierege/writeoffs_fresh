'use client'

function dayPart(hour: number) {
  if (hour < 12) return 'morning'
  if (hour < 17) return 'afternoon'
  return 'evening'
}

export function HomeGreeting({ firstName }: { firstName: string | null }) {
  const greeting = `Good ${dayPart(new Date().getHours())}`
  return (
    <p suppressHydrationWarning className="text-base text-slate-600">
      {firstName ? `${greeting}, ${firstName}` : greeting}
    </p>
  )
}

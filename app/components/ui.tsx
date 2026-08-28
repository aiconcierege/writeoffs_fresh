import type { ElementType, HTMLAttributes, ReactNode } from 'react'
import { BettiIllustration, type BettiState } from './BettiIllustration'

function classes(...values: Array<string | false | null | undefined>) { return values.filter(Boolean).join(' ') }

export function PageContainer({ children, narrow, wide, className = '' }: { children: ReactNode; narrow?: boolean; wide?: boolean; className?: string }) {
  return <div className={classes('page-container', narrow && 'page-container-narrow', wide && 'page-container-wide', className)}>{children}</div>
}

export function PageHeader({ eyebrow, title, description, actions, className = '' }: { eyebrow?: string; title: ReactNode; description?: ReactNode; actions?: ReactNode; className?: string }) {
  return <header className={classes('flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between', className)}><div className="page-header">
    {eyebrow && <p className="eyebrow">{eyebrow}</p>}<h1 className="page-title">{title}</h1>{description && <p className="page-description">{description}</p>}
  </div>{actions && <div className="shrink-0">{actions}</div>}</header>
}

export function BettiPageIntro({ state, eyebrow, title, children, action, className = '' }: {
  state: BettiState; eyebrow?: string; title: ReactNode; children: ReactNode; action?: ReactNode; className?: string
}) {
  return <section className={classes('betti-page-intro', `betti-page-intro-${state}`, className)}>
    <div className="betti-page-intro-copy">{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h1 className="page-title">{title}</h1>
      <div className="betti-page-intro-description">{children}</div>{action && <div className="betti-page-intro-action">{action}</div>}
    </div>
    <div className="betti-page-intro-art" aria-hidden="true"><BettiIllustration state={state} decorative sizes="(max-width: 639px) 9rem, 14rem" /></div>
  </section>
}

export function SectionHeader({ title, description, action }: { title: ReactNode; description?: ReactNode; action?: ReactNode }) {
  return <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="section-heading">{title}</h2>{description && <p className="section-description">{description}</p>}</div>{action}</div>
}

export function Surface({ as: Tag = 'section', className = '', children, ...props }: { as?: ElementType; children: ReactNode } & HTMLAttributes<HTMLElement>) {
  return <Tag className={classes('surface', className)} {...props}>{children}</Tag>
}

export function StatusBadge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'positive' | 'attention' | 'muted' }) {
  return <span className="status-badge" data-tone={tone}>{children}</span>
}

export function EmptyState({ title, description, action }: { title: ReactNode; description: ReactNode; action?: ReactNode }) {
  return <div className="empty-state"><h2>{title}</h2><p>{description}</p>{action && <div className="mt-5">{action}</div>}</div>
}

export function MoneyDisplay({ cents, positive, className = '' }: { cents: number; positive?: boolean; className?: string }) {
  const formatted = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)
  return <span className={classes('money-display', positive && 'money-positive', className)}>{formatted}</span>
}

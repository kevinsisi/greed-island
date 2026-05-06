import { type ReactNode } from 'react'

interface PageHeaderProps {
  eyebrow: string
  title: string
  description?: string
  actions?: ReactNode
}

export function PageHeader({ eyebrow, title, description, actions }: PageHeaderProps) {
  return (
    <div className="mb-6 lg:mb-8 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <div className="font-display text-[11px] uppercase tracking-tightest text-ember-500 mb-1.5">
          {eyebrow}
        </div>
        <h1 className="font-display font-extrabold text-2xl lg:text-3xl tracking-tightest text-ground-100">
          {title}
        </h1>
        {description && (
          <p className="mt-2 text-sm text-ground-400 max-w-2xl leading-relaxed">{description}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}

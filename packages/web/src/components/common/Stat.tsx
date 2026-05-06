interface StatProps {
  label: string
  value: string | number
  hint?: string
  tone?: 'neutral' | 'ember' | 'moss' | 'rust'
}

const TONE_CLASS: Record<NonNullable<StatProps['tone']>, string> = {
  neutral: 'text-ground-100',
  ember: 'text-ember-400',
  moss: 'text-moss-400',
  rust: 'text-rust-500',
}

export function Stat({ label, value, hint, tone = 'neutral' }: StatProps) {
  return (
    <div className="gi-panel p-4 lg:p-5 flex flex-col gap-1">
      <span className="font-display text-[11px] uppercase tracking-tightest text-ground-500">
        {label}
      </span>
      <span className={`font-display font-extrabold text-2xl lg:text-3xl tracking-tightest ${TONE_CLASS[tone]}`}>
        {value}
      </span>
      {hint && <span className="text-[11px] text-ground-500">{hint}</span>}
    </div>
  )
}

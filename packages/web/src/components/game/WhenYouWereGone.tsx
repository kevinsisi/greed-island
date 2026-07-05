import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, type PlayerNeedsState, type ServerCatchUpSummary } from '../../api/client'
import {
  buildActionButtons,
  formatDecaySummary,
  selectNarrativeItems,
  ticksToHoursLabel,
  wygHasContent,
} from './whenYouWereGoneLogic'

type WhenYouWereGoneProps = {
  token: string
  onDismiss: () => void
}

export function WhenYouWereGone({ token, onDismiss }: WhenYouWereGoneProps) {
  const navigate = useNavigate()
  const [world, setWorld] = useState<ServerCatchUpSummary | null>(null)
  const [needs, setNeeds] = useState<PlayerNeedsState | null>(null)
  const [loading, setLoading] = useState(true)
  const [hasContent, setHasContent] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.allSettled([
      api.worldSinceLastVisit(token),
      api.playerNeeds(token),
    ]).then(([worldResult, needsResult]) => {
      if (cancelled) return
      const w = worldResult.status === 'fulfilled' ? worldResult.value.summary : null
      const n = needsResult.status === 'fulfilled' ? needsResult.value : null
      setWorld(w)
      setNeeds(n)
      setHasContent(wygHasContent(w, n))
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [token])

  const hoursLabel = useMemo(
    () => (world ? ticksToHoursLabel(world.sinceTick, world.untilTick) : null),
    [world],
  )
  const narrativeItems = useMemo(() => selectNarrativeItems(world), [world])
  const decaySummary = useMemo(() => formatDecaySummary(needs), [needs])
  const actionButtons = useMemo(
    () => buildActionButtons(narrativeItems, needs),
    [narrativeItems, needs],
  )

  if (loading || !hasContent) return null

  return (
    <div
      role="status"
      aria-label="你離開時發生的事"
      className="mx-2 mt-0 gi-panel border-ember-700/60 p-4 flex flex-col gap-3"
    >
      <header>
        <div className="gi-eyebrow">你不在的時候</div>
        <h2 className="font-display font-extrabold text-xl tracking-tightest text-ember-300 leading-tight">
          你離開的{hoursLabel}裡
        </h2>
      </header>

      {narrativeItems.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {narrativeItems.map((item, idx) => (
            <li key={idx} className="text-[13px] text-ground-200 leading-snug">
              {item.sentence}
            </li>
          ))}
        </ul>
      )}

      {decaySummary && (
        <p className="text-[13px] text-rust-300 leading-snug">{decaySummary}</p>
      )}

      <div className="flex flex-wrap gap-2 mt-1">
        {actionButtons.map((btn, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => {
              if (btn.kind === 'navigate' && btn.tileId) {
                navigate(`/area/${btn.tileId}`)
              }
              onDismiss()
            }}
            className={`gi-touch px-3 py-1.5 text-[11px] font-display tracking-eyebrow uppercase rounded-sharp transition-colors border ${
              btn.kind === 'navigate'
                ? 'border-ember-600 bg-ember-500/10 text-ember-300 hover:bg-ember-500/20 hover:border-ember-500'
                : btn.kind === 'eat'
                  ? 'border-tide-700 bg-tide-500/10 text-tide-300 hover:bg-tide-500/20'
                  : 'border-ground-700 text-ground-400 hover:border-ground-500 hover:text-ground-300'
            }`}
          >
            {btn.label}
          </button>
        ))}
      </div>
    </div>
  )
}

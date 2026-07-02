// SP1 — Player Survival HUD.
// Shows nourishment (溫飽) and vigor (體況) bars with danger pulse when
// below starvation threshold. Collapsed state shows an explicit "倒下" notice.
// Eat button spends 10 gold to restore nourishment.
// Design tokens: .gi-panel, font-data, ember/rust/tide, rounded-sharp, .gi-touch.

import { useCallback, useEffect, useRef, useState } from 'react'
import { api, type PlayerNeedsState } from '../../api/client'

// Mirror SP1 constants (server/config/world.ts) — frontend display only
const DANGER_THRESHOLD = 25
const EAT_GOLD_COST = 10

function statusText(needs: PlayerNeedsState): string {
  if (needs.collapsed) return '你已倒下。補充食糧才能恢復體況。'
  if (needs.vigor < DANGER_THRESHOLD) return '體況危急！立即進食以挽救局勢。'
  if (needs.nourishment < DANGER_THRESHOLD) return '你飢腸轆轆，體況正在下滑。'
  if (needs.nourishment > 60) return '你的狀態良好，繼續探索吧。'
  return '需求平衡，留意補給不要拖太久。'
}

type NeedBarProps = {
  label: string
  value: number
  danger: boolean
}

function NeedBar({ label, value, danger }: NeedBarProps) {
  const pct = Math.max(0, Math.min(100, Math.round(value)))
  const barColor = danger
    ? 'bg-rust-500'
    : value > 60
    ? 'bg-ember-500'
    : 'bg-tide-500'

  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] font-display uppercase tracking-eyebrow text-ground-400 w-10 shrink-0">
        {label}
      </span>
      <div className="flex-1 h-2 bg-ground-700 rounded-sharp overflow-hidden">
        <div
          className={`h-full rounded-sharp transition-all duration-500 ${barColor} ${danger ? 'animate-pulse' : ''}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={`font-data text-[11px] tabular-nums w-7 text-right shrink-0 ${danger ? 'text-rust-400' : 'text-ground-300'}`}>
        {pct}
      </span>
    </div>
  )
}

type SurvivalHudProps = {
  token: string
  tick: number
}

export function SurvivalHud({ token, tick }: SurvivalHudProps) {
  const [needs, setNeeds] = useState<PlayerNeedsState | null>(null)
  const [eating, setEating] = useState(false)
  const [eatError, setEatError] = useState<string | null>(null)
  const lastTickRef = useRef<number>(-1)

  const fetchNeeds = useCallback(() => {
    api.playerNeeds(token).then(setNeeds).catch(() => {})
  }, [token])

  // Fetch on mount and when tick advances
  useEffect(() => {
    if (tick !== lastTickRef.current) {
      lastTickRef.current = tick
      fetchNeeds()
    }
  }, [tick, fetchNeeds])

  // Also fetch on mount immediately
  useEffect(() => {
    fetchNeeds()
  }, [fetchNeeds])

  const handleEat = useCallback(async () => {
    if (eating) return
    setEating(true)
    setEatError(null)
    try {
      const result = await api.eatRation(token)
      if (result.accepted) {
        setNeeds(result.needs)
      }
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message ?? '進食失敗'
      setEatError(msg.includes('INSUFFICIENT_GOLD') ? `金幣不足（需 ${EAT_GOLD_COST} 枚）` : msg)
    } finally {
      setEating(false)
    }
  }, [token, eating])

  if (!needs) {
    return (
      <div className="gi-panel px-3 py-2 text-ground-500 text-[11px] font-data">
        載入求生狀態…
      </div>
    )
  }

  const nourishmentDanger = needs.nourishment < DANGER_THRESHOLD
  const vigorDanger = needs.vigor < DANGER_THRESHOLD

  return (
    <div className={`gi-panel px-3 py-2 flex flex-col gap-2 ${needs.collapsed ? 'border-rust-600/60' : ''}`}>
      <div className="flex items-center justify-between">
        <span className="gi-eyebrow">求生處境</span>
        {needs.collapsed && (
          <span className="text-[10px] font-display uppercase tracking-eyebrow text-rust-400 animate-pulse">
            ✕ 已倒下
          </span>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <NeedBar label="溫飽" value={needs.nourishment} danger={nourishmentDanger} />
        <NeedBar label="體況" value={needs.vigor} danger={vigorDanger} />
      </div>

      <p className={`text-[11px] leading-relaxed ${needs.collapsed ? 'text-rust-400' : nourishmentDanger || vigorDanger ? 'text-rust-400' : 'text-ground-400'}`}>
        {statusText(needs)}
      </p>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleEat}
          disabled={eating}
          className="gi-touch flex-1 px-3 py-1.5 text-[11px] font-display tracking-eyebrow uppercase bg-ground-700 hover:bg-ember-500/20 border border-ground-600 hover:border-ember-600 rounded-sharp text-ground-300 hover:text-ember-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {eating ? '進食中…' : `進食 −${EAT_GOLD_COST} 金`}
        </button>
        {eatError && (
          <span className="text-[10px] text-rust-400 flex-1 truncate">{eatError}</span>
        )}
      </div>
    </div>
  )
}

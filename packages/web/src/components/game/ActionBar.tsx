import { useCallback, useState } from 'react'
import { api, type PlayerNeedsState } from '../../api/client'

const EAT_GOLD_COST = 10

type ActionBarProps = {
  token: string | null
  currentDistrictName: string | null
  canEnter: boolean
  onEnterArea: () => void
  onEatSuccess?: (needs: PlayerNeedsState) => void
}

export function ActionBar({ token, currentDistrictName, canEnter, onEnterArea, onEatSuccess }: ActionBarProps) {
  const [eating, setEating] = useState(false)
  const [eatError, setEatError] = useState<string | null>(null)

  const handleEat = useCallback(async () => {
    if (!token || eating) return
    setEating(true)
    setEatError(null)
    try {
      const result = await api.eatRation(token)
      if (result.accepted) onEatSuccess?.(result.needs)
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message ?? '進食失敗'
      setEatError(msg.includes('INSUFFICIENT_GOLD') ? `金幣不足（需 ${EAT_GOLD_COST} 枚）` : msg)
    } finally {
      setEating(false)
    }
  }, [token, eating, onEatSuccess])

  return (
    <>
      {/* Mobile: fixed bottom bar */}
      <div
        className="sm:hidden fixed bottom-0 inset-x-0 z-20 flex items-stretch h-14 gap-2 px-2 py-2 border-t border-ground-700 bg-ground-900/95"
        role="toolbar"
        aria-label="主要動作"
      >
        <ActionButtons
          canEnter={canEnter}
          currentDistrictName={currentDistrictName}
          onEnterArea={onEnterArea}
          token={token}
          eating={eating}
          eatError={eatError}
          onEat={handleEat}
        />
      </div>

      {/* Desktop: inline below map */}
      <div
        className="hidden sm:flex items-stretch h-14 gap-2 px-0 py-2 border-t border-ground-700"
        role="toolbar"
        aria-label="主要動作"
      >
        <ActionButtons
          canEnter={canEnter}
          currentDistrictName={currentDistrictName}
          onEnterArea={onEnterArea}
          token={token}
          eating={eating}
          eatError={eatError}
          onEat={handleEat}
        />
      </div>
    </>
  )
}

type ActionButtonsProps = {
  canEnter: boolean
  currentDistrictName: string | null
  onEnterArea: () => void
  token: string | null
  eating: boolean
  eatError: string | null
  onEat: () => void
}

function ActionButtons({ canEnter, currentDistrictName, onEnterArea, token, eating, eatError, onEat }: ActionButtonsProps) {
  return (
    <>
      {/* 進入區域 */}
      <button
        type="button"
        onClick={onEnterArea}
        disabled={!canEnter}
        className="gi-touch flex-1 flex flex-col items-center justify-center gap-0 border-2 border-ember-500 rounded-sharp text-ember-100 bg-ground-900 hover:bg-ember-500/15 hover:border-ember-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <span className="font-display text-[8px] uppercase tracking-tightest text-ember-400 leading-tight">
          {currentDistrictName ? '目前區域' : '進入區域'}
        </span>
        <span className="font-display font-bold text-[11px] tracking-tightest leading-tight">
          {currentDistrictName ? `→ ${currentDistrictName}` : '走近一個區域'}
        </span>
      </button>

      {/* 進食 */}
      {token && (
        <button
          type="button"
          onClick={onEat}
          disabled={eating}
          title={eatError ?? undefined}
          className="gi-touch w-16 sm:w-20 flex flex-col items-center justify-center gap-0 border border-ground-600 rounded-sharp bg-ground-900 text-ground-300 hover:bg-ember-500/10 hover:border-ember-700 hover:text-ember-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <span className="font-display text-[8px] uppercase tracking-tightest leading-tight">
            {eating ? '…' : '進食'}
          </span>
          <span className="font-data text-[10px] tabular-nums leading-tight text-ground-500">
            −{EAT_GOLD_COST}金
          </span>
        </button>
      )}

      {/* … placeholder */}
      <button
        type="button"
        className="gi-touch w-10 flex items-center justify-center border border-ground-700 rounded-sharp text-ground-500 hover:border-ground-500 hover:text-ground-400 transition-colors"
        aria-label="更多動作"
      >
        <span className="font-display text-sm">…</span>
      </button>
    </>
  )
}

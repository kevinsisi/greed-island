// 區域頁的紋卡面板。職責：
//   1. 輪詢 /api/cards/active?tileId=... 與 /api/cards/held
//   2. 暴露給 AreaPage 兩件事：
//      - 給 Phaser 用的 drops 陣列（含 ticksRemaining）
//      - 一個 React 區塊，列出地上卡 + 手上卡 + 收入紋典 / 釋放按鈕
//   3. 提供 pickupDrop callback 供 Phaser 點擊或鍵盤 E 觸發

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  api,
  ApiError,
  type ServerCardDrop,
  type ServerCardCatalogEntry,
  type ServerCardSlotType
} from '../../api/client'
import { useAuth } from '../../state/AuthContext'
import { useI18n } from '../../i18n'
import { useWorldState } from '../../state/WorldStateContext'
import type { AreaMapDrop } from '../../game/AreaScene'

// 5 秒一 tick；前端以 4 秒 poll，跟 server tick 大致對齊
const POLL_MS = 4_000

export interface UseAreaCardsResult {
  drops: AreaMapDrop[]
  panel: React.ReactNode
  /** 給 Phaser 鍵盤/點擊呼叫的 pickup 觸發。實作會做樂觀 UI。 */
  pickupDrop: (dropId: number) => void
}

export function useAreaCards(tileId: string): UseAreaCardsResult {
  const { token, account } = useAuth()
  const { t } = useI18n()
  const { cards: catalog } = useWorldState()
  const [active, setActive] = useState<{ tick: number; drops: ServerCardDrop[] }>({ tick: 0, drops: [] })
  const [held, setHeld] = useState<ServerCardDrop[]>([])
  const [flash, setFlash] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // wall-clock 的 anchor，用於每秒重繪倒數
  const [, forceTick] = useState(0)
  const lastFetchedAt = useRef<number>(Date.now())

  // 每秒重繪 (倒數動畫)
  useEffect(() => {
    const id = window.setInterval(() => forceTick((n) => (n + 1) % 1_000_000), 1000)
    return () => window.clearInterval(id)
  }, [])

  const refresh = useCallback(async () => {
    if (!token || !tileId) return
    try {
      const [a, h] = await Promise.all([api.cardsActive(token, tileId), api.cardsHeld(token)])
      setActive({ tick: a.tick, drops: a.drops })
      setHeld(h.drops)
      lastFetchedAt.current = Date.now()
      setError(null)
    } catch (err) {
      if (err instanceof ApiError) setError(err.message)
      else if (err instanceof Error) setError(err.message)
    }
  }, [token, tileId])

  useEffect(() => {
    void refresh()
    const id = window.setInterval(refresh, POLL_MS)
    return () => window.clearInterval(id)
  }, [refresh])

  const pickupDrop = useCallback(
    async (dropId: number) => {
      if (!token) {
        setError(t('cards.loginGate'))
        return
      }
      try {
        const r = await api.cardsPickup(token, dropId)
        setFlash(t('cards.pickedUpFlash', { cardId: r.drop.cardId }))
        // 樂觀更新：把 drop 從 active 移走，加進 held
        setActive((prev) => ({ ...prev, drops: prev.drops.filter((d) => d.id !== dropId) }))
        setHeld((prev) => [...prev, r.drop])
      } catch (err) {
        if (err instanceof ApiError) setError(err.message)
        else setError(t('cards.errorGeneric'))
      }
    },
    [token, t]
  )

  const storeDrop = useCallback(
    async (dropId: number, slotType: ServerCardSlotType) => {
      if (!token) return
      try {
        const r = await api.cardsStore(token, dropId, slotType)
        setFlash(
          t('cards.storedFlash', {
            slot:
              r.codex.slotType === 'sequencing'
                ? `定序 #${r.codex.slotIndex}`
                : `隨攜 #${r.codex.slotIndex}`
          })
        )
        setHeld((prev) => prev.filter((d) => d.id !== dropId))
      } catch (err) {
        if (err instanceof ApiError) setError(err.message)
        else setError(t('cards.errorGeneric'))
      }
    },
    [token, t]
  )

  const releaseDrop = useCallback(
    async (dropId: number) => {
      if (!token) return
      try {
        const r = await api.cardsRelease(token, dropId)
        setHeld((prev) => prev.filter((d) => d.id !== dropId))
        setActive((prev) => ({ ...prev, drops: [...prev.drops, r.drop] }))
      } catch (err) {
        if (err instanceof ApiError) setError(err.message)
        else setError(t('cards.errorGeneric'))
      }
    },
    [token, t]
  )

  const catalogById = useMemo(() => {
    const m = new Map<number, { rank: string; name: string }>()
    for (const c of catalog) {
      m.set(c.id, { rank: c.rank, name: c.name })
    }
    return m
  }, [catalog])

  // 給 Phaser 用的 AreaMapDrop[]：只看 available 狀態 (held 不在地圖)
  const phaserDrops = useMemo<AreaMapDrop[]>(() => {
    return active.drops
      .filter((d) => d.state === 'available')
      .map((d) => {
        const c = catalogById.get(d.cardId)
        return {
          id: d.id,
          cardId: d.cardId,
          rank: c?.rank ?? 'H',
          x: d.x,
          y: d.y,
          ticksRemaining: Math.max(0, d.expiresAtTick - active.tick)
        }
      })
  }, [active, catalogById])

  // server tick → wall-clock 秒
  const tickDurationMs = 5_000
  const serverTickAtFetch = active.tick
  const fetchedAtMs = lastFetchedAt.current

  function ticksToSeconds(deadlineTick: number | null): number {
    if (deadlineTick === null) return 0
    const elapsedSinceFetchSec = (Date.now() - fetchedAtMs) / 1000
    const ticksLeftAtFetch = deadlineTick - serverTickAtFetch
    const secLeft = ticksLeftAtFetch * (tickDurationMs / 1000) - elapsedSinceFetchSec
    return Math.max(0, Math.floor(secLeft))
  }

  const heldRows = held.filter((d) => d.holderAccountId === (account?.id ?? -1))

  const panel = (
    <CardSection
      tileId={tileId}
      drops={active.drops.filter((d) => d.state === 'available')}
      held={heldRows}
      catalogById={catalogById}
      onPickup={pickupDrop}
      onStore={storeDrop}
      onRelease={releaseDrop}
      ticksToSeconds={ticksToSeconds}
      flash={flash}
      error={error}
      dismissFlash={() => setFlash(null)}
      dismissError={() => setError(null)}
    />
  )

  return { drops: phaserDrops, panel, pickupDrop }
}

interface CardSectionProps {
  tileId: string
  drops: ServerCardDrop[]
  held: ServerCardDrop[]
  catalogById: Map<number, { rank: string; name: string }>
  onPickup: (dropId: number) => void
  onStore: (dropId: number, slotType: ServerCardSlotType) => void
  onRelease: (dropId: number) => void
  ticksToSeconds: (deadlineTick: number | null) => number
  flash: string | null
  error: string | null
  dismissFlash: () => void
  dismissError: () => void
}

function CardSection({
  drops,
  held,
  catalogById,
  onPickup,
  onStore,
  onRelease,
  ticksToSeconds,
  flash,
  error,
  dismissFlash,
  dismissError
}: CardSectionProps) {
  const { t } = useI18n()
  const { account } = useAuth()

  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-display text-[11px] uppercase tracking-tightest text-ground-400">
        {t('cards.dropTitle')}
      </h2>

      {flash && (
        <button
          type="button"
          onClick={dismissFlash}
          className="self-start gi-panel border-ember-700/60 px-3 py-2 text-[12px] text-ember-200"
        >
          {flash} ×
        </button>
      )}
      {error && (
        <button
          type="button"
          onClick={dismissError}
          className="self-start gi-panel border-rust-700 px-3 py-2 text-[12px] text-rust-300"
        >
          {error} ×
        </button>
      )}

      {!account && (
        <div className="gi-panel p-4 text-sm text-ground-300">{t('cards.loginGate')}</div>
      )}

      {drops.length === 0 ? (
        <div className="gi-panel p-4 text-sm text-ground-500 italic">{t('cards.dropEmpty')}</div>
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {drops.map((d) => {
            const c = catalogById.get(d.cardId)
            const secLeft = ticksToSeconds(d.expiresAtTick)
            return (
              <li key={d.id} className="gi-panel p-4 flex flex-col gap-2">
                <div className="flex items-center gap-3">
                  <span className="w-10 h-10 inline-flex items-center justify-center rounded-sharp border border-ember-600/60 bg-ground-900 text-[15px] text-ember-300 font-display font-extrabold">
                    {c?.rank ?? '?'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="font-display font-extrabold text-base text-ground-100 truncate">
                      {c?.name ?? `#${d.cardId}`}
                    </div>
                    <div className="text-[11px] font-display uppercase tracking-tightest text-ground-500">
                      #{String(d.cardId).padStart(3, '0')} ·{' '}
                      {t('cards.expiresIn', { seconds: secLeft })}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onPickup(d.id)}
                  disabled={!account}
                  className="gi-touch px-3 text-[11px] font-display uppercase tracking-tightest text-ember-300 border border-ember-700 hover:bg-ember-500/10 rounded-sharp disabled:opacity-50"
                >
                  {t('cards.pickup')}
                </button>
              </li>
            )
          })}
        </ul>
      )}

      <h2 className="font-display text-[11px] uppercase tracking-tightest text-ground-400 mt-2">
        {t('cards.heldHeading')}
      </h2>
      {held.length === 0 ? (
        <div className="gi-panel p-4 text-sm text-ground-500 italic">{t('cards.heldEmpty')}</div>
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {held.map((d) => {
            const c = catalogById.get(d.cardId)
            const secLeft = ticksToSeconds(d.storeDeadlineTick)
            return (
              <li key={d.id} className="gi-panel border-ember-700/40 p-4 flex flex-col gap-2">
                <div className="flex items-center gap-3">
                  <span className="w-10 h-10 inline-flex items-center justify-center rounded-sharp border border-ember-600/60 bg-ember-500/10 text-[15px] text-ember-300 font-display font-extrabold">
                    {c?.rank ?? '?'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="font-display font-extrabold text-base text-ground-100 truncate">
                      {c?.name ?? `#${d.cardId}`}
                    </div>
                    <div className="text-[11px] font-display uppercase tracking-tightest text-ember-300">
                      {t('cards.holdingTimer', { seconds: secLeft })}
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => onStore(d.id, 'sequencing')}
                    className="gi-touch px-3 text-[11px] font-display uppercase tracking-tightest text-ember-300 border border-ember-700 hover:bg-ember-500/10 rounded-sharp"
                  >
                    {t('cards.storeSequencing', { slot: d.cardId })}
                  </button>
                  <button
                    type="button"
                    onClick={() => onStore(d.id, 'carry')}
                    className="gi-touch px-3 text-[11px] font-display uppercase tracking-tightest text-moss-300 border border-moss-700 hover:bg-moss-500/10 rounded-sharp"
                  >
                    {t('cards.storeCarry')}
                  </button>
                  <button
                    type="button"
                    onClick={() => onRelease(d.id)}
                    className="gi-touch px-3 text-[11px] font-display uppercase tracking-tightest text-ground-300 border border-ground-700 hover:bg-ground-800 rounded-sharp"
                  >
                    {t('cards.release')}
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

// 預留 export 給其他元件需要 catalog entry helpers
export type { ServerCardCatalogEntry }

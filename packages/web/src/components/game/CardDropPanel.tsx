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
import { CardImage } from './CardImage'
import { cardPerceivedSeconds } from '../../state/cardPerception'

// 5 秒一 tick；前端以 4 秒 poll，跟 server tick 大致對齊
const POLL_MS = 4_000

export interface UseAreaCardsResult {
  drops: AreaMapDrop[]
  panel: React.ReactNode
  /** 給 Phaser 鍵盤/點擊呼叫的 pickup 觸發。實作會做樂觀 UI。 */
  pickupDrop: (dropId: number) => void
}

export function useAreaCards(tileId: string): UseAreaCardsResult {
  const { accountId, account } = useAuth()
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
    if (!accountId || !tileId) return
    try {
      const [a, h] = await Promise.all([api.cardsActive(accountId, tileId), api.cardsHeld(accountId)])
      setActive({ tick: a.tick, drops: a.drops })
      setHeld(h.drops)
      lastFetchedAt.current = Date.now()
      setError(null)
    } catch (err) {
      if (err instanceof ApiError) setError(err.message)
      else if (err instanceof Error) setError(err.message)
    }
  }, [accountId, tileId])

  useEffect(() => {
    void refresh()
    const id = window.setInterval(refresh, POLL_MS)
    return () => window.clearInterval(id)
  }, [refresh])

  const pickupDrop = useCallback(
    async (dropId: number) => {
      if (!accountId) {
        setError(t('cards.loginGate'))
        return
      }
      try {
        const r = await api.cardsPickup(accountId, dropId)
        setFlash(t('cards.pickedUpFlash', { cardId: r.drop.cardId }))
        // 樂觀更新：把 drop 從 active 移走，加進 held
        setActive((prev) => ({ ...prev, drops: prev.drops.filter((d) => d.id !== dropId) }))
        setHeld((prev) => [...prev, r.drop])
      } catch (err) {
        if (err instanceof ApiError) setError(err.message)
        else setError(t('cards.errorGeneric'))
      }
    },
    [accountId, t]
  )

  const storeDrop = useCallback(
    async (dropId: number, slotType: ServerCardSlotType) => {
      if (!accountId) return
      try {
        const r = await api.cardsStore(accountId, dropId, slotType)
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
    [accountId, t]
  )

  const releaseDrop = useCallback(
    async (dropId: number) => {
      if (!accountId) return
      try {
        const r = await api.cardsRelease(accountId, dropId)
        setHeld((prev) => prev.filter((d) => d.id !== dropId))
        setActive((prev) => ({ ...prev, drops: [...prev.drops, r.drop] }))
      } catch (err) {
        if (err instanceof ApiError) setError(err.message)
        else setError(t('cards.errorGeneric'))
      }
    },
    [accountId, t]
  )

  const catalogById = useMemo(() => {
    const m = new Map<number, { rank: string; name: string; imageUrl?: string }>()
    for (const c of catalog) {
      m.set(c.id, { rank: c.rank, name: c.name, ...(c.imageUrl ? { imageUrl: c.imageUrl } : {}) })
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
          rank: c?.rank ?? 'D',
          x: d.x,
          y: d.y,
          ticksRemaining: Math.max(0, d.expiresAtTick - active.tick)
        }
      })
  }, [active, catalogById])

  // Only smooth the server's own perception. Unknown energy/perception stays unavailable.
  const fetchedAtMs = lastFetchedAt.current

  function ticksToSeconds(
    deadlineTick: number | null,
    perceived?: number | null
  ): number | null {
    return deadlineTick === null ? null : cardPerceivedSeconds(perceived, (Date.now() - fetchedAtMs) / 1000)
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
  catalogById: Map<number, { rank: string; name: string; imageUrl?: string }>
  onPickup: (dropId: number) => void
  onStore: (dropId: number, slotType: ServerCardSlotType) => void
  onRelease: (dropId: number) => void
  ticksToSeconds: (deadlineTick: number | null, perceived?: number | null) => number | null
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
            const secLeft = ticksToSeconds(d.expiresAtTick, d.perceivedSecondsLeft)
            return (
              <li key={d.id} className="gi-panel p-4 flex flex-col gap-2">
                <div className="flex items-center gap-3">
                  <CardImage
                    {...(c?.imageUrl ? { imageUrl: c.imageUrl } : {})}
                    rank={c?.rank ?? 'D'}
                    nameZh={c?.name ?? `#${d.cardId}`}
                    cardId={d.cardId}
                    className="w-10 h-10 rounded-sharp"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-display font-extrabold text-base text-ground-100 truncate">
                      {c?.name ?? `#${d.cardId}`}
                    </div>
                    <div className="text-[11px] font-display uppercase tracking-tightest text-ground-500">
                      #{String(d.cardId).padStart(3, '0')} ·{' '}
                      {secLeft === null ? '精力／倒數感知暫不可用' : t('cards.expiresIn', { seconds: secLeft })}
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
            const secLeft = ticksToSeconds(d.storeDeadlineTick, d.perceivedSecondsLeft)
            return (
              <li key={d.id} className="gi-panel border-ember-700/40 p-4 flex flex-col gap-2">
                <div className="flex items-center gap-3">
                  <CardImage
                    {...(c?.imageUrl ? { imageUrl: c.imageUrl } : {})}
                    rank={c?.rank ?? 'D'}
                    nameZh={c?.name ?? `#${d.cardId}`}
                    cardId={d.cardId}
                    className="w-10 h-10 rounded-sharp"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-display font-extrabold text-base text-ground-100 truncate">
                      {c?.name ?? `#${d.cardId}`}
                    </div>
                    <div className="text-[11px] font-display uppercase tracking-tightest text-ember-300">
                      {secLeft === null ? '精力／倒數感知暫不可用' : t('cards.holdingTimer', { seconds: secLeft })}
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

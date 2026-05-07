// 紋卡交易提議的 modal。給 NearbyPlayers / SocialPage 共用。
//
// 流程：
//   1. 開啟時讀我的 codex（取得我可以提供的卡）
//   2. 選一張我的卡 + 輸入想換的對方卡編號
//   3. POST /api/trade/propose

import { useCallback, useEffect, useMemo, useState } from 'react'
import { api, ApiError, type ServerCodexEntry } from '../../api/client'
import { useAuth } from '../../state/AuthContext'
import { useI18n } from '../../i18n'
import { useWorldState } from '../../state/WorldStateContext'

export interface TradeModalProps {
  targetUserId: number
  targetName: string
  onClose: () => void
  onProposed?: () => void
}

export function TradeModal({ targetUserId, targetName, onClose, onProposed }: TradeModalProps) {
  const { t } = useI18n()
  const { token } = useAuth()
  const { cards } = useWorldState()
  const [myCodex, setMyCodex] = useState<ServerCodexEntry[]>([])
  const [selectedCodexId, setSelectedCodexId] = useState<number | null>(null)
  const [requestedCard, setRequestedCard] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    if (!token) return
    api
      .codex(token)
      .then((r) => {
        if (cancelled) return
        setMyCodex(r.entries)
        if (r.entries.length > 0 && selectedCodexId === null) {
          setSelectedCodexId(r.entries[0]!.id)
        }
      })
      .catch((err) => {
        if (cancelled) return
        if (err instanceof ApiError) setError(err.message)
        else if (err instanceof Error) setError(err.message)
      })
    return () => {
      cancelled = true
    }
  }, [token, selectedCodexId])

  const catalogById = useMemo(() => {
    const m = new Map<number, { name: string; rank: string }>()
    for (const c of cards) m.set(c.id, { name: c.name, rank: c.rank })
    return m
  }, [cards])

  const propose = useCallback(async () => {
    if (!token) return
    if (selectedCodexId === null) {
      setError(t('trade.offeredEmpty'))
      return
    }
    const requested = Number.parseInt(requestedCard, 10)
    if (!Number.isFinite(requested) || requested < 1 || requested > 100) {
      setError(t('trade.requestedCardPlaceholder'))
      return
    }
    setSubmitting(true)
    try {
      await api.tradePropose(token, targetUserId, selectedCodexId, requested)
      onProposed?.()
      onClose()
    } catch (err) {
      if (err instanceof ApiError) setError(err.message)
      else if (err instanceof Error) setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }, [token, selectedCodexId, requestedCard, targetUserId, onProposed, onClose, t])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="gi-panel max-w-md w-full p-5 flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        <header>
          <div className="font-display text-[10px] uppercase tracking-tightest text-ember-500">
            {t('trade.eyebrow')}
          </div>
          <h2 className="font-display font-extrabold text-xl text-ground-100">
            {t('trade.modalTitle', { name: targetName })}
          </h2>
        </header>

        {error && (
          <button
            type="button"
            onClick={() => setError(null)}
            className="self-start gi-panel border-rust-700 px-3 py-2 text-[12px] text-rust-300"
          >
            {error} ×
          </button>
        )}

        <div className="flex flex-col gap-2">
          <label className="font-display text-[11px] uppercase tracking-tightest text-ground-400">
            {t('trade.iOffer')}
          </label>
          {myCodex.length === 0 ? (
            <div className="gi-panel p-3 text-[12px] text-ground-400 italic">
              {t('trade.offeredEmpty')}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-[160px] overflow-y-auto">
              {myCodex.map((e) => {
                const c = catalogById.get(e.cardId)
                const selected = selectedCodexId === e.id
                return (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => setSelectedCodexId(e.id)}
                    className={[
                      'p-2 border rounded-sharp text-left text-[11px] font-display tracking-tightest',
                      selected
                        ? 'border-ember-500 bg-ember-500/10 text-ember-200'
                        : 'border-ground-700 text-ground-300 hover:border-ground-500'
                    ].join(' ')}
                  >
                    <div className="text-[10px] uppercase">
                      #{String(e.cardId).padStart(3, '0')} · {c?.rank ?? '?'}
                    </div>
                    <div className="text-[12px] text-ground-100 truncate">
                      {c?.name ?? `card ${e.cardId}`}
                    </div>
                    <div className="text-[10px] uppercase text-ground-500">
                      {e.slotType === 'sequencing' ? '定序' : '隨攜'} · #{e.slotIndex}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <label className="font-display text-[11px] uppercase tracking-tightest text-ground-400">
            {t('trade.iWant')}
          </label>
          <input
            value={requestedCard}
            onChange={(e) => setRequestedCard(e.target.value.replace(/[^0-9]/g, ''))}
            placeholder={t('trade.requestedCardPlaceholder')}
            className="bg-ground-900 border border-ground-700 rounded-sharp px-3 py-2 text-sm text-ground-100 focus:border-ember-600 focus:outline-none"
          />
          {requestedCard && catalogById.has(Number.parseInt(requestedCard, 10)) && (
            <span className="text-[11px] text-ground-400">
              → {catalogById.get(Number.parseInt(requestedCard, 10))?.name}
            </span>
          )}
        </div>

        <div className="flex justify-between items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            className="gi-touch px-3 text-[11px] font-display uppercase tracking-tightest text-ground-400 hover:text-ground-100"
          >
            ×
          </button>
          <button
            type="button"
            onClick={propose}
            disabled={
              submitting || selectedCodexId === null || requestedCard.length === 0
            }
            className="gi-touch px-4 text-[11px] font-display uppercase tracking-tightest text-ember-300 border border-ember-700 hover:bg-ember-500/10 rounded-sharp disabled:opacity-60"
          >
            {submitting ? t('trade.proposing') : t('trade.proposeButton')}
          </button>
        </div>
      </div>
    </div>
  )
}

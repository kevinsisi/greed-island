import { useCallback, useEffect, useRef, useState } from 'react'
import { api, type PlayerCivilizationSnapshot, type ServerCardDrop } from '../../api/client'
import { useAuth } from '../../state/AuthContext'
import { useWorldState } from '../../state/WorldStateContext'
import { useI18n } from '../../i18n'

const ERROR_CLEAR_MS = 5_000

export interface PlayerCivilizationPanelProps {
  tileId: string | null
  onClose: () => void
}

interface ActionError {
  context: string
  message: string
}

function usePlayerCivState() {
  const { token } = useAuth()
  const [state, setState] = useState<PlayerCivilizationSnapshot | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!token) return
    setLoading(true)
    try {
      const snapshot = await api.playerState(token)
      setState(snapshot)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load player state')
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => { void refresh() }, [refresh])

  return { state, loading, error, refresh }
}

export function PlayerCivilizationPanel({ tileId, onClose }: PlayerCivilizationPanelProps) {
  const { token } = useAuth()
  const { t } = useI18n()
  const { npcs, world } = useWorldState()
  const { state, loading, refresh } = usePlayerCivState()

  const [selectedNpcId, setSelectedNpcId] = useState<string>('')
  const [heldCards, setHeldCards] = useState<ServerCardDrop[]>([])
  const [selectedCardId, setSelectedCardId] = useState<string>('')
  const [actionError, setActionError] = useState<ActionError | null>(null)
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!token) return
    api.cardsHeld(token).then((r) => setHeldCards(r.drops)).catch(() => {})
  }, [token])

  const showError = useCallback((context: string, message: string) => {
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current)
    setActionError({ context, message })
    errorTimerRef.current = setTimeout(() => setActionError(null), ERROR_CLEAR_MS)
  }, [])

  const clearError = useCallback(() => {
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current)
    setActionError(null)
  }, [])

  const submitAction = useCallback(async (
    context: string,
    type: string,
    payload: Record<string, unknown>
  ): Promise<boolean> => {
    if (!token) return false
    clearError()
    try {
      const result = await api.playerAction(token, type, payload)
      if (result.accepted) {
        await refresh()
        return true
      }
      showError(context, result.reason ?? 'Rejected')
      return false
    } catch (err) {
      showError(context, err instanceof Error ? err.message : 'Request failed')
      return false
    }
  }, [token, refresh, showError, clearError])

  const factionIds = (
    (world.facts?.factionEcologyStances as Array<{ factionId: string }> | undefined) ?? []
  ).map((s) => s.factionId)

  const nearbyNpcs = npcs.filter((n) => {
    const loc = n.location ?? n.targetTile
    return loc === tileId
  })
  const hireableNpcs = nearbyNpcs.filter(
    (n) => !state?.hiredNpcIds.includes(n.id)
  )

  const alreadyClaimed = tileId != null && (state?.claimedTileIds.includes(tileId) ?? false)

  return (
    <div className="gi-panel border-ground-700 p-4 mt-3 mx-2 flex flex-col gap-4 text-[13px] text-ground-200">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="font-display font-extrabold text-sm tracking-tightest text-ground-100">
          {t('playerCiv.panel_title')}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="text-ground-500 hover:text-ground-300 transition-colors text-xs"
        >
          {t('playerCiv.close')}
        </button>
      </div>

      {loading && !state && (
        <div className="text-ground-500 text-xs">{t('playerCiv.loading')}</div>
      )}

      {state && (
        <>
          {/* State summary */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="gi-panel border-ground-700/50 p-2">
              <div className="text-ground-500">{t('playerCiv.wallet')}</div>
              <div className="font-bold text-ember-300">{state.wallet}</div>
            </div>
            <div className="gi-panel border-ground-700/50 p-2">
              <div className="text-ground-500">{t('playerCiv.hired_npcs')}</div>
              <div className="font-bold text-ember-300">{state.hiredNpcIds.length}</div>
            </div>
            <div className="gi-panel border-ground-700/50 p-2">
              <div className="text-ground-500">{t('playerCiv.factions')}</div>
              <div className="font-bold text-ember-300">
                {state.factionIds.length > 0 ? state.factionIds.join(', ') : '—'}
              </div>
            </div>
            <div className="gi-panel border-ground-700/50 p-2">
              <div className="text-ground-500">{t('playerCiv.claimed_tiles')}</div>
              <div className="font-bold text-ember-300">{state.claimedTileIds.length}</div>
            </div>
          </div>

          {/* Claim tile */}
          <div className="flex flex-col gap-1">
            <button
              type="button"
              disabled={!tileId || alreadyClaimed}
              onClick={() => void submitAction('claim', 'PLAYER_CLAIMED_TERRITORY', { tileId: tileId! })}
              className="gi-touch px-3 py-1.5 bg-ground-800 border border-ground-600 rounded-sharp text-xs disabled:opacity-40 hover:enabled:border-ember-500 hover:enabled:text-ember-200 transition-colors"
            >
              {t('playerCiv.claim_tile')}
              {tileId ? ` (${tileId})` : ''}
            </button>
            {actionError?.context === 'claim' && (
              <span className="text-red-400 text-[11px]">{actionError.message}</span>
            )}
          </div>

          {/* Hire NPC */}
          <div className="flex flex-col gap-1">
            <div className="flex gap-2">
              <select
                value={selectedNpcId}
                onChange={(e) => setSelectedNpcId(e.target.value)}
                className="flex-1 bg-ground-800 border border-ground-600 rounded-sharp px-2 py-1 text-xs text-ground-200"
              >
                <option value="">{hireableNpcs.length > 0 ? t('playerCiv.hire_npc_select') : t('playerCiv.no_npcs')}</option>
                {hireableNpcs.map((n) => (
                  <option key={n.id} value={n.id}>{n.name}</option>
                ))}
              </select>
              <button
                type="button"
                disabled={!selectedNpcId}
                onClick={async () => {
                  const ok = await submitAction('hire', 'PLAYER_HIRED_NPC', { npcId: selectedNpcId, tileId: tileId ?? '' })
                  if (ok) setSelectedNpcId('')
                }}
                className="gi-touch px-3 py-1.5 bg-ground-800 border border-ground-600 rounded-sharp text-xs disabled:opacity-40 hover:enabled:border-ember-500 hover:enabled:text-ember-200 transition-colors"
              >
                {t('playerCiv.hire_npc')}
              </button>
            </div>
            {actionError?.context === 'hire' && (
              <span className="text-red-400 text-[11px]">{actionError.message}</span>
            )}
          </div>

          {/* Factions */}
          <div className="flex flex-col gap-1">
            {factionIds.length === 0 ? (
              <span className="text-ground-500 text-xs">{t('playerCiv.no_factions')}</span>
            ) : (
              factionIds.map((fid) => {
                const joined = state.factionIds.includes(fid)
                return (
                  <div key={fid} className="flex items-center justify-between gap-2">
                    <span className="text-xs text-ground-300 truncate">{fid}</span>
                    <button
                      type="button"
                      onClick={() => void submitAction(`faction-${fid}`, joined ? 'PLAYER_LEFT_FACTION' : 'PLAYER_JOINED_FACTION', { factionId: fid })}
                      className="gi-touch shrink-0 px-2 py-1 bg-ground-800 border border-ground-600 rounded-sharp text-xs hover:border-ember-500 hover:text-ember-200 transition-colors"
                    >
                      {joined ? t('playerCiv.leave_faction') : t('playerCiv.join_faction')}
                    </button>
                  </div>
                )
              })
            )}
            {actionError?.context?.startsWith('faction-') && (
              <span className="text-red-400 text-[11px]">{actionError.message}</span>
            )}
          </div>

          {/* Play card */}
          <div className="flex flex-col gap-1">
            <div className="flex gap-2">
              <select
                value={selectedCardId}
                onChange={(e) => setSelectedCardId(e.target.value)}
                className="flex-1 bg-ground-800 border border-ground-600 rounded-sharp px-2 py-1 text-xs text-ground-200"
              >
                <option value="">{t('playerCiv.play_card_select')}</option>
                {heldCards.map((c) => (
                  <option key={c.id} value={String(c.id)}>#{c.cardId} @ {c.tileId}</option>
                ))}
              </select>
              <button
                type="button"
                disabled={!selectedCardId || !tileId}
                onClick={async () => {
                  const ok = await submitAction('card', 'PLAYER_PLAYED_CARD', { cardId: Number(selectedCardId), tileId: tileId! })
                  if (ok) {
                    setSelectedCardId('')
                    if (token) api.cardsHeld(token).then((r) => setHeldCards(r.drops)).catch(() => {})
                  }
                }}
                className="gi-touch px-3 py-1.5 bg-ground-800 border border-ground-600 rounded-sharp text-xs disabled:opacity-40 hover:enabled:border-ember-500 hover:enabled:text-ember-200 transition-colors"
              >
                {t('playerCiv.play_card')}
              </button>
            </div>
            {actionError?.context === 'card' && (
              <span className="text-red-400 text-[11px]">{actionError.message}</span>
            )}
          </div>

        </>
      )}
    </div>
  )
}

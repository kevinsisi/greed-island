import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  api,
  ApiError,
  type ServerFriendDto,
  type ServerNearbyPlayer
} from '../../api/client'
import { useAuth } from '../../state/AuthContext'
import { useI18n } from '../../i18n'
import { TradeModal } from './TradeModal'

const PRESENCE_REFRESH_MS = 8_000

type Status = 'idle' | 'pending' | 'friend'

export function NearbyPlayers({ tileId, tileName }: { tileId: string; tileName: string }) {
  const { t } = useI18n()
  const { token, account } = useAuth()
  const [players, setPlayers] = useState<ServerNearbyPlayer[]>([])
  const [statusByPeer, setStatusByPeer] = useState<Record<number, Status>>({})
  const [active, setActive] = useState<ServerNearbyPlayer | null>(null)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()

  const refresh = useCallback(async () => {
    if (!token) {
      setPlayers([])
      return
    }
    try {
      // post our presence first so the server knows we're here
      await api.socialPresence(token, tileId)
      const r = await api.socialNearby(token, tileId)
      setPlayers(r.players)
      const friends = await api.socialFriends(token)
      const requests = await api.socialFriendRequests(token)
      const next: Record<number, Status> = {}
      for (const f of friends.friends) {
        const peerId = peerIdOf(f, account?.id ?? -1)
        if (peerId !== null) next[peerId] = 'friend'
      }
      for (const r of requests.outgoing) {
        if (next[r.addressee.id] === undefined) next[r.addressee.id] = 'pending'
      }
      setStatusByPeer(next)
      setError(null)
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message)
      } else if (err instanceof Error) {
        setError(err.message)
      }
    }
  }, [token, tileId, account?.id])

  useEffect(() => {
    void refresh()
    const timer = window.setInterval(refresh, PRESENCE_REFRESH_MS)
    return () => window.clearInterval(timer)
  }, [refresh])

  const handleAddFriend = useCallback(
    async (peerId: number) => {
      if (!token) return
      try {
        await api.socialFriendRequest(token, peerId)
        setStatusByPeer((prev) => ({ ...prev, [peerId]: 'pending' }))
      } catch (err) {
        if (err instanceof ApiError) setError(err.message)
      }
    },
    [token]
  )

  const handleMessage = useCallback(
    (peerId: number) => {
      navigate(`/social?peer=${peerId}`)
      setActive(null)
    },
    [navigate]
  )

  if (!token || !account) return null

  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-display text-[11px] uppercase tracking-tightest text-ground-400">
        {t('social.peerNearby')}
      </h2>
      {error && (
        <div className="gi-panel p-3 text-[12px] font-display uppercase tracking-tightest text-rust-400 border-rust-700">
          {error}
        </div>
      )}
      {players.length === 0 ? (
        <div className="gi-panel p-4 text-sm text-ground-500 italic">
          {t('hub.empty')}
        </div>
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {players.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => setActive(p)}
                className="w-full text-left gi-panel p-4 hover:border-ember-600 transition-colors flex items-center gap-3"
              >
                <span className="w-10 h-10 inline-flex items-center justify-center rounded-full border border-moss-600/60 bg-ground-900 text-[15px] text-moss-300 font-display font-extrabold">
                  {p.displayName.charAt(0).toUpperCase()}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="font-display font-extrabold text-base text-ground-100 truncate">
                    {p.displayName}
                  </div>
                  <div className="text-[11px] font-display uppercase tracking-tightest text-ground-500">
                    {t('social.peerCard.location', { tile: tileName })}
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      {active && (
        <PeerCardModal
          peer={active}
          tileName={tileName}
          status={statusByPeer[active.id] ?? 'idle'}
          onClose={() => setActive(null)}
          onAddFriend={() => handleAddFriend(active.id)}
          onMessage={() => handleMessage(active.id)}
        />
      )}
    </section>
  )
}

function PeerCardModal({
  peer,
  tileName,
  status,
  onClose,
  onAddFriend,
  onMessage,
}: {
  peer: ServerNearbyPlayer
  tileName: string
  status: Status
  onClose: () => void
  onAddFriend: () => void
  onMessage: () => void
}) {
  const { t } = useI18n()
  const [tradeOpen, setTradeOpen] = useState(false)
  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="gi-panel max-w-md w-full p-5 flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center gap-3">
          <span className="w-12 h-12 inline-flex items-center justify-center rounded-full border border-moss-600/60 bg-ground-900 text-[18px] text-moss-300 font-display font-extrabold">
            {peer.displayName.charAt(0).toUpperCase()}
          </span>
          <div className="flex-1 min-w-0">
            <div className="font-display text-[10px] uppercase tracking-tightest text-ember-500">
              {t('social.peerCard.profile')}
            </div>
            <div className="font-display font-extrabold text-xl text-ground-100 truncate">
              {peer.displayName}
            </div>
            <div className="text-[11px] font-display uppercase tracking-tightest text-ground-500">
              ID #{peer.id} · {t('social.peerCard.location', { tile: tileName })}
            </div>
          </div>
        </header>

        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={onMessage}
            className="gi-touch px-4 text-[12px] font-display uppercase tracking-tightest text-ember-300 border border-ember-700 hover:bg-ember-500/10 rounded-sharp"
          >
            {t('social.peerCard.message')}
          </button>
          {status === 'idle' && (
            <button
              type="button"
              onClick={onAddFriend}
              className="gi-touch px-4 text-[12px] font-display uppercase tracking-tightest text-moss-300 border border-moss-700 hover:bg-moss-500/10 rounded-sharp"
            >
              {t('social.peerCard.addFriend')}
            </button>
          )}
          {status === 'pending' && (
            <span className="gi-touch px-4 text-[12px] font-display uppercase tracking-tightest text-ground-400 border border-ground-700 rounded-sharp text-center">
              {t('social.peerCard.requestPending')}
            </span>
          )}
          {status === 'friend' && (
            <span className="gi-touch px-4 text-[12px] font-display uppercase tracking-tightest text-moss-300 border border-moss-700 rounded-sharp text-center">
              {t('social.peerCard.alreadyFriends')}
            </span>
          )}
          <button
            type="button"
            onClick={() => setTradeOpen(true)}
            className="gi-touch px-4 text-[12px] font-display uppercase tracking-tightest text-ember-300 border border-ember-700 hover:bg-ember-500/10 rounded-sharp"
          >
            {t('social.peerCard.trade')}
          </button>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="self-end gi-touch px-3 text-[11px] font-display uppercase tracking-tightest text-ground-400 hover:text-ground-100"
        >
          {t('npc.dialogClose')}
        </button>
      </div>
      {tradeOpen && (
        <TradeModal
          targetUserId={peer.id}
          targetName={peer.displayName}
          onClose={() => setTradeOpen(false)}
        />
      )}
    </div>
  )
}

function peerIdOf(f: ServerFriendDto, myId: number): number | null {
  if (f.peer) return f.peer.id
  if (f.requester.id === myId) return f.addressee.id
  if (f.addressee.id === myId) return f.requester.id
  return null
}

// Peer presence hook — used by AreaPage to keep the player's last-seen
// tile fresh and not just on initial mount. Exported here so the page
// can stay lean.
export function usePresenceTouch(tileId: string | null, position?: { x: number; y: number; z: number } | null): void {
  const { token } = useAuth()
  useEffect(() => {
    if (!token || !tileId) return
    void api.socialPresence(token, tileId, position).catch(() => {
      // ignore — best effort
    })
    const timer = window.setInterval(() => {
      void api.socialPresence(token, tileId, position).catch(() => undefined)
    }, PRESENCE_REFRESH_MS)
    return () => window.clearInterval(timer)
  }, [token, tileId, position?.x, position?.y, position?.z])
}

// Re-export for type narrowing in tests/devtools.
export { type ServerNearbyPlayer }

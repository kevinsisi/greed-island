import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  api,
  ApiError,
  socialStreamUrl,
  type ServerAllianceDto,
  type ServerConversationItem,
  type ServerFriendDto,
  type ServerFriendRequestList,
  type ServerMessageDto,
  type ServerPublicAccount
} from '../api/client'
import { useAuth } from '../state/AuthContext'
import { useI18n, type TranslationKey } from '../i18n'
import { PageHeader } from '../components/common/PageHeader'

type Tab = 'friends' | 'requests' | 'messages' | 'alliance'

export function SocialPage() {
  const { t } = useI18n()
  const { token, account } = useAuth()
  const [tab, setTab] = useState<Tab>('friends')
  const [friends, setFriends] = useState<ServerFriendDto[]>([])
  const [requests, setRequests] = useState<ServerFriendRequestList>({ incoming: [], outgoing: [] })
  const [conversations, setConversations] = useState<ServerConversationItem[]>([])
  const [alliance, setAlliance] = useState<ServerAllianceDto | null>(null)
  const [openPeer, setOpenPeer] = useState<ServerPublicAccount | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [allianceName, setAllianceName] = useState('')
  const [inviteId, setInviteId] = useState('')

  const loadAll = useCallback(async () => {
    if (!token) return
    try {
      const [f, r, c, a] = await Promise.all([
        api.socialFriends(token),
        api.socialFriendRequests(token),
        api.socialConversations(token),
        api.socialAlliance(token),
      ])
      setFriends(f.friends)
      setRequests(r)
      setConversations(c.conversations)
      setAlliance(a.alliance)
    } catch (err) {
      surface(err, t, setError)
    }
  }, [token, t])

  useEffect(() => {
    void loadAll()
  }, [loadAll])

  // SSE for live updates
  useEffect(() => {
    if (!token) return
    let stopped = false
    let source: EventSource | null = null
    let reconnect: number | null = null
    const connect = () => {
      if (stopped) return
      // EventSource doesn't support custom headers, so the social
      // stream accepts the JWT as a query parameter for SSE.
      try {
        source = new EventSource(`${socialStreamUrl()}?access_token=${encodeURIComponent(token)}`)
      } catch {
        return
      }
      const handler = (_e: MessageEvent) => {
        // any social event refreshes the relevant slice
        void loadAll()
      }
      ;[
        'friend.request',
        'friend.accepted',
        'friend.rejected',
        'friend.removed',
        'message.new',
        'presence.enter',
        'presence.leave',
        'alliance.invited',
      ].forEach((name) => source?.addEventListener(name, handler as EventListener))
      source.addEventListener('error', () => {
        source?.close()
        source = null
        if (!stopped && reconnect === null) {
          reconnect = window.setTimeout(() => {
            reconnect = null
            connect()
          }, 5000)
        }
      })
    }
    connect()
    return () => {
      stopped = true
      if (reconnect !== null) window.clearTimeout(reconnect)
      source?.close()
    }
  }, [token, loadAll])

  if (!token || !account) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader eyebrow={t('social.eyebrow')} title={t('social.title')} description={t('social.description')} />
        <section className="gi-panel p-5 text-sm text-ground-300">{t('social.loginGate')}</section>
      </div>
    )
  }

  const tabs: ReadonlyArray<{ id: Tab; label: TranslationKey; badge?: number }> = [
    { id: 'friends', label: 'social.tabs.friends', badge: friends.length },
    { id: 'requests', label: 'social.tabs.requests', badge: requests.incoming.length },
    { id: 'messages', label: 'social.tabs.messages', badge: conversations.reduce((n, c) => n + c.unread, 0) },
    { id: 'alliance', label: 'social.tabs.alliance' },
  ]

  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow={t('social.eyebrow')} title={t('social.title')} description={t('social.description')} />

      {error && (
        <div className="gi-panel p-3 text-[12px] font-display uppercase tracking-tightest text-rust-400 border-rust-700">
          {error}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {tabs.map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => setTab(entry.id)}
            className={[
              'gi-touch px-4 text-[11px] font-display uppercase tracking-tightest rounded-sharp border transition-colors',
              tab === entry.id
                ? 'border-ember-600 text-ember-300 bg-ember-500/5'
                : 'border-ground-700 text-ground-300 hover:border-ember-600/60 hover:text-ground-100',
            ].join(' ')}
          >
            {t(entry.label)}
            {entry.badge !== undefined && entry.badge > 0 && (
              <span className="ml-2 inline-flex items-center justify-center min-w-[20px] h-5 px-1 rounded-full bg-ember-500/20 text-ember-300 text-[10px]">
                {entry.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === 'friends' && (
        <FriendsPanel
          friends={friends}
          onRemove={async (id) => {
            try {
              await api.socialFriendRemove(token, id)
              void loadAll()
            } catch (err) {
              surface(err, t, setError)
            }
          }}
          onMessage={(peer) => {
            setOpenPeer(peer)
            setTab('messages')
          }}
        />
      )}

      {tab === 'requests' && (
        <RequestsPanel
          requests={requests}
          onAccept={async (id) => {
            try {
              await api.socialFriendAccept(token, id)
              void loadAll()
            } catch (err) {
              surface(err, t, setError)
            }
          }}
          onReject={async (id) => {
            try {
              await api.socialFriendReject(token, id)
              void loadAll()
            } catch (err) {
              surface(err, t, setError)
            }
          }}
        />
      )}

      {tab === 'messages' && (
        <MessagesPanel
          token={token}
          myUserId={account.id}
          conversations={conversations}
          openPeer={openPeer}
          onSelectPeer={setOpenPeer}
          onAfterChange={loadAll}
          onError={(err) => surface(err, t, setError)}
        />
      )}

      {tab === 'alliance' && (
        <AlliancePanel
          alliance={alliance}
          allianceName={allianceName}
          inviteId={inviteId}
          onAllianceNameChange={setAllianceName}
          onInviteIdChange={setInviteId}
          onCreate={async () => {
            const trimmed = allianceName.trim()
            if (trimmed.length < 2) return
            try {
              const r = await api.socialAllianceCreate(token, trimmed)
              setAlliance(r.alliance)
              setAllianceName('')
            } catch (err) {
              surface(err, t, setError)
            }
          }}
          onLeave={async () => {
            try {
              await api.socialAllianceLeave(token)
              setAlliance(null)
            } catch (err) {
              surface(err, t, setError)
            }
          }}
          onInvite={async () => {
            const id = Number.parseInt(inviteId, 10)
            if (!Number.isFinite(id) || id <= 0) return
            try {
              const r = await api.socialAllianceInvite(token, id)
              setAlliance(r.alliance)
              setInviteId('')
            } catch (err) {
              surface(err, t, setError)
            }
          }}
        />
      )}
    </div>
  )
}

function FriendsPanel({
  friends,
  onRemove,
  onMessage,
}: {
  friends: ServerFriendDto[]
  onRemove: (id: number) => void
  onMessage: (peer: ServerPublicAccount) => void
}) {
  const { t } = useI18n()
  if (friends.length === 0) {
    return <div className="gi-panel p-5 text-sm text-ground-400 italic">{t('social.friends.empty')}</div>
  }
  return (
    <ul className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
      {friends.map((f) => {
        const peer = f.peer ?? f.addressee
        return (
          <li key={f.id} className="gi-panel p-4 flex items-center gap-3">
            <Avatar text={peer.displayName} />
            <div className="flex-1 min-w-0">
              <div className="font-display font-extrabold text-base text-ground-100 truncate">{peer.displayName}</div>
              <div className="text-[11px] font-display uppercase tracking-tightest text-ground-500">
                ID #{peer.id}
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <button
                type="button"
                onClick={() => onMessage(peer)}
                className="gi-touch px-3 text-[11px] font-display uppercase tracking-tightest border border-ember-700 text-ember-300 hover:bg-ember-500/10 rounded-sharp"
              >
                {t('social.friends.message')}
              </button>
              <button
                type="button"
                onClick={() => onRemove(peer.id)}
                className="gi-touch px-3 text-[11px] font-display uppercase tracking-tightest border border-rust-700 text-rust-300 hover:bg-rust-500/10 rounded-sharp"
              >
                {t('social.friends.remove')}
              </button>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

function RequestsPanel({
  requests,
  onAccept,
  onReject,
}: {
  requests: ServerFriendRequestList
  onAccept: (id: number) => void
  onReject: (id: number) => void
}) {
  const { t } = useI18n()
  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-2">
        <h2 className="font-display text-[11px] uppercase tracking-tightest text-ground-400">
          {t('social.requests.incoming')}
        </h2>
        {requests.incoming.length === 0 ? (
          <div className="gi-panel p-4 text-sm text-ground-500 italic">
            {t('social.requests.empty')}
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {requests.incoming.map((r) => {
              const peer = r.requester
              return (
                <li key={r.id} className="gi-panel p-4 flex items-center gap-3">
                  <Avatar text={peer.displayName} />
                  <div className="flex-1 min-w-0">
                    <div className="font-display font-extrabold text-base text-ground-100 truncate">
                      {peer.displayName}
                    </div>
                    <div className="text-[11px] font-display uppercase tracking-tightest text-ground-500">
                      {new Date(r.createdAt).toLocaleString()}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onAccept(r.id)}
                    className="gi-touch px-3 text-[11px] font-display uppercase tracking-tightest border border-moss-700 text-moss-300 hover:bg-moss-500/10 rounded-sharp"
                  >
                    {t('social.requests.accept')}
                  </button>
                  <button
                    type="button"
                    onClick={() => onReject(r.id)}
                    className="gi-touch px-3 text-[11px] font-display uppercase tracking-tightest border border-ground-700 text-ground-300 hover:bg-ground-800 rounded-sharp"
                  >
                    {t('social.requests.reject')}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-display text-[11px] uppercase tracking-tightest text-ground-400">
          {t('social.requests.outgoing')}
        </h2>
        {requests.outgoing.length === 0 ? (
          <div className="gi-panel p-4 text-sm text-ground-500 italic">{t('social.requests.empty')}</div>
        ) : (
          <ul className="flex flex-col gap-2">
            {requests.outgoing.map((r) => {
              const peer = r.addressee
              return (
                <li key={r.id} className="gi-panel p-4 flex items-center gap-3">
                  <Avatar text={peer.displayName} />
                  <div className="flex-1 min-w-0">
                    <div className="font-display font-extrabold text-base text-ground-100 truncate">
                      {peer.displayName}
                    </div>
                    <div className="text-[11px] font-display uppercase tracking-tightest text-ember-400">
                      {t('social.requests.pending')}
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}

function MessagesPanel({
  token,
  myUserId,
  conversations,
  openPeer,
  onSelectPeer,
  onAfterChange,
  onError,
}: {
  token: string
  myUserId: number
  conversations: ServerConversationItem[]
  openPeer: ServerPublicAccount | null
  onSelectPeer: (peer: ServerPublicAccount | null) => void
  onAfterChange: () => Promise<void> | void
  onError: (err: unknown) => void
}) {
  const { t } = useI18n()
  const [messages, setMessages] = useState<ServerMessageDto[]>([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const scrollRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    let cancelled = false
    if (!openPeer) {
      setMessages([])
      return () => {
        cancelled = true
      }
    }
    void api
      .socialMessages(token, openPeer.id, 100)
      .then((r) => {
        if (!cancelled) setMessages(r.messages)
        void onAfterChange()
      })
      .catch(onError)
    return () => {
      cancelled = true
    }
  }, [openPeer, token, onAfterChange, onError])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  const send = useCallback(async () => {
    if (!openPeer) return
    const trimmed = draft.trim()
    if (trimmed.length === 0) return
    setBusy(true)
    try {
      const r = await api.socialSendMessage(token, openPeer.id, trimmed)
      setMessages((prev) => [...prev, r.message])
      setDraft('')
      void onAfterChange()
    } catch (err) {
      onError(err)
    } finally {
      setBusy(false)
    }
  }, [openPeer, draft, token, onAfterChange, onError])

  if (openPeer) {
    return (
      <div className="flex flex-col gap-3">
        <button
          type="button"
          onClick={() => onSelectPeer(null)}
          className="self-start text-[11px] font-display uppercase tracking-tightest text-ground-400 hover:text-ember-400 transition-colors"
        >
          {t('social.messages.backToList')}
        </button>

        <div className="gi-panel p-4 flex items-center gap-3">
          <Avatar text={openPeer.displayName} />
          <div>
            <div className="font-display font-extrabold text-base text-ground-100">{openPeer.displayName}</div>
            <div className="text-[10px] font-display uppercase tracking-tightest text-ground-500">
              ID #{openPeer.id}
            </div>
          </div>
        </div>

        <div
          ref={scrollRef}
          className="gi-panel p-4 max-h-[60vh] overflow-y-auto flex flex-col gap-2"
        >
          {messages.length === 0 && (
            <div className="text-sm text-ground-500 italic">{t('social.messages.empty')}</div>
          )}
          {messages.map((m) => {
            const mine = m.senderId === myUserId
            return (
              <div
                key={m.id}
                className={[
                  'flex flex-col max-w-[85%]',
                  mine ? 'self-end items-end' : 'self-start items-start',
                ].join(' ')}
              >
                <div
                  className={[
                    'rounded-sharp px-3 py-2 text-sm leading-relaxed border',
                    mine
                      ? 'bg-ember-500/10 border-ember-700 text-ground-100'
                      : 'bg-ground-800 border-ground-700 text-ground-100',
                  ].join(' ')}
                >
                  {m.content}
                </div>
                <div className="text-[10px] font-display uppercase tracking-tightest text-ground-500 mt-0.5">
                  {mine ? t('social.messages.you') : openPeer.displayName} ·{' '}
                  {new Date(m.createdAt).toLocaleString()}
                </div>
              </div>
            )
          })}
        </div>

        <textarea
          rows={3}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void send()
            }
          }}
          placeholder={t('social.messages.placeholder')}
          className="bg-ground-900 border border-ground-700 rounded-sharp px-3 py-2 text-sm text-ground-100 focus:border-ember-600 focus:outline-none resize-none"
        />
        <div className="flex">
          <button
            type="button"
            disabled={busy || draft.trim().length === 0}
            onClick={send}
            className="gi-touch ml-auto px-4 text-[11px] font-display uppercase tracking-tightest text-ember-300 border border-ember-700 hover:bg-ember-500/10 rounded-sharp disabled:opacity-60"
          >
            {t('social.messages.send')}
          </button>
        </div>
      </div>
    )
  }

  if (conversations.length === 0) {
    return <div className="gi-panel p-5 text-sm text-ground-400 italic">{t('social.messages.empty')}</div>
  }
  return (
    <ul className="flex flex-col gap-2">
      {conversations.map((c) => (
        <li key={c.peer.id}>
          <button
            type="button"
            onClick={() => onSelectPeer(c.peer)}
            className="w-full text-left gi-panel p-4 hover:border-ember-600 transition-colors flex items-center gap-3"
          >
            <Avatar text={c.peer.displayName} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-display font-extrabold text-base text-ground-100 truncate">
                  {c.peer.displayName}
                </span>
                {c.unread > 0 && (
                  <span className="text-[10px] font-display uppercase tracking-tightest text-ember-300 bg-ember-500/20 rounded-full px-2 py-0.5">
                    {t('social.messages.unreadBadge', { n: c.unread })}
                  </span>
                )}
              </div>
              <div className="text-sm text-ground-300 truncate">{c.lastMessage.content}</div>
              <div className="text-[10px] font-display uppercase tracking-tightest text-ground-500">
                {new Date(c.lastMessage.createdAt).toLocaleString()}
              </div>
            </div>
          </button>
        </li>
      ))}
    </ul>
  )
}

function AlliancePanel({
  alliance,
  allianceName,
  inviteId,
  onAllianceNameChange,
  onInviteIdChange,
  onCreate,
  onLeave,
  onInvite,
}: {
  alliance: ServerAllianceDto | null
  allianceName: string
  inviteId: string
  onAllianceNameChange: (next: string) => void
  onInviteIdChange: (next: string) => void
  onCreate: () => void
  onLeave: () => void
  onInvite: () => void
}) {
  const { t } = useI18n()
  if (!alliance) {
    return (
      <section className="gi-panel p-5 flex flex-col gap-3">
        <p className="text-sm text-ground-300 leading-relaxed">{t('social.alliance.none')}</p>
        <input
          value={allianceName}
          onChange={(e) => onAllianceNameChange(e.target.value)}
          placeholder={t('social.alliance.namePlaceholder')}
          className="bg-ground-900 border border-ground-700 rounded-sharp px-3 py-2 text-sm text-ground-100 focus:border-ember-600 focus:outline-none"
        />
        <button
          type="button"
          onClick={onCreate}
          disabled={allianceName.trim().length < 2}
          className="gi-touch self-start px-4 text-[11px] font-display uppercase tracking-tightest text-ember-300 border border-ember-700 hover:bg-ember-500/10 rounded-sharp disabled:opacity-60"
        >
          {t('social.alliance.create')}
        </button>
      </section>
    )
  }
  return (
    <section className="flex flex-col gap-4">
      <div className="gi-panel p-5 flex flex-col gap-2">
        <div className="font-display text-[11px] uppercase tracking-tightest text-ember-500">
          {t('social.alliance.heading')}
        </div>
        <h2 className="font-display font-extrabold text-2xl text-ground-100">{alliance.name}</h2>
        <div className="text-[11px] font-display uppercase tracking-tightest text-ground-500">
          {t('social.alliance.members', { n: alliance.members.length, max: alliance.maxMembers })}
        </div>
      </div>

      <ul className="flex flex-col gap-2">
        {alliance.members.map((m) => (
          <li key={m.id} className="gi-panel p-4 flex items-center gap-3">
            <Avatar text={m.displayName} />
            <div className="flex-1 min-w-0">
              <div className="font-display font-extrabold text-base text-ground-100 truncate">{m.displayName}</div>
              <div className="text-[11px] font-display uppercase tracking-tightest text-ground-500">
                ID #{m.id} · {new Date(m.joinedAt).toLocaleDateString()}
              </div>
            </div>
            {m.isLeader && (
              <span className="text-[10px] font-display uppercase tracking-tightest text-ember-300 border border-ember-700 rounded-full px-2 py-0.5">
                {t('social.alliance.leader')}
              </span>
            )}
          </li>
        ))}
      </ul>

      <div className="gi-panel p-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:gap-3">
        <input
          value={inviteId}
          onChange={(e) => onInviteIdChange(e.target.value.replace(/[^0-9]/g, ''))}
          placeholder={t('social.alliance.invitePlaceholder')}
          className="bg-ground-900 border border-ground-700 rounded-sharp px-3 py-2 text-sm text-ground-100 focus:border-ember-600 focus:outline-none flex-1"
        />
        <button
          type="button"
          onClick={onInvite}
          disabled={inviteId.length === 0 || alliance.members.length >= alliance.maxMembers}
          className="gi-touch px-4 text-[11px] font-display uppercase tracking-tightest text-ember-300 border border-ember-700 hover:bg-ember-500/10 rounded-sharp disabled:opacity-60"
        >
          {t('social.alliance.invite')}
        </button>
      </div>

      <button
        type="button"
        onClick={onLeave}
        className="gi-touch self-start px-4 text-[11px] font-display uppercase tracking-tightest text-rust-300 border border-rust-700 hover:bg-rust-500/10 rounded-sharp"
      >
        {t('social.alliance.leave')}
      </button>
    </section>
  )
}

function Avatar({ text }: { text: string }) {
  const initial = useMemo(() => (text || '?').trim().charAt(0).toUpperCase(), [text])
  return (
    <span className="w-10 h-10 inline-flex items-center justify-center rounded-full border border-ember-600/60 bg-ground-900 text-[15px] text-ember-300 font-display font-extrabold shrink-0">
      {initial}
    </span>
  )
}

function surface(err: unknown, t: ReturnType<typeof useI18n>['t'], setError: (msg: string | null) => void): void {
  if (err instanceof ApiError) {
    setError(err.message || err.code || t('social.errorGeneric'))
    return
  }
  if (err instanceof Error) {
    setError(err.message)
    return
  }
  setError(t('social.errorGeneric'))
}

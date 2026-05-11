import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useI18n } from '../../i18n'
import { useAuth } from '../../state/AuthContext'
import type { NpcSummary } from '../../state/types'
import {
  api,
  ApiError,
  type LocalizedLine,
  type NpcInteractIntent,
  type ServerCombatSession,
  type ServerNpcHistory,
  type ServerNpcInteraction
} from '../../api/client'
import type { Locale, TranslationKey } from '../../i18n/types'
import { CombatHud } from './CombatHud'

const INTENT_TAG_KEY: Readonly<Record<NpcInteractIntent, TranslationKey>> = {
  greet: 'npc.intentGreet',
  ask: 'npc.intentAsk',
  trade: 'npc.intentTrade',
  leave: 'npc.intentLeave'
}

const TIER_KEY: Readonly<Record<'low' | 'mid' | 'high', TranslationKey>> = {
  low: 'npc.tier.low',
  mid: 'npc.tier.mid',
  high: 'npc.tier.high'
}

const DIALOG_HOLD_REFRESH_MS = 20_000

interface DialogTurn {
  id: string
  intent: NpcInteractIntent
  playerMessage: string
  line: LocalizedLine
  trustAfter: number
  trustDelta: number
  tick: number
  replySource: 'ai' | 'fallback'
}

interface NpcDialogProps {
  npc: NpcSummary | null
  onClose: () => void
}

export function NpcDialog({ npc, onClose }: NpcDialogProps) {
  const { t, locale } = useI18n()
  const { token, account } = useAuth()
  const [turns, setTurns] = useState<DialogTurn[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [trust, setTrust] = useState<number | null>(null)
  const [tier, setTier] = useState<'low' | 'mid' | 'high'>('mid')
  const [showHistory, setShowHistory] = useState(false)
  const [history, setHistory] = useState<ServerNpcHistory | null>(null)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [draft, setDraft] = useState('')
  const [combatSession, setCombatSession] = useState<ServerCombatSession | null>(null)
  const [combatBusy, setCombatBusy] = useState(false)
  const [dynamicGreet, setDynamicGreet] = useState<LocalizedLine | null>(null)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  const conversationRef = useRef<HTMLDivElement | null>(null)

  // onClose 從父層每次 render 都是新的 callback；放進 useEffect deps 會導致
  // 每次世界 SSE 更新時觸發 reset，把 draft 清掉。改成用 ref 持有最新版。
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  // 只看 npc.id：開新 NPC 才重置；同一 NPC 在 SSE 流期間維持輸入框與對話。
  const npcId = npc?.id ?? null
  const initialTrust = npc?.relationshipScore ?? 0
  useEffect(() => {
    if (!npcId) return
    setTurns([])
    setBusy(false)
    setError(null)
    setTrust(initialTrust)
    setTier(deriveTier(initialTrust))
    setShowHistory(false)
    setHistory(null)
    setHistoryLoading(false)
    setDraft('')
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [npcId])

  useEffect(() => {
    if (conversationRef.current) {
      conversationRef.current.scrollTop = conversationRef.current.scrollHeight
    }
  }, [turns.length])

  useEffect(() => {
    if (!npcId || !token) return
    let cancelled = false
    const refreshHold = () => {
      api.npcDialogHold(token, npcId).catch(() => {
        if (!cancelled) {
          // Private dialog can continue, but world-presence hold may expire.
        }
      })
    }
    refreshHold()
    const timer = window.setInterval(refreshHold, DIALOG_HOLD_REFRESH_MS)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [npcId, token])

  const refreshHistory = useCallback(async () => {
    if (!npc || !token) return
    setHistoryLoading(true)
    try {
      const result = await api.npcHistory(token, npc.id, 20)
      setHistory(result)
    } catch {
      setHistory({
        npcId: npc.id,
        relationship: {
          trust: trust ?? 0,
          tier,
          interactionCount: 0,
          lastInteractionTick: 0,
          min: 0,
          max: 100,
          seeded: true
        },
        events: []
      })
    } finally {
      setHistoryLoading(false)
    }
  }, [npc, token, trust, tier])

  const sendMessage = useCallback(
    async (payload: { message?: string; intent?: NpcInteractIntent }) => {
      if (!npc || !token || busy) return
      const trimmed = payload.message?.trim()
      if (!trimmed && !payload.intent) return
      setBusy(true)
      setError(null)
      try {
        const requestPayload: { message?: string; intent?: NpcInteractIntent } = {}
        if (trimmed) requestPayload.message = trimmed
        if (payload.intent) requestPayload.intent = payload.intent
        const result = await api.npcInteract(token, npc.id, requestPayload)
        appendTurn(setTurns, trimmed ?? '', result)
        setTrust(result.relationship.trust)
        setTier(result.relationship.tier)
        setDraft('')
        if (showHistory) {
          void refreshHistory()
        }
      } catch (err) {
        const msg =
          err instanceof ApiError && err.code
            ? `${err.code} · ${err.message}`
            : err instanceof Error
              ? err.message
              : 'unknown error'
        setError(msg)
      } finally {
        setBusy(false)
        if (inputRef.current) inputRef.current.focus()
      }
    },
    [npc, token, busy, showHistory, refreshHistory]
  )

  const handleSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      void sendMessage({ message: draft })
    },
    [draft, sendMessage]
  )

  const handleQuickIntent = useCallback(
    (intent: NpcInteractIntent) => {
      void sendMessage({ intent })
    },
    [sendMessage]
  )

  const handleChallenge = useCallback(async () => {
    if (!npc || !token || combatBusy) return
    setCombatBusy(true)
    setError(null)
    try {
      const r = await api.combatInitiate(token, npc.id)
      setCombatSession(r.session)
    } catch (err) {
      const msg =
        err instanceof ApiError && err.code
          ? `${err.code} · ${err.message}`
          : err instanceof Error
            ? err.message
            : 'unknown error'
      setError(msg)
    } finally {
      setCombatBusy(false)
    }
  }, [npc, token, combatBusy])

  // Fetch dynamic greet line per (player, npc) when dialog opens.
  useEffect(() => {
    if (!npc || !token) return
    let cancelled = false
    api
      .npcGreet(token, npc.id)
      .then((r) => {
        if (!cancelled) setDynamicGreet(r.greetLine)
      })
      .catch(() => {
        // fall back to npc.greetLine static line
      })
    return () => {
      cancelled = true
    }
  }, [npc?.id, token])

  // On open, also check if there's an active combat with this NPC.
  useEffect(() => {
    if (!npc || !token) return
    let cancelled = false
    api
      .combatActive(token)
      .then((r) => {
        if (cancelled) return
        if (r.active && r.active.npcId === npc.id) setCombatSession(r.active)
      })
      .catch(() => {
        // no active combat
      })
    return () => {
      cancelled = true
    }
  }, [npc?.id, token])

  const handleToggleHistory = useCallback(() => {
    if (!showHistory) {
      setShowHistory(true)
      void refreshHistory()
    } else {
      setShowHistory(false)
    }
  }, [showHistory, refreshHistory])

  const lastTurn = turns[turns.length - 1]
  const lastDelta = useMemo(() => (lastTurn ? lastTurn.trustDelta : null), [lastTurn])

  if (!npc) return null

  // 戰鬥中：直接畫 CombatHud 蓋過 dialog
  if (combatSession && combatSession.state === 'active') {
    return (
      <CombatHud
        npcName={npc.name}
        initialSession={combatSession}
        onClose={() => {
          setCombatSession(null)
          onClose()
        }}
      />
    )
  }

  // 顯示 challenge 按鈕的條件：低 trust + NPC health > 0
  const canChallenge = (trust ?? 0) <= 30 && (npc.health ?? 0) > 0

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('npc.dialogTitle', { name: npc.name })}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ground-900/80 backdrop-blur-sm px-3 pb-3 sm:p-6"
      onClick={onClose}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-xl gi-panel border-ember-700/60 p-5 sm:p-6 flex flex-col gap-4 max-h-[90vh] overflow-hidden"
      >
        <header className="flex items-start justify-between gap-3">
          <div>
            <div className="font-display text-[11px] uppercase tracking-tightest text-ember-500">
              {npc.role}
            </div>
            <h2 className="font-display font-extrabold text-2xl tracking-tightest text-ground-100">
              {npc.name}
            </h2>
            <div className="mt-1 text-[11px] font-display uppercase tracking-tightest text-ground-500">
              <span>
                {t('npc.relationship')}{' '}
                <span className="text-ground-200">{trust ?? npc.relationshipScore}</span>
              </span>
              <span className="mx-2 text-ground-700">·</span>
              <span>{t(TIER_KEY[tier])}</span>
              {lastDelta !== null && lastDelta !== 0 && (
                <>
                  <span className="mx-2 text-ground-700">·</span>
                  <span
                    className={lastDelta > 0 ? 'text-moss-400' : 'text-ember-400'}
                  >
                    {lastDelta > 0
                      ? t('npc.trustDeltaUp', { delta: lastDelta })
                      : t('npc.trustDeltaDown', { delta: lastDelta })}
                  </span>
                </>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            {canChallenge && account && (
              <button
                type="button"
                onClick={handleChallenge}
                disabled={combatBusy}
                className="gi-touch shrink-0 px-3 text-[11px] font-display uppercase tracking-tightest text-ember-300 hover:text-ember-200 border border-ember-700 hover:border-ember-500 rounded-sharp disabled:opacity-40"
                title="開戰（trust ≤ 30 才可挑戰）"
              >
                {combatBusy ? '…' : '挑戰開戰'}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="gi-touch shrink-0 px-3 text-[11px] font-display uppercase tracking-tightest text-ground-400 hover:text-ground-100 border border-ground-700 hover:border-ground-500 rounded-sharp"
            >
              {t('npc.dialogClose')}
            </button>
          </div>
        </header>

        <div
          ref={conversationRef}
          className="flex-1 overflow-y-auto pr-1 -mr-1 flex flex-col gap-3"
        >
          {turns.length === 0 ? (
            <div className="border-l-2 border-ground-700 pl-4 py-2 text-[14px] leading-relaxed text-ground-400 italic">
              {dynamicGreet
                ? (locale === 'zh' ? dynamicGreet.zh : dynamicGreet.en)
                : npc.greetLine
                  ? (locale === 'zh' ? npc.greetLine.zh : npc.greetLine.en)
                  : t('npc.lineFallback', { name: npc.name })}
            </div>
          ) : (
            <ConversationLog turns={turns} locale={locale} t={t} />
          )}

          {error && (
            <div className="border border-ember-700/60 rounded-sharp p-3 text-[12px] text-ember-300">
              <div className="font-display text-[11px] uppercase tracking-tightest text-ember-500 mb-1">
                {t('npc.errorMessage')}
              </div>
              <div className="text-ground-300">{error}</div>
            </div>
          )}
        </div>

        {account ? (
          <form onSubmit={handleSubmit} className="flex flex-col gap-2">
            <div className="flex flex-wrap gap-2">
              <QuickIntent
                label={t('npc.quickGreet')}
                disabled={busy}
                onClick={() => handleQuickIntent('greet')}
              />
              <QuickIntent
                label={t('npc.quickAsk')}
                disabled={busy}
                onClick={() => handleQuickIntent('ask')}
              />
              <QuickIntent
                label={t('npc.quickTrade')}
                disabled={busy}
                onClick={() => handleQuickIntent('trade')}
              />
              <QuickIntent
                label={t('npc.quickLeave')}
                disabled={busy}
                onClick={() => handleQuickIntent('leave')}
              />
            </div>
            <textarea
              ref={inputRef}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              rows={2}
              placeholder={t('npc.inputPlaceholder', { name: npc.name })}
              disabled={busy}
              className="w-full bg-ground-950 border border-ground-700 focus:border-ember-600 rounded-sharp px-3 py-2 text-[14px] text-ground-100 placeholder:text-ground-600 outline-none disabled:opacity-50"
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  void sendMessage({ message: draft })
                }
              }}
            />
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-display uppercase tracking-tightest text-ground-600">
                {t('npc.privateNotice')}
              </span>
              <button
                type="submit"
                disabled={busy || draft.trim().length === 0}
                className="gi-touch px-4 text-[12px] font-display uppercase tracking-tightest border border-ember-600 text-ember-300 hover:bg-ember-500/10 rounded-sharp disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {busy ? t('npc.thinking') : t('npc.send')}
              </button>
            </div>
          </form>
        ) : (
          <div className="border border-ground-700 rounded-sharp p-3 text-[12px] text-ground-300 leading-relaxed">
            <div className="font-display text-[11px] uppercase tracking-tightest text-ember-500 mb-1">
              {t('npc.responseLogin')}
            </div>
            {t('npc.responseLockedHint')}
          </div>
        )}

        {account && (
          <div className="flex flex-col gap-2 pt-2 border-t border-ground-800">
            <button
              type="button"
              onClick={handleToggleHistory}
              className="self-start text-[11px] font-display uppercase tracking-tightest text-ground-400 hover:text-ember-400 transition-colors"
            >
              {showHistory ? t('npc.history.toggleHide') : t('npc.history.toggleShow')}
            </button>
            {showHistory && (
              <div className="flex flex-col gap-2 max-h-48 overflow-y-auto pr-1">
                <div className="font-display text-[11px] uppercase tracking-tightest text-ground-500">
                  {t('npc.history.heading')}
                </div>
                {historyLoading ? (
                  <div className="text-[12px] text-ground-500">{t('npc.history.loading')}</div>
                ) : !history || history.events.length === 0 ? (
                  <div className="text-[12px] text-ground-500 italic">
                    {t('npc.history.empty')}
                  </div>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {history.events.map((entry) => (
                      <li
                        key={entry.id}
                        className="border border-ground-800 rounded-sharp p-2 text-[12px] text-ground-300"
                      >
                        <div className="font-display text-[10px] uppercase tracking-tightest text-ground-500 mb-1">
                          tick {entry.tick} · {t(INTENT_TAG_KEY[entry.intent])} ·{' '}
                          {t('npc.relationship')} {entry.trustAfter}
                        </div>
                        {entry.playerMessage && (
                          <div className="mb-1 text-ground-500">
                            {t('npc.playerSpoke')}：{entry.playerMessage}
                          </div>
                        )}
                        <div>{pickLocale(entry.line, locale)}</div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function ConversationLog({
  turns,
  locale,
  t
}: {
  turns: DialogTurn[]
  locale: Locale
  t: (key: TranslationKey, params?: Readonly<Record<string, string | number>>) => string
}) {
  return (
    <div className="flex flex-col gap-3">
      {turns.map((turn) => (
        <div key={turn.id} className="flex flex-col gap-2">
          {turn.playerMessage && (
            <div className="self-end max-w-[85%]">
              <div className="font-display text-[10px] uppercase tracking-tightest text-ground-500 mb-1 text-right">
                {t('npc.playerSpoke')}
              </div>
              <div className="bg-ground-800 border border-ground-700 rounded-sharp px-3 py-2 text-[14px] text-ground-100">
                {turn.playerMessage}
              </div>
            </div>
          )}
          <div className="self-start max-w-[90%]">
            <div className="font-display text-[10px] uppercase tracking-tightest text-ground-500 mb-1">
              <span className="text-ember-500">› {t(INTENT_TAG_KEY[turn.intent])}</span>
              <span className="ml-2 text-ground-700">tick {turn.tick}</span>
              {turn.replySource === 'fallback' && (
                <span className="ml-2 text-ground-600">· {t('npc.fallbackBadge')}</span>
              )}
            </div>
            <div className="border-l-2 border-ember-600 pl-4 py-1 text-[15px] leading-relaxed text-ground-100 whitespace-pre-line">
              {pickLocale(turn.line, locale)}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function QuickIntent({
  label,
  disabled,
  onClick
}: {
  label: string
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="gi-touch px-3 text-[11px] font-display uppercase tracking-tightest border border-ground-700 text-ground-300 hover:border-ember-600 hover:text-ember-300 rounded-sharp disabled:opacity-40 disabled:cursor-not-allowed"
    >
      {label}
    </button>
  )
}

function appendTurn(
  setTurns: React.Dispatch<React.SetStateAction<DialogTurn[]>>,
  playerMessage: string,
  result: ServerNpcInteraction
) {
  setTurns((prev) => [
    ...prev,
    {
      id: `${result.tick}-${result.personalEvent.id}`,
      intent: result.intent,
      playerMessage,
      line: result.line,
      trustAfter: result.relationship.trust,
      trustDelta: result.relationship.delta,
      tick: result.tick,
      replySource: result.replySource
    }
  ])
}

function pickLocale(line: LocalizedLine, locale: Locale): string {
  return locale === 'zh' ? line.zh : line.en
}

function deriveTier(score: number): 'low' | 'mid' | 'high' {
  if (score >= 60) return 'high'
  if (score >= 30) return 'mid'
  return 'low'
}

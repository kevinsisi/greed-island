import { useCallback, useEffect, useMemo, useState } from 'react'
import { useI18n } from '../../i18n'
import { useAuth } from '../../state/AuthContext'
import type { NpcSummary } from '../../state/types'
import {
  api,
  ApiError,
  type LocalizedLine,
  type NpcInteractIntent,
  type ServerNpcHistory,
  type ServerNpcInteraction
} from '../../api/client'
import type { Locale, TranslationKey } from '../../i18n/types'

const INTENTS: readonly NpcInteractIntent[] = ['greet', 'ask', 'trade', 'leave']

const INTENT_LABEL_KEY: Readonly<Record<NpcInteractIntent, TranslationKey>> = {
  greet: 'npc.responseGreet',
  ask: 'npc.responseAsk',
  trade: 'npc.responseTrade',
  leave: 'npc.responseLeave'
}

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

interface DialogTurn {
  id: string
  intent: NpcInteractIntent
  line: LocalizedLine
  trustAfter: number
  trustDelta: number
  tick: number
}

interface NpcDialogProps {
  npc: NpcSummary | null
  onClose: () => void
}

export function NpcDialog({ npc, onClose }: NpcDialogProps) {
  const { t, locale } = useI18n()
  const { token, account } = useAuth()
  const [turns, setTurns] = useState<DialogTurn[]>([])
  const [busy, setBusy] = useState<NpcInteractIntent | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [hasLeft, setHasLeft] = useState(false)
  const [trust, setTrust] = useState<number | null>(null)
  const [tier, setTier] = useState<'low' | 'mid' | 'high'>('mid')
  const [showHistory, setShowHistory] = useState(false)
  const [history, setHistory] = useState<ServerNpcHistory | null>(null)
  const [historyLoading, setHistoryLoading] = useState(false)

  useEffect(() => {
    if (!npc) return
    setTurns([])
    setBusy(null)
    setError(null)
    setHasLeft(false)
    setTrust(npc.relationshipScore)
    setTier(deriveTier(npc.relationshipScore))
    setShowHistory(false)
    setHistory(null)
    setHistoryLoading(false)
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [npc, onClose])

  const handleIntent = useCallback(
    async (intent: NpcInteractIntent) => {
      if (!npc || !token || busy) return
      setBusy(intent)
      setError(null)
      try {
        const result = await api.npcInteract(token, npc.id, intent)
        appendTurn(setTurns, result)
        setTrust(result.relationship.trust)
        setTier(result.relationship.tier)
        if (intent === 'leave') {
          setHasLeft(true)
        }
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
        setBusy(null)
      }
    },
    [npc, token, busy, showHistory]
  )

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

  const handleToggleHistory = useCallback(() => {
    if (!showHistory) {
      setShowHistory(true)
      void refreshHistory()
    } else {
      setShowHistory(false)
    }
  }, [showHistory, refreshHistory])

  const lastTurn = turns[turns.length - 1]
  const visibleLine = useMemo(() => {
    if (lastTurn) return pickLocale(lastTurn.line, locale)
    return null
  }, [lastTurn, locale])

  if (!npc) return null

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
        className="w-full max-w-xl gi-panel border-ember-700/60 p-5 sm:p-6 flex flex-col gap-4 max-h-[85vh] overflow-y-auto"
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
              <span className="mx-2 text-ground-700">·</span>
              {npc.lastActedTick > 0 ? (
                <span>{t('npc.lastActed', { tick: npc.lastActedTick })}</span>
              ) : (
                <span>{t('npc.lastActedNever')}</span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="gi-touch shrink-0 px-3 text-[11px] font-display uppercase tracking-tightest text-ground-400 hover:text-ground-100 border border-ground-700 hover:border-ground-500 rounded-sharp"
          >
            {t('npc.dialogClose')}
          </button>
        </header>

        {turns.length === 0 ? (
          <div className="border-l-2 border-ground-700 pl-4 py-2 text-[14px] leading-relaxed text-ground-400 italic">
            {t('npc.lineFallback', { name: npc.name })}
          </div>
        ) : (
          <ConversationLog turns={turns} locale={locale} t={t} />
        )}

        {visibleLine && lastTurn && (
          <TrustDeltaTag delta={lastTurn.trustDelta} t={t} />
        )}

        {error && (
          <div className="border border-ember-700/60 rounded-sharp p-3 text-[12px] text-ember-300">
            <div className="font-display text-[11px] uppercase tracking-tightest text-ember-500 mb-1">
              {t('npc.errorMessage')}
            </div>
            <div className="text-ground-300">{error}</div>
          </div>
        )}

        {account ? (
          hasLeft ? (
            <div className="text-[12px] text-moss-400 font-display uppercase tracking-tightest">
              {t('npc.dialogLeftHint')}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="text-[11px] font-display uppercase tracking-tightest text-ground-500">
                {turns.length === 0
                  ? t('npc.responsePrompt')
                  : t('npc.dialogContinueHint')}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {INTENTS.map((intent) => (
                  <ResponseButton
                    key={intent}
                    label={t(INTENT_LABEL_KEY[intent])}
                    busy={busy === intent}
                    disabled={busy !== null}
                    onClick={() => handleIntent(intent)}
                  />
                ))}
              </div>
              <div className="text-[10px] font-display uppercase tracking-tightest text-ground-600">
                {t('npc.privateNotice')}
              </div>
            </div>
          )
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
              <div className="flex flex-col gap-2">
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
        <div key={turn.id} className="flex flex-col gap-1">
          <div className="font-display text-[10px] uppercase tracking-tightest text-ground-500">
            <span className="text-ember-500">› {t(INTENT_TAG_KEY[turn.intent])}</span>
            <span className="ml-2 text-ground-700">tick {turn.tick}</span>
          </div>
          <div className="border-l-2 border-ember-600 pl-4 py-1 text-[15px] leading-relaxed text-ground-100">
            {pickLocale(turn.line, locale)}
          </div>
        </div>
      ))}
    </div>
  )
}

function TrustDeltaTag({
  delta,
  t
}: {
  delta: number
  t: (key: TranslationKey, params?: Readonly<Record<string, string | number>>) => string
}) {
  if (delta === 0) {
    return (
      <div className="text-[11px] font-display uppercase tracking-tightest text-ground-500">
        {t('npc.trustUnchanged')}
      </div>
    )
  }
  const key: TranslationKey = delta > 0 ? 'npc.trustDeltaUp' : 'npc.trustDeltaDown'
  const colour = delta > 0 ? 'text-moss-400' : 'text-ember-400'
  return (
    <div className={`text-[11px] font-display uppercase tracking-tightest ${colour}`}>
      {t(key, { delta })}
    </div>
  )
}

function ResponseButton({
  label,
  busy,
  disabled,
  onClick
}: {
  label: string
  busy: boolean
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="gi-touch px-4 text-left text-[13px] text-ground-200 border border-ground-700 hover:border-ember-600 hover:text-ember-300 hover:bg-ember-500/5 rounded-sharp transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {busy ? '…' : label}
    </button>
  )
}

function appendTurn(
  setTurns: React.Dispatch<React.SetStateAction<DialogTurn[]>>,
  result: ServerNpcInteraction
) {
  setTurns((prev) => [
    ...prev,
    {
      id: `${result.tick}-${result.personalEvent.id}`,
      intent: result.intent,
      line: result.line,
      trustAfter: result.relationship.trust,
      trustDelta: result.relationship.delta,
      tick: result.tick
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

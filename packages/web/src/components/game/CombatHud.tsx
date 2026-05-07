// CombatHud — Phase B 戰鬥介面（v0.15.0）。
//
// 純 React + Tailwind，沒有 Phaser。三按鈕（攻擊/防禦/逃跑）+ 雙方 hp bar
// + 上一回合 result row。NpcDialog 在低 trust + NPC health > 0 時顯示「挑釁
// 開戰」按鈕，按下會 POST /combat/initiate 然後切換至 CombatHud。
//
// 沒做 client prediction：每按一次都 await server。Phase C 才做 sub-tick
// + prediction。

import { useCallback, useEffect, useState } from 'react'
import { api, ApiError, type ServerCombatSession } from '../../api/client'
import { useAuth } from '../../state/AuthContext'

type CombatAction = 'attack' | 'defend' | 'flee'

interface CombatHudProps {
  npcName: string
  initialSession: ServerCombatSession
  onClose: () => void
}

export function CombatHud({ npcName, initialSession, onClose }: CombatHudProps) {
  const { token } = useAuth()
  const [session, setSession] = useState<ServerCombatSession>(initialSession)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastEvents, setLastEvents] = useState<
    Array<{ eventType: string; payload: Record<string, unknown> }>
  >([])

  // ESC 關閉
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const submit = useCallback(
    async (action: CombatAction) => {
      if (!token || busy) return
      setBusy(true)
      setError(null)
      try {
        const r = await api.combatAction(token, session.combatId, action)
        setSession(r.session)
        setLastEvents(r.events)
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
      }
    },
    [token, session.combatId, busy]
  )

  const isResolved = session.state === 'resolved'
  const playerPct = Math.round((session.playerHp / session.initialHp) * 100)
  const npcPct = Math.round((session.npcHp / session.initialHp) * 100)

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`戰鬥：${npcName}`}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ground-900/85 backdrop-blur-sm px-3 pb-3 sm:p-6"
      onClick={onClose}
    >
      <div
        onClick={(ev) => ev.stopPropagation()}
        className="w-full max-w-lg gi-panel border-ember-700/60 p-5 flex flex-col gap-4"
      >
        <header className="flex items-start justify-between">
          <div>
            <div className="font-display text-[11px] uppercase tracking-tightest text-ember-500">
              戰鬥 / Combat
            </div>
            <h2 className="font-display font-extrabold text-2xl text-ground-100">
              {npcName}
            </h2>
            <div className="text-[11px] font-display uppercase tracking-tightest text-ground-500">
              回合 {session.combatRound} · {isResolved ? `已結束 / ${session.outcome}` : '進行中'}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="gi-touch px-3 text-[11px] font-display uppercase tracking-tightest text-ground-400 hover:text-ground-100 border border-ground-700 hover:border-ground-500 rounded-sharp"
          >
            關閉
          </button>
        </header>

        <div className="flex flex-col gap-3">
          <HpBar label="你 / You" value={session.playerHp} max={session.initialHp} pct={playerPct} colorClass="bg-moss-500" />
          <HpBar label={npcName} value={session.npcHp} max={session.initialHp} pct={npcPct} colorClass="bg-ember-500" />
        </div>

        {lastEvents.length > 0 && (
          <div className="border border-ground-800 rounded-sharp p-3 text-[12px] text-ground-300 flex flex-col gap-1 max-h-32 overflow-y-auto">
            <div className="font-display text-[10px] uppercase tracking-tightest text-ground-500 mb-1">
              本回合：
            </div>
            {lastEvents.map((ev, idx) => (
              <div key={idx}>
                <span className="text-ember-400">{ev.eventType}</span>
                <span className="ml-2 text-ground-400">{describeEvent(ev)}</span>
              </div>
            ))}
          </div>
        )}

        {error && (
          <div className="border border-ember-700/60 rounded-sharp p-3 text-[12px] text-ember-300">
            <div className="font-display text-[11px] uppercase tracking-tightest text-ember-500 mb-1">
              錯誤
            </div>
            <div className="text-ground-300">{error}</div>
          </div>
        )}

        {!isResolved ? (
          <div className="grid grid-cols-3 gap-2">
            <ActionButton label="攻擊" tone="ember" disabled={busy} onClick={() => submit('attack')} />
            <ActionButton label="防禦" tone="moss" disabled={busy} onClick={() => submit('defend')} />
            <ActionButton label="逃跑" tone="ground" disabled={busy} onClick={() => submit('flee')} />
          </div>
        ) : (
          <div className="text-[12px] text-ground-300 leading-relaxed">
            {session.outcome === 'player_victory' && '你贏了。NPC 倒地，5 秒後甦醒。'}
            {session.outcome === 'npc_victory' && '你輸了。energy 歸零；找個地方休息。'}
            {session.outcome === 'fled' && '你成功逃脫。'}
          </div>
        )}
      </div>
    </div>
  )
}

function HpBar({
  label,
  value,
  max,
  pct,
  colorClass,
}: {
  label: string
  value: number
  max: number
  pct: number
  colorClass: string
}) {
  const clampedPct = Math.max(0, Math.min(100, pct))
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-[11px] font-display uppercase tracking-tightest text-ground-400">
        <span>{label}</span>
        <span>
          {value} / {max}
        </span>
      </div>
      <div className="w-full h-3 bg-ground-900 border border-ground-800 rounded-sharp overflow-hidden">
        <div
          className={`h-full ${colorClass}`}
          style={{ width: `${clampedPct}%`, transition: 'width 200ms ease' }}
        />
      </div>
    </div>
  )
}

function ActionButton({
  label,
  tone,
  disabled,
  onClick,
}: {
  label: string
  tone: 'ember' | 'moss' | 'ground'
  disabled: boolean
  onClick: () => void
}) {
  const toneClass =
    tone === 'ember'
      ? 'border-ember-600 text-ember-300 hover:bg-ember-500/10'
      : tone === 'moss'
        ? 'border-moss-600 text-moss-300 hover:bg-moss-500/10'
        : 'border-ground-600 text-ground-300 hover:bg-ground-700/30'
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`gi-touch px-4 py-2 text-[12px] font-display uppercase tracking-tightest border rounded-sharp ${toneClass} disabled:opacity-40 disabled:cursor-not-allowed`}
    >
      {label}
    </button>
  )
}

function describeEvent(ev: { eventType: string; payload: Record<string, unknown> }): string {
  const p = ev.payload
  switch (ev.eventType) {
    case 'COMBAT_DAMAGE': {
      const amount = typeof p.amount === 'number' ? p.amount : 0
      const crit = p.crit === true
      const src = String(p.sourceActorId ?? '?')
      return `${src} → ${amount} 傷害${crit ? '（暴擊）' : ''}`
    }
    case 'COMBAT_DEFEND': {
      const recovered = typeof p.recoveredHp === 'number' ? p.recoveredHp : 0
      return `防禦${recovered > 0 ? `（恢復 ${recovered} hp）` : ''}`
    }
    case 'COMBAT_FLEE':
      return '逃跑'
    case 'COMBAT_RESOLVE':
      return `結束：${p.outcome}`
    case 'COMBAT_CARD_IGNORED':
      return `紋卡 #${p.cardId} 暫未支援（Phase C）`
    default:
      return ''
  }
}

// v0.96.0 — NpcMindSheet: 讓玩家看見 Hermes 等級 NPC 的內心狀態。
// 顯示 NPC 的意圖、信念、教訓、關係摘要。
// 手機：作為 NpcDialog 頂部折疊區塊；桌機：同（NpcDialog 已是右側面板）。
// 預設展開前 2 個意圖，其餘區塊折疊。

import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../../state/AuthContext'
import type { NpcSummary } from '../../state/types'
import {
  api,
  type NpcBeliefEntry,
  type NpcIntentEntry,
  type NpcLesson,
} from '../../api/client'

interface Props {
  npc: NpcSummary
}

interface MindData {
  intents: NpcIntentEntry[]
  lessons: NpcLesson[]
  beliefs: NpcBeliefEntry[]
}

const URGENCY_ICON: Readonly<Record<string, string>> = {
  '非常迫切': '🔴',
  '迫切': '🟠',
  '有些想法': '🟡',
  '不太緊急': '⚪',
}

const BELIEF_KIND_ICON: Readonly<Record<string, string>> = {
  tile_safety: '⚠',
  goods_scarcity: '📉',
  ecosystem_health: '🌿',
  faction_control: '⚑',
}

const CONFIDENCE_COLOR: Record<string, string> = {
  '她確信': 'text-ember-400',
  '她相信': 'text-ember-300',
  '她隱約覺得': 'text-tide-400',
  '她不太確定': 'text-tide-300',
}

export function NpcMindSheet({ npc }: Props) {
  const { token } = useAuth()
  const [data, setData] = useState<MindData | null>(null)
  const [loading, setLoading] = useState(false)
  const [showAllIntents, setShowAllIntents] = useState(false)
  const [showBeliefs, setShowBeliefs] = useState(false)
  const [showLessons, setShowLessons] = useState(false)
  const [showRelation, setShowRelation] = useState(false)
  const npcIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (!token) return
    const npcId = npc.id
    npcIdRef.current = npcId
    setData(null)
    setLoading(true)

    Promise.all([
      api.npcIntent(token, npcId).catch(() => ({ intents: [], lessons: [] })),
      api.npcBeliefs(token, npcId).catch(() => ({ beliefs: [] })),
    ]).then(([intentRes, beliefsRes]) => {
      if (npcIdRef.current !== npcId) return
      setData({
        intents: intentRes.intents,
        lessons: intentRes.lessons,
        beliefs: beliefsRes.beliefs,
      })
      setLoading(false)
    })
  }, [npc.id, token])

  if (loading) {
    return (
      <div className="text-[11px] text-ground-600 italic py-1">讀取中…</div>
    )
  }

  if (!data) return null

  const visibleIntents = showAllIntents ? data.intents : data.intents.slice(0, 2)
  const interactionCount = npc.cognitiveEvolution
    ? npc.cognitiveEvolution.reflectionCount
    : null

  return (
    <div className="flex flex-col gap-2">
      {/* ── 她現在在想什麼 ─────────────────────────────────── */}
      <section className="gi-panel border-ember-800/40 px-3 py-2">
        <div className="font-display text-[10px] uppercase tracking-tightest text-ember-500 mb-1.5">
          她現在在想什麼
        </div>
        {data.intents.length === 0 ? (
          <div className="text-[12px] text-ground-600 italic">她似乎沒有特別的想法</div>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {visibleIntents.map((intent, i) => (
              <li key={i} className="flex flex-col gap-0.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px]" aria-hidden>
                    {URGENCY_ICON[intent.urgencyLabel] ?? '🎯'}
                  </span>
                  <span className="font-display text-[13px] font-bold text-ground-100">
                    {intent.label}
                  </span>
                  <span className="text-[11px] text-ground-500">({intent.urgencyLabel})</span>
                </div>
                <div className="text-[12px] leading-snug text-ground-400 pl-5">
                  {intent.reasonZh}
                </div>
              </li>
            ))}
          </ul>
        )}
        {data.intents.length > 2 && (
          <button
            onClick={() => setShowAllIntents((v) => !v)}
            className="mt-1.5 text-[11px] text-ember-500 hover:text-ember-400 transition-colors"
          >
            {showAllIntents ? '收起' : `還有 ${data.intents.length - 2} 個想法…`}
          </button>
        )}
      </section>

      {/* ── 她相信的事 ─────────────────────────────────────── */}
      {data.beliefs.length > 0 && (
        <section className="gi-panel border-tide-800/40 px-3 py-2">
          <button
            onClick={() => setShowBeliefs((v) => !v)}
            className="w-full flex items-center justify-between"
          >
            <div className="font-display text-[10px] uppercase tracking-tightest text-tide-400">
              她相信的事
            </div>
            <span className="text-[10px] text-ground-600">{showBeliefs ? '▲' : '▼'}</span>
          </button>
          {showBeliefs && (
            <ul className="mt-1.5 flex flex-col gap-1">
              {data.beliefs.map((belief, i) => (
                <li key={i} className="flex items-center gap-1.5">
                  <span className="text-[11px] text-ground-500" aria-hidden>
                    {BELIEF_KIND_ICON[belief.kind] ?? '·'}
                  </span>
                  <span className="text-[12px] text-ground-200 flex-1 leading-snug">
                    {belief.label}
                  </span>
                  <span className={`text-[11px] ${CONFIDENCE_COLOR[belief.confidenceLabel] ?? 'text-ground-500'}`}>
                    {belief.confidenceLabel}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* ── 她學到的教訓 ───────────────────────────────────── */}
      {data.lessons.length > 0 && (
        <section className="gi-panel border-moss-800/40 px-3 py-2">
          <button
            onClick={() => setShowLessons((v) => !v)}
            className="w-full flex items-center justify-between"
          >
            <div className="font-display text-[10px] uppercase tracking-tightest text-moss-400">
              她學到的教訓
            </div>
            <span className="text-[10px] text-ground-600">{showLessons ? '▲' : '▼'}</span>
          </button>
          {showLessons && (
            <ul className="mt-1.5 flex flex-col gap-1">
              {data.lessons.map((lesson, i) => (
                <li key={i} className="flex items-center gap-1.5">
                  <span className="text-[11px] text-moss-600" aria-hidden>✦</span>
                  <span className="text-[12px] text-ground-300 leading-snug">{lesson.text}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* ── 你們的關係 ─────────────────────────────────────── */}
      <section className="gi-panel border-ground-700/40 px-3 py-2">
        <button
          onClick={() => setShowRelation((v) => !v)}
          className="w-full flex items-center justify-between"
        >
          <div className="font-display text-[10px] uppercase tracking-tightest text-ground-500">
            你們的關係
          </div>
          <span className="text-[10px] text-ground-600">{showRelation ? '▲' : '▼'}</span>
        </button>
        {showRelation && (
          <div className="mt-1.5 text-[12px] text-ground-400 flex flex-col gap-0.5">
            <div>
              <span className="text-ground-200">{npc.name}</span>
              <span className="mx-1 text-ground-700">·</span>
              <span>{npc.role}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span>信任</span>
              <RelationBar score={npc.relationshipScore} />
              <span className="text-ground-300 font-data">{npc.relationshipScore}</span>
              <span className="text-ground-600">/100</span>
            </div>
            {interactionCount !== null && (
              <div>見過 <span className="text-ground-300">{interactionCount}</span> 次</div>
            )}
          </div>
        )}
      </section>
    </div>
  )
}

function RelationBar({ score }: { score: number }) {
  const pct = Math.min(100, Math.max(0, score))
  const color = pct >= 60 ? 'bg-ember-500' : pct >= 30 ? 'bg-tide-500' : 'bg-rust-600'
  return (
    <div className="flex-1 h-1.5 rounded-full bg-ground-800 overflow-hidden" style={{ maxWidth: '60px' }}>
      <div
        className={`h-full rounded-full ${color} transition-all`}
        style={{ width: `${pct}%` }}
        aria-hidden
      />
    </div>
  )
}

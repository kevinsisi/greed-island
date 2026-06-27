import { hashCanonicalJson } from '../kernel/canonicalJson.js'
import type { Event } from '../kernel/types.js'

export const PLAYER_NPC_RELATIONSHIP_BOOT_EVENT_TYPES = ['PLAYER_NPC_DIALOGUE'] as const

export type PlayerNpcRelationshipArc = Readonly<{
  playerAccountId: string
  npcId: string
  trust: number
  resentment: number
  familiarity: number
  interactionCount: number
  lastIntent: 'greet' | 'ask' | 'trade'
  lastPlayerMessage: string
  lastTick: number
}>

const RELATIONSHIP_MIN = 0
const RELATIONSHIP_MAX = 100
const DEFAULT_TRUST = 50
const DEFAULT_RESSENTMENT = 50
const DEFAULT_FAMILIARITY = 0
const MAX_MESSAGE_CONTEXT_CHARS = 80

export class PlayerNpcRelationshipProjection {
  private readonly rows = new Map<string, PlayerNpcRelationshipArc>()

  apply(event: Event): void {
    if (event.eventType !== 'PLAYER_NPC_DIALOGUE') return
    const data = extractData(event.payload)
    if (!data) return

    const playerAccountId = readNonEmptyString(data.playerAccountId)
    const npcId = readNonEmptyString(data.npcId)
    const intent = readIntent(data.intent)
    const trustAfter = readFiniteNumber(data.trustAfter)
    const trustDelta = readFiniteNumber(data.trustDelta) ?? 0
    const playerMessage = readNonEmptyString(data.playerMessage) ?? ''
    if (!playerAccountId || !npcId || !intent || trustAfter === null) return

    const key = rowKey(playerAccountId, npcId)
    const current = this.rows.get(key)
    const interactionCount = readFiniteNumber(data.interactionCount)
      ?? ((current?.interactionCount ?? 0) + 1)
    const next: PlayerNpcRelationshipArc = {
      playerAccountId,
      npcId,
      trust: clamp(trustAfter),
      resentment: clamp((current?.resentment ?? DEFAULT_RESSENTMENT) + resentmentDeltaFor(trustDelta)),
      familiarity: clamp((current?.familiarity ?? DEFAULT_FAMILIARITY) + 1),
      interactionCount: Math.max(0, Math.round(interactionCount)),
      lastIntent: intent,
      lastPlayerMessage: summarize(playerMessage),
      lastTick: typeof event.tick === 'number' ? event.tick : current?.lastTick ?? 0,
    }
    this.rows.set(key, next)
  }

  rebuildFromEvents(events: readonly Event[]): void {
    this.rows.clear()
    for (const event of events) this.apply(event)
  }

  read(playerAccountId: string | number, npcId: string): PlayerNpcRelationshipArc | null {
    return this.rows.get(rowKey(String(playerAccountId), npcId)) ?? null
  }

  listForNpc(npcId: string): PlayerNpcRelationshipArc[] {
    return [...this.rows.values()]
      .filter((row) => row.npcId === npcId)
      .sort((a, b) => b.lastTick - a.lastTick || a.playerAccountId.localeCompare(b.playerAccountId))
  }

  canonicalHash(): string {
    return hashCanonicalJson([...this.rows.values()].sort((a, b) => {
      const npc = a.npcId.localeCompare(b.npcId)
      if (npc !== 0) return npc
      return a.playerAccountId.localeCompare(b.playerAccountId)
    }))
  }
}

export function formatPlayerRelationshipContext(row: PlayerNpcRelationshipArc | null): string | null {
  if (!row) return null
  const stance = row.trust >= 70
    ? '信任玩家'
    : row.trust <= 30 || row.resentment >= 65
      ? '戒備玩家'
      : '觀望玩家'
  const recent = row.lastPlayerMessage ? `；最近玩家說：「${row.lastPlayerMessage}」` : ''
  return `玩家關係：${stance}；信任 ${row.trust}；怨懟 ${row.resentment}；熟悉 ${row.familiarity}；互動 ${row.interactionCount} 次${recent}`
}

function extractData(payload: unknown): Record<string, unknown> | null {
  if (!payload || typeof payload !== 'object') return null
  const data = (payload as Record<string, unknown>).data
  if (!data || typeof data !== 'object') return null
  return data as Record<string, unknown>
}

function readNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function readIntent(value: unknown): PlayerNpcRelationshipArc['lastIntent'] | null {
  return value === 'greet' || value === 'ask' || value === 'trade' ? value : null
}

function readFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function resentmentDeltaFor(trustDelta: number): number {
  if (trustDelta < 0) return Math.min(10, Math.abs(Math.round(trustDelta)))
  return 0
}

function summarize(value: string): string {
  const trimmed = value.trim().replace(/\s+/g, ' ')
  return trimmed.length <= MAX_MESSAGE_CONTEXT_CHARS
    ? trimmed
    : `${trimmed.slice(0, MAX_MESSAGE_CONTEXT_CHARS - 1)}…`
}

function rowKey(playerAccountId: string, npcId: string): string {
  return `${playerAccountId}\u0000${npcId}`
}

function clamp(value: number): number {
  if (!Number.isFinite(value)) return RELATIONSHIP_MIN
  return Math.max(RELATIONSHIP_MIN, Math.min(RELATIONSHIP_MAX, Math.round(value)))
}

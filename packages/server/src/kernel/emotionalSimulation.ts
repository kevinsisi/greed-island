// Emotional simulation — a pure derivation over recent NPC memories,
// relationships, and current area pressure. The output is a 0..100
// scalar per emotion; nothing is stored as a writable column. Two
// snapshots taken from the same projection state MUST be byte-equal.

import type { SqliteNpcMemoryStore } from './npcMemory.js'
import type {
  RelationshipRow,
  SqliteNpcRelationshipsStore
} from './npcRelationships.js'

export type EmotionalSnapshot = Readonly<{
  npcId: string
  attachment: number
  tension: number
  trust: number
  loss: number
  derivedFromMemoryCount: number
  derivedFromRelationshipCount: number
}>

export type EmotionalContext = Readonly<{
  /**
   * 0..1 area pressure score for this NPC's current tile. Caller is
   * the only thing that knows where the NPC currently is — projection
   * passes that scalar in so the derivation stays pure.
   */
  areaPressure: number
}>

export function deriveEmotionalSnapshot(
  npcId: string,
  memory: SqliteNpcMemoryStore,
  relationships: SqliteNpcRelationshipsStore,
  context: EmotionalContext
): EmotionalSnapshot {
  const recent = memory.getRecent(npcId, 30)
  const important = memory.getImportant(npcId, 5, 10)
  const rels = relationships.listFor(npcId)

  const friendCount = rels.filter((r) => r.relationshipType === 'friend').length
  const rivalCount = rels.filter((r) => r.relationshipType === 'rival').length

  const trustAverage =
    rels.length === 0
      ? 50
      : Math.round(
          rels.reduce((sum, r) => sum + r.trust, 0) / rels.length
        )

  // Attachment: friends raise it, recent positive interactions raise it
  const positiveInteractions = important.filter(
    (m) =>
      m.memoryType === 'interaction' &&
      typeof (m.content as { mode?: unknown }).mode === 'string' &&
      (m.content as { mode?: string }).mode === 'chat'
  ).length
  const attachment = clamp(
    20 + friendCount * 12 + positiveInteractions * 3,
    0,
    100
  )

  // Tension: rivals + area pressure + recent argues
  const recentArgues = recent.filter(
    (m) =>
      m.memoryType === 'interaction' &&
      typeof (m.content as { mode?: unknown }).mode === 'string' &&
      (m.content as { mode?: string }).mode === 'argue'
  ).length
  const tension = clamp(
    Math.round(
      rivalCount * 15 + context.areaPressure * 40 + recentArgues * 4
    ),
    0,
    100
  )

  // Loss: rivalry + area pressure together — "things going wrong"
  const loss = clamp(
    Math.round(rivalCount * 10 + context.areaPressure * 30 + recentArgues * 2),
    0,
    100
  )

  return {
    npcId,
    attachment,
    tension,
    trust: trustAverage,
    loss,
    derivedFromMemoryCount: recent.length,
    derivedFromRelationshipCount: rels.length
  }
}

export function summarizeRelationshipBreakdown(
  rels: readonly RelationshipRow[]
): { friends: number; rivals: number; neutral: number } {
  let friends = 0
  let rivals = 0
  let neutral = 0
  for (const r of rels) {
    if (r.relationshipType === 'friend') friends += 1
    else if (r.relationshipType === 'rival') rivals += 1
    else neutral += 1
  }
  return { friends, rivals, neutral }
}

function clamp(v: number, lo: number, hi: number): number {
  if (!Number.isFinite(v)) return lo
  return v < lo ? lo : v > hi ? hi : v
}

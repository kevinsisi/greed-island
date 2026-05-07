// NPC relationship projection — derived from `NPC_INTERACT` events.
// Trust is a 0..100 scalar that drifts up on chat (+1) and down on
// argue (−2). The relationship_type promotes/demotes when trust
// crosses 75 (→ friend) or 25 (→ rival), and only across the neutral
// band — never directly between friend and rival.
//
// Rebuildable: drop the table, replay the EventLog, get identical
// rows. Canonical hash is exposed for replay tests.

import Database from 'better-sqlite3'
import { hashCanonicalJson, toCanonicalJson } from './canonicalJson.js'
import type { Event } from './types.js'
import type {
  LivingWorldEventPayload,
  NpcInteractCmd
} from './livingWorldCommands.js'

type DatabaseConnection = Database.Database

export const RELATIONSHIP_TYPES = ['neutral', 'friend', 'rival'] as const
export type RelationshipType = (typeof RELATIONSHIP_TYPES)[number]

export const TRUST_BASE = 50
export const TRUST_MIN = 0
export const TRUST_MAX = 100
export const FRIEND_THRESHOLD = 75
export const RIVAL_THRESHOLD = 25
export const TRUST_DELTA_CHAT = 1
export const TRUST_DELTA_ARGUE = -2
const HISTORY_MAX_ENTRIES = 50

export type RelationshipHistoryEntry = Readonly<{
  tick: number
  mode: 'chat' | 'argue'
  trustAfter: number
  tile: string
}>

export type RelationshipRow = Readonly<{
  npcA: string
  npcB: string
  relationshipType: RelationshipType
  trust: number
  history: readonly RelationshipHistoryEntry[]
  interactionCount: number
  lastTick: number
}>

export class SqliteNpcRelationshipsStore {
  constructor(private readonly db: DatabaseConnection) {
    initializeNpcRelationshipsSchema(db)
  }

  project(event: Event): void {
    if (event.eventType !== 'NPC_INTERACT') return
    if (typeof event.tick !== 'number') return
    const payload = event.payload
    if (!isLivingWorldEventPayload(payload)) return
    const data = payload.data as NpcInteractCmd
    const [a, b] = canonicalPair(data.participants[0], data.participants[1])
    const tick = event.tick

    const current = this.read(a, b)
    const delta =
      data.mode === 'chat' ? TRUST_DELTA_CHAT : TRUST_DELTA_ARGUE
    const trustAfter = clamp(
      (current?.trust ?? TRUST_BASE) + delta,
      TRUST_MIN,
      TRUST_MAX
    )
    const previousType = current?.relationshipType ?? 'neutral'
    const nextType = transitionType(previousType, trustAfter)
    const historyEntry: RelationshipHistoryEntry = {
      tick,
      mode: data.mode,
      trustAfter,
      tile: data.tile
    }
    const history = [
      ...(current?.history ?? []),
      historyEntry
    ].slice(-HISTORY_MAX_ENTRIES)
    const interactionCount = (current?.interactionCount ?? 0) + 1
    const lastTick = Math.max(current?.lastTick ?? 0, tick)

    this.db
      .prepare(
        `INSERT INTO npc_relationships
            (npc_a, npc_b, relationship_type, trust, history_json,
             interaction_count, last_tick)
         VALUES (@npcA, @npcB, @rt, @trust, @history, @ic, @last)
         ON CONFLICT(npc_a, npc_b) DO UPDATE SET
            relationship_type = excluded.relationship_type,
            trust = excluded.trust,
            history_json = excluded.history_json,
            interaction_count = excluded.interaction_count,
            last_tick = excluded.last_tick`
      )
      .run({
        npcA: a,
        npcB: b,
        rt: nextType,
        trust: trustAfter,
        history: toCanonicalJson(history),
        ic: interactionCount,
        last: lastTick
      })
  }

  rebuildFromEvents(events: readonly Event[]): void {
    this.db.exec('DELETE FROM npc_relationships')
    const tx = this.db.transaction(() => {
      for (const event of events) this.project(event)
    })
    tx()
  }

  read(npcA: string, npcB: string): RelationshipRow | null {
    const [a, b] = canonicalPair(npcA, npcB)
    const row = this.db
      .prepare(
        `SELECT npc_a, npc_b, relationship_type, trust, history_json,
                interaction_count, last_tick
           FROM npc_relationships WHERE npc_a = ? AND npc_b = ?`
      )
      .get(a, b) as
      | {
          npc_a: string
          npc_b: string
          relationship_type: RelationshipType
          trust: number
          history_json: string
          interaction_count: number
          last_tick: number
        }
      | undefined
    if (!row) return null
    return rowToRelationship(row)
  }

  listFor(npcId: string): RelationshipRow[] {
    const rows = this.db
      .prepare(
        `SELECT npc_a, npc_b, relationship_type, trust, history_json,
                interaction_count, last_tick
           FROM npc_relationships
          WHERE npc_a = ? OR npc_b = ?
          ORDER BY last_tick DESC`
      )
      .all(npcId, npcId) as Array<{
      npc_a: string
      npc_b: string
      relationship_type: RelationshipType
      trust: number
      history_json: string
      interaction_count: number
      last_tick: number
    }>
    return rows.map(rowToRelationship)
  }

  countRivals(npcId: string): number {
    const row = this.db
      .prepare(
        `SELECT COUNT(*) as c FROM npc_relationships
          WHERE relationship_type = 'rival' AND (npc_a = ? OR npc_b = ?)`
      )
      .get(npcId, npcId) as { c: number }
    return row.c
  }

  countFriends(npcId: string): number {
    const row = this.db
      .prepare(
        `SELECT COUNT(*) as c FROM npc_relationships
          WHERE relationship_type = 'friend' AND (npc_a = ? OR npc_b = ?)`
      )
      .get(npcId, npcId) as { c: number }
    return row.c
  }

  /** Deterministic hash of all rows — used by replay tests. */
  canonicalHash(): string {
    const rows = this.db
      .prepare(
        `SELECT npc_a, npc_b, relationship_type, trust, history_json,
                interaction_count, last_tick
           FROM npc_relationships
          ORDER BY npc_a ASC, npc_b ASC`
      )
      .all() as Array<{
      npc_a: string
      npc_b: string
      relationship_type: RelationshipType
      trust: number
      history_json: string
      interaction_count: number
      last_tick: number
    }>
    return hashCanonicalJson(rows.map(rowToRelationship))
  }
}

export function initializeNpcRelationshipsSchema(db: DatabaseConnection): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS npc_relationships (
      npc_a TEXT NOT NULL,
      npc_b TEXT NOT NULL,
      relationship_type TEXT NOT NULL,
      trust INTEGER NOT NULL,
      history_json TEXT NOT NULL,
      interaction_count INTEGER NOT NULL,
      last_tick INTEGER NOT NULL,
      PRIMARY KEY (npc_a, npc_b),
      CHECK (npc_a < npc_b)
    );
    CREATE INDEX IF NOT EXISTS idx_npc_relationships_a ON npc_relationships(npc_a);
    CREATE INDEX IF NOT EXISTS idx_npc_relationships_b ON npc_relationships(npc_b);
    CREATE INDEX IF NOT EXISTS idx_npc_relationships_type ON npc_relationships(relationship_type);
  `)
}

export function canonicalPair(x: string, y: string): readonly [string, string] {
  return x < y ? [x, y] : [y, x]
}

function transitionType(
  current: RelationshipType,
  trust: number
): RelationshipType {
  // Promote into a non-neutral type only by crossing the threshold from
  // the neutral band; demote out of friend/rival back to neutral once
  // trust returns to the neutral band [25, 75].
  if (current === 'friend') {
    return trust < RIVAL_THRESHOLD
      ? 'neutral' // can't jump straight to rival; pass through neutral
      : trust < FRIEND_THRESHOLD - 5
      ? 'neutral'
      : 'friend'
  }
  if (current === 'rival') {
    return trust > FRIEND_THRESHOLD
      ? 'neutral'
      : trust > RIVAL_THRESHOLD + 5
      ? 'neutral'
      : 'rival'
  }
  // neutral
  if (trust > FRIEND_THRESHOLD) return 'friend'
  if (trust < RIVAL_THRESHOLD) return 'rival'
  return 'neutral'
}

function rowToRelationship(row: {
  npc_a: string
  npc_b: string
  relationship_type: RelationshipType
  trust: number
  history_json: string
  interaction_count: number
  last_tick: number
}): RelationshipRow {
  return {
    npcA: row.npc_a,
    npcB: row.npc_b,
    relationshipType: row.relationship_type,
    trust: row.trust,
    history: JSON.parse(row.history_json) as RelationshipHistoryEntry[],
    interactionCount: row.interaction_count,
    lastTick: row.last_tick
  }
}

function clamp(v: number, lo: number, hi: number): number {
  if (!Number.isFinite(v)) return lo
  return v < lo ? lo : v > hi ? hi : v
}

function isLivingWorldEventPayload(value: unknown): value is LivingWorldEventPayload {
  if (!value || typeof value !== 'object') return false
  const r = value as Record<string, unknown>
  if (typeof r.actorType !== 'string') return false
  if (!('data' in r) || typeof r.data !== 'object' || r.data === null) return false
  return true
}

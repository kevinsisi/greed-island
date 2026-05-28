// NPC relationship projection — multi-dimensional (v0.87.0).
//
// PRIOR: single trust 0..100 scalar from `NPC_INTERACT` only.
// NOW: 8-dimensional directional vector { trust, fear, respect, attraction,
// loyalty, resentment, dependency, familiarity }, per ordered direction
// (a→b and b→a stored together in the same row's dimensions_json).
//
// Sources of deltas:
//   - NPC_INTERACT chat/argue → trust + familiarity + resentment (symmetric)
//   - NPC_HOUSEHOLD_FORMED partners=[a,b] → attraction +30, dep +20, fam +20, trust +5 (symmetric)
//   - NPC_MENTORSHIP_COMPLETED mentor=m, apprentice=a → asymmetric per direction
//   - NPC_DECEASED victim=v → for each w with respect(w→v)≥60: respect +10, fear -20
//   - NPC_RELATIONSHIP_DIMENSION_ADJUSTED → single-dimension explicit adjust
//
// Storage: SQLite row keyed by canonical pair (npc_a < npc_b). dimensions_json
// contains both directions. trust column kept for backward-compat queries (= dim.aToB.trust).
//
// Rebuildable: drop the table, replay the EventLog, get identical
// rows. Canonical hash is exposed for replay tests.
//
// Spec: openspec/changes/npc-npc-multi-dim-relationship/specs/npc-relationship-dimensions/spec.md

import Database from 'better-sqlite3'
import { hashCanonicalJson, toCanonicalJson } from './canonicalJson.js'
import type { Event } from './types.js'
import type {
  LivingWorldEventPayload,
  NpcInteractCmd
} from './livingWorldCommands.js'

type DatabaseConnection = Database.Database

export const RELATIONSHIP_TYPES = [
  'neutral',
  'friend',
  'rival',
  'lover',
  'mentor',
  'apprentice',
  'feared',
] as const
export type RelationshipType = (typeof RELATIONSHIP_TYPES)[number]

export const TRUST_BASE = 50
export const TRUST_MIN = 0
export const TRUST_MAX = 100
export const FRIEND_THRESHOLD = 75
export const RIVAL_THRESHOLD = 25
export const TRUST_DELTA_CHAT = 1
export const TRUST_DELTA_ARGUE = -2
const HISTORY_MAX_ENTRIES = 50

// --- 8-Dimension model ---
export type RelationshipDimensions = Readonly<{
  trust: number
  fear: number
  respect: number
  attraction: number
  loyalty: number
  resentment: number
  dependency: number
  familiarity: number
}>

export const DEFAULT_DIMENSIONS: RelationshipDimensions = {
  trust: 50,
  fear: 50,
  respect: 50,
  attraction: 50,
  loyalty: 50,
  resentment: 50,
  dependency: 50,
  familiarity: 0,
}

export type DimensionKey = keyof RelationshipDimensions

export type DirectionalDimensions = Readonly<{
  aToB: RelationshipDimensions
  bToA: RelationshipDimensions
}>

export const DEFAULT_DIRECTIONAL: DirectionalDimensions = {
  aToB: DEFAULT_DIMENSIONS,
  bToA: DEFAULT_DIMENSIONS,
}

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
  /** Convenience field: equals dimensions.aToB.trust. */
  trust: number
  dimensions: DirectionalDimensions
  history: readonly RelationshipHistoryEntry[]
  interactionCount: number
  lastTick: number
}>

// Resolver inputs for relationship type derivation
export type RelationshipTypeResolverInput = Readonly<{
  /** Dimensions for THIS direction (from→to). */
  dims: RelationshipDimensions
  /** True if "from" is the apprentice of "to". */
  isApprenticeOf: boolean
  /** True if "from" is the mentor of "to". */
  isMentorOf: boolean
}>

/**
 * Composite type resolver per `relationship-type-derivation` spec.
 * Precedence: lover > apprentice > mentor > feared > rival > friend > neutral.
 */
export function resolveRelationshipType(input: RelationshipTypeResolverInput): RelationshipType {
  const { dims, isApprenticeOf, isMentorOf } = input
  if (dims.attraction >= 70 && dims.trust >= 60) return 'lover'
  if (isApprenticeOf && dims.respect >= 70 && dims.loyalty >= 60 && dims.fear < 40) return 'apprentice'
  if (isMentorOf && dims.respect >= 60 && dims.attraction >= 50 && dims.fear < 40) return 'mentor'
  if (dims.fear >= 70) return 'feared'
  if (dims.resentment >= 60 || (dims.trust <= 25 && dims.respect <= 40)) return 'rival'
  if (dims.trust >= 70 && dims.respect >= 50) return 'friend'
  return 'neutral'
}

export class SqliteNpcRelationshipsStore {
  constructor(private readonly db: DatabaseConnection) {
    initializeNpcRelationshipsSchema(db)
  }

  project(event: Event): void {
    if (typeof event.tick !== 'number') return
    const payload = event.payload
    if (!isLivingWorldEventPayload(payload)) return

    switch (event.eventType) {
      case 'NPC_INTERACT':
        return this.projectInteract(payload.data as NpcInteractCmd, event.tick)
      case 'NPC_HOUSEHOLD_FORMED':
        return this.projectHouseholdFormed(payload.data as { partnerNpcIds?: unknown }, event.tick)
      case 'NPC_MENTORSHIP_COMPLETED':
        return this.projectMentorshipCompleted(
          payload.data as { mentorNpcId?: unknown; apprenticeNpcId?: unknown },
          event.tick
        )
      case 'NPC_DECEASED':
        return this.projectDeceased(payload.data as { npcId?: unknown }, event.tick)
      case 'NPC_RELATIONSHIP_DIMENSION_ADJUSTED':
        return this.projectDimensionAdjusted(
          payload.data as {
            from?: unknown
            to?: unknown
            dimension?: unknown
            delta?: unknown
          },
          event.tick
        )
      default:
        return
    }
  }

  // --- Per-event projectors ---

  private projectInteract(data: NpcInteractCmd, tick: number): void {
    const [a, b] = canonicalPair(data.participants[0], data.participants[1])
    const current = this.read(a, b) ?? this.makeRow(a, b)
    const trustDelta = data.mode === 'chat' ? TRUST_DELTA_CHAT : TRUST_DELTA_ARGUE

    // Apply symmetric deltas
    const next = current
    const newAToB = applyDeltas(next.dimensions.aToB, {
      trust: trustDelta,
      familiarity: 1,
      resentment: data.mode === 'argue' ? 2 : -1,
    })
    const newBToA = applyDeltas(next.dimensions.bToA, {
      trust: trustDelta,
      familiarity: 1,
      resentment: data.mode === 'argue' ? 2 : -1,
    })

    const historyEntry: RelationshipHistoryEntry = {
      tick,
      mode: data.mode,
      trustAfter: newAToB.trust,
      tile: data.tile,
    }
    const history = [...next.history, historyEntry].slice(-HISTORY_MAX_ENTRIES)

    this.writeRow({
      npcA: a,
      npcB: b,
      dimensions: { aToB: newAToB, bToA: newBToA },
      history,
      interactionCount: next.interactionCount + 1,
      lastTick: Math.max(next.lastTick, tick),
    })
  }

  private projectHouseholdFormed(data: { partnerNpcIds?: unknown }, tick: number): void {
    if (!Array.isArray(data.partnerNpcIds) || data.partnerNpcIds.length < 2) return
    const [p1, p2] = data.partnerNpcIds
    if (typeof p1 !== 'string' || typeof p2 !== 'string') return
    const [a, b] = canonicalPair(p1, p2)
    const current = this.read(a, b) ?? this.makeRow(a, b)
    const delta = { attraction: 30, dependency: 20, familiarity: 20, trust: 5 }
    this.writeRow({
      npcA: a,
      npcB: b,
      dimensions: {
        aToB: applyDeltas(current.dimensions.aToB, delta),
        bToA: applyDeltas(current.dimensions.bToA, delta),
      },
      history: current.history,
      interactionCount: current.interactionCount,
      lastTick: Math.max(current.lastTick, tick),
    })
  }

  private projectMentorshipCompleted(
    data: { mentorNpcId?: unknown; apprenticeNpcId?: unknown },
    tick: number
  ): void {
    const mentor = typeof data.mentorNpcId === 'string' ? data.mentorNpcId : null
    const apprentice = typeof data.apprenticeNpcId === 'string' ? data.apprenticeNpcId : null
    if (!mentor || !apprentice) return
    const [a, b] = canonicalPair(mentor, apprentice)
    const current = this.read(a, b) ?? this.makeRow(a, b)
    // Determine which direction is mentor→apprentice
    const mentorIsA = a === mentor
    const apprenticeToMentor = { respect: 20, loyalty: 15, familiarity: 10 }
    const mentorToApprentice = { attraction: 10, respect: 5, familiarity: 10 }
    this.writeRow({
      npcA: a,
      npcB: b,
      dimensions: {
        aToB: applyDeltas(
          current.dimensions.aToB,
          mentorIsA ? mentorToApprentice : apprenticeToMentor
        ),
        bToA: applyDeltas(
          current.dimensions.bToA,
          mentorIsA ? apprenticeToMentor : mentorToApprentice
        ),
      },
      history: current.history,
      interactionCount: current.interactionCount,
      lastTick: Math.max(current.lastTick, tick),
    })
  }

  private projectDeceased(data: { npcId?: unknown }, tick: number): void {
    const victim = typeof data.npcId === 'string' ? data.npcId : null
    if (!victim) return
    // For every relationship involving the victim, check if the OTHER NPC has
    // respect(other→victim) ≥ 60; if so, apply grief (respect +10, fear -20).
    const rows = this.listFor(victim)
    for (const row of rows) {
      const other = row.npcA === victim ? row.npcB : row.npcA
      const [a, b] = canonicalPair(other, victim)
      const otherIsA = a === other
      const otherToVictim = otherIsA ? row.dimensions.aToB : row.dimensions.bToA
      if (otherToVictim.respect < 60) continue
      const updatedOtherToVictim = applyDeltas(otherToVictim, { respect: 10, fear: -20 })
      const newAToB = otherIsA ? updatedOtherToVictim : row.dimensions.aToB
      const newBToA = otherIsA ? row.dimensions.bToA : updatedOtherToVictim
      this.writeRow({
        npcA: a,
        npcB: b,
        dimensions: { aToB: newAToB, bToA: newBToA },
        history: row.history,
        interactionCount: row.interactionCount,
        lastTick: Math.max(row.lastTick, tick),
      })
    }
  }

  private projectDimensionAdjusted(
    data: { from?: unknown; to?: unknown; dimension?: unknown; delta?: unknown },
    tick: number
  ): void {
    const from = typeof data.from === 'string' ? data.from : null
    const to = typeof data.to === 'string' ? data.to : null
    const dimension = typeof data.dimension === 'string' ? (data.dimension as DimensionKey) : null
    const delta = typeof data.delta === 'number' ? data.delta : null
    if (!from || !to || !dimension || delta === null) return
    if (!(dimension in DEFAULT_DIMENSIONS)) return
    if (from === to) return
    const [a, b] = canonicalPair(from, to)
    const current = this.read(a, b) ?? this.makeRow(a, b)
    const fromIsA = a === from
    const direction = fromIsA ? 'aToB' : 'bToA'
    const updated = applyDeltas(current.dimensions[direction], { [dimension]: delta })
    this.writeRow({
      npcA: a,
      npcB: b,
      dimensions: {
        ...current.dimensions,
        [direction]: updated,
      } as DirectionalDimensions,
      history: current.history,
      interactionCount: current.interactionCount,
      lastTick: Math.max(current.lastTick, tick),
    })
  }

  // --- Helpers ---

  private makeRow(npcA: string, npcB: string): RelationshipRow {
    return {
      npcA,
      npcB,
      relationshipType: 'neutral',
      trust: DEFAULT_DIMENSIONS.trust,
      dimensions: DEFAULT_DIRECTIONAL,
      history: [],
      interactionCount: 0,
      lastTick: 0,
    }
  }

  private writeRow(input: {
    npcA: string
    npcB: string
    dimensions: DirectionalDimensions
    history: readonly RelationshipHistoryEntry[]
    interactionCount: number
    lastTick: number
  }): void {
    // Resolver inputs (a→b) — mentor/apprentice flags not yet wired (Q4 future)
    const relationshipType = resolveRelationshipType({
      dims: input.dimensions.aToB,
      isApprenticeOf: false,
      isMentorOf: false,
    })
    this.db
      .prepare(
        `INSERT INTO npc_relationships
            (npc_a, npc_b, relationship_type, trust, dimensions_json,
             history_json, interaction_count, last_tick)
         VALUES (@npcA, @npcB, @rt, @trust, @dim, @history, @ic, @last)
         ON CONFLICT(npc_a, npc_b) DO UPDATE SET
            relationship_type = excluded.relationship_type,
            trust = excluded.trust,
            dimensions_json = excluded.dimensions_json,
            history_json = excluded.history_json,
            interaction_count = excluded.interaction_count,
            last_tick = excluded.last_tick`
      )
      .run({
        npcA: input.npcA,
        npcB: input.npcB,
        rt: relationshipType,
        trust: input.dimensions.aToB.trust,
        dim: toCanonicalJson(input.dimensions),
        history: toCanonicalJson(input.history),
        ic: input.interactionCount,
        last: input.lastTick,
      })
  }

  rebuildFromEvents(events: readonly Event[]): void {
    this.db.exec('DELETE FROM npc_relationships')
    const tx = this.db.transaction(() => {
      for (const event of events) this.project(event)
    })
    tx()
  }

  countAll(): number {
    const row = this.db
      .prepare('SELECT COUNT(*) as c FROM npc_relationships')
      .get() as { c: number }
    return row.c
  }

  read(npcA: string, npcB: string): RelationshipRow | null {
    const [a, b] = canonicalPair(npcA, npcB)
    const row = this.db
      .prepare(
        `SELECT npc_a, npc_b, relationship_type, trust, dimensions_json,
                history_json, interaction_count, last_tick
           FROM npc_relationships WHERE npc_a = ? AND npc_b = ?`
      )
      .get(a, b) as DbRow | undefined
    if (!row) return null
    return rowToRelationship(row)
  }

  /**
   * Read dimensions in the direction `from → to`. Returns null if no row exists.
   * The eight-axis vector reflects how `from` feels about `to`.
   */
  readDirectional(from: string, to: string): RelationshipDimensions | null {
    const row = this.read(from, to)
    if (!row) return null
    const fromIsA = row.npcA === from
    return fromIsA ? row.dimensions.aToB : row.dimensions.bToA
  }

  listFor(npcId: string): RelationshipRow[] {
    const rows = this.db
      .prepare(
        `SELECT npc_a, npc_b, relationship_type, trust, dimensions_json,
                history_json, interaction_count, last_tick
           FROM npc_relationships
          WHERE npc_a = ? OR npc_b = ?
          ORDER BY last_tick DESC`
      )
      .all(npcId, npcId) as DbRow[]
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
        `SELECT npc_a, npc_b, relationship_type, trust, dimensions_json,
                history_json, interaction_count, last_tick
           FROM npc_relationships
          ORDER BY npc_a ASC, npc_b ASC`
      )
      .all() as DbRow[]
    return hashCanonicalJson(rows.map(rowToRelationship))
  }
}

type DbRow = {
  npc_a: string
  npc_b: string
  relationship_type: RelationshipType
  trust: number
  dimensions_json: string | null
  history_json: string
  interaction_count: number
  last_tick: number
}

export function initializeNpcRelationshipsSchema(db: DatabaseConnection): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS npc_relationships (
      npc_a TEXT NOT NULL,
      npc_b TEXT NOT NULL,
      relationship_type TEXT NOT NULL,
      trust INTEGER NOT NULL,
      dimensions_json TEXT,
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
  // Forward-only migration: add dimensions_json column if it doesn't exist.
  // SQLite ignores DUPLICATE COLUMN errors via the try/catch dance, but
  // PRAGMA table_info lets us check cheaply.
  const cols = db
    .prepare(`PRAGMA table_info(npc_relationships)`)
    .all() as Array<{ name: string }>
  if (!cols.some((c) => c.name === 'dimensions_json')) {
    db.exec(`ALTER TABLE npc_relationships ADD COLUMN dimensions_json TEXT`)
  }
}

export function canonicalPair(x: string, y: string): readonly [string, string] {
  return x < y ? [x, y] : [y, x]
}

function applyDeltas(
  current: RelationshipDimensions,
  deltas: Partial<Record<DimensionKey, number>>
): RelationshipDimensions {
  const next: Record<DimensionKey, number> = { ...current }
  for (const key of Object.keys(deltas) as DimensionKey[]) {
    const d = deltas[key]
    if (typeof d !== 'number') continue
    next[key] = clamp(current[key] + d, TRUST_MIN, TRUST_MAX)
  }
  return next as RelationshipDimensions
}

function rowToRelationship(row: DbRow): RelationshipRow {
  const dimensions: DirectionalDimensions = row.dimensions_json
    ? (JSON.parse(row.dimensions_json) as DirectionalDimensions)
    : DEFAULT_DIRECTIONAL
  // Keep the convenience `trust` field aligned with aToB
  const trust = dimensions.aToB.trust
  return {
    npcA: row.npc_a,
    npcB: row.npc_b,
    relationshipType: row.relationship_type,
    trust,
    dimensions,
    history: JSON.parse(row.history_json) as RelationshipHistoryEntry[],
    interactionCount: row.interaction_count,
    lastTick: row.last_tick,
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

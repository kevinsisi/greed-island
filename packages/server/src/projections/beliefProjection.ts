import type { Event } from '../kernel/types.js'

const FOOD_GOODS_IDS = new Set(['fish', 'meat', 'grain'])

export type BeliefSubjectKind =
  | 'tile_safety'
  | 'goods_scarcity'
  | 'ecosystem_health'
  | 'faction_control'

export type BeliefValue =
  | 'dangerous' | 'safe'
  | 'scarce' | 'abundant'
  | 'depleted' | 'recovering'
  | 'controlled' | 'contested' | 'free'

export type EmotionalTag = 'fear' | 'worry' | 'relief' | 'anger' | 'hope'

export interface BeliefRow {
  npcId: string
  subject: BeliefSubjectKind
  qualifier: string
  /** 0–100 */
  value: BeliefValue
  confidence: number
  observedAtTick: number
  decayRatePerDay: number
  emotionalTag?: EmotionalTag
}

// World tile adjacency (borders).
export const TILE_ADJACENCY: Readonly<Record<string, readonly string[]>> = {
  t_central: ['t_dock', 't_forest', 't_ruin', 't_temple', 't_dimai'],
  t_dock:    ['t_central', 't_forest'],
  t_forest:  ['t_central', 't_dock', 't_mountain'],
  t_ruin:    ['t_central', 't_temple'],
  t_temple:  ['t_central', 't_ruin', 't_dimai'],
  t_dimai:   ['t_central', 't_temple', 't_mountain'],
  t_mountain: ['t_forest', 't_dimai'],
}

function subjectKey(subject: BeliefSubjectKind, qualifier: string): string {
  return `${subject}|${qualifier}`
}

export class BeliefProjection {
  // npcId → (subject|qualifier → row)
  private readonly rowsByNpc = new Map<string, Map<string, BeliefRow>>()

  apply(event: Event, npcLocations: ReadonlyMap<string, string>): void {
    const data = readPayloadData(event)
    if (!data) return

    switch (event.eventType) {
      case 'FACTION_TILE_SEIZED':
        this.applyFactionSeized(data, event.tick ?? 0, npcLocations)
        break
      case 'ANIMAL_ATTACKED_NPC':
        this.applyAnimalAttack(data, event.tick ?? 0, npcLocations)
        break
      case 'GOODS_CONSUMED':
        this.applyGoodsConsumed(data, event.tick ?? 0, npcLocations)
        break
    }
  }

  private applyFactionSeized(
    data: Record<string, unknown>,
    tick: number,
    npcLocations: ReadonlyMap<string, string>,
  ): void {
    const tileId = readStr(data.tileId)
    if (!tileId) return
    for (const [npcId, npcTile] of npcLocations) {
      const conf = perceiveConfidence(npcTile, tileId)
      if (conf === 0) continue
      this.upsert({
        npcId, subject: 'tile_safety', qualifier: tileId,
        value: 'dangerous', confidence: conf, observedAtTick: tick,
        decayRatePerDay: 2, emotionalTag: 'fear',
      })
      this.upsert({
        npcId, subject: 'faction_control', qualifier: tileId,
        value: 'controlled', confidence: conf, observedAtTick: tick,
        decayRatePerDay: 1,
      })
    }
  }

  private applyAnimalAttack(
    data: Record<string, unknown>,
    tick: number,
    npcLocations: ReadonlyMap<string, string>,
  ): void {
    const tileId = readStr(data.tileId)
    if (!tileId) return
    for (const [npcId, npcTile] of npcLocations) {
      const conf = perceiveConfidence(npcTile, tileId)
      if (conf === 0) continue
      this.upsert({
        npcId, subject: 'tile_safety', qualifier: tileId,
        value: 'dangerous', confidence: conf, observedAtTick: tick,
        decayRatePerDay: 3, emotionalTag: 'fear',
      })
    }
  }

  private applyGoodsConsumed(
    data: Record<string, unknown>,
    tick: number,
    npcLocations: ReadonlyMap<string, string>,
  ): void {
    const goodsId = readStr(data.goodsId)
    if (!FOOD_GOODS_IDS.has(goodsId)) return
    const tileId = readStr(data.tileId)
    if (!tileId) return
    for (const [npcId, npcTile] of npcLocations) {
      const rawConf = perceiveConfidence(npcTile, tileId)
      if (rawConf === 0) continue
      // direct = 80, adjacent = 35 (lower than safety events; food scarcity is indirect signal)
      const conf = rawConf === 90 ? 80 : 35
      this.upsert({
        npcId, subject: 'goods_scarcity', qualifier: goodsId,
        value: 'scarce', confidence: conf, observedAtTick: tick,
        decayRatePerDay: 4, emotionalTag: 'worry',
      })
    }
  }

  tick(currentTick: number): void {
    const currentDay = Math.floor(currentTick / 24)
    for (const [npcId, npcMap] of this.rowsByNpc) {
      for (const [key, row] of npcMap) {
        const observedDay = Math.floor(row.observedAtTick / 24)
        const daysPassed = currentDay - observedDay
        if (daysPassed <= 0) continue
        const newConf = row.confidence - row.decayRatePerDay * daysPassed
        if (newConf <= 0) {
          npcMap.delete(key)
        } else {
          npcMap.set(key, { ...row, confidence: newConf, observedAtTick: currentTick })
        }
      }
      if (npcMap.size === 0) this.rowsByNpc.delete(npcId)
    }
  }

  updateEcosystemBeliefs(
    _tileId: string,
    _densityPct: number,
    _currentTick: number,
    _npcLocations: ReadonlyMap<string, string>,
  ): void {
    // TODO: write ecosystem_health beliefs when densityPct < 0.20
  }

  getBeliefs(npcId: string): readonly BeliefRow[] {
    return [...(this.rowsByNpc.get(npcId)?.values() ?? [])]
  }

  private upsert(row: BeliefRow): void {
    let npcMap = this.rowsByNpc.get(row.npcId)
    if (!npcMap) {
      npcMap = new Map()
      this.rowsByNpc.set(row.npcId, npcMap)
    }
    npcMap.set(subjectKey(row.subject, row.qualifier), row)
  }
}

function readPayloadData(event: Event): Record<string, unknown> | null {
  const data = (event.payload as { data?: unknown } | null)?.data
  if (!data || typeof data !== 'object') return null
  return data as Record<string, unknown>
}

function readStr(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

function perceiveConfidence(npcTile: string, eventTile: string): number {
  if (npcTile === eventTile) return 90
  const adjacent = TILE_ADJACENCY[npcTile] ?? []
  if (adjacent.includes(eventTile)) return 40
  return 0
}

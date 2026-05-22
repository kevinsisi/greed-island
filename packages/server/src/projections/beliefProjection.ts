import type { Event } from '../kernel/types.js'

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

// Row key: npcId + '|' + subject + '|' + qualifier
function rowKey(npcId: string, subject: BeliefSubjectKind, qualifier: string): string {
  return `${npcId}|${subject}|${qualifier}`
}

export class BeliefProjection {
  private readonly rows = new Map<string, BeliefRow>()

  apply(_event: Event, _npcLocations: ReadonlyMap<string, string>): void {
    // TODO: implement per-event handlers
  }

  tick(_currentTick: number): void {
    // TODO: decay confidence by decayRatePerDay; delete rows ≤ 0
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
    return [...this.rows.values()].filter(r => r.npcId === npcId)
  }

  // Internal helpers
  protected upsert(row: BeliefRow): void {
    this.rows.set(rowKey(row.npcId, row.subject, row.qualifier), row)
  }
}

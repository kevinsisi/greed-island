import { describe, expect, it } from 'vitest'
import {
  buildActionButtons,
  formatDecaySummary,
  selectNarrativeItems,
  ticksToHoursLabel,
  wygHasContent,
  type NarrativeItem,
} from './whenYouWereGoneLogic'
import type { ServerCatchUpSummary, PlayerNeedsState } from '../../api/client'

function makeWorld(overrides: Partial<ServerCatchUpSummary> = {}): ServerCatchUpSummary {
  return {
    sinceTick: 100,
    untilTick: 200,
    totalEvents: 0,
    byNpc: {},
    byArea: {},
    worldEvents: [],
    weatherChanges: [],
    seasonChanges: [],
    pressureMoments: [],
    productiveActions: [],
    constructionProgress: [],
    expansions: [],
    households: [],
    lifeGoals: [],
    interactions: [],
    digest: '',
    ...overrides,
  }
}

function makeNeeds(overrides: Partial<PlayerNeedsState> = {}): PlayerNeedsState {
  return { nourishment: 80, vigor: 80, collapsed: false, asOfTick: 200, ...overrides }
}

function makeAction(tile: string, narration: string, npcId = 'npc1') {
  return { tick: 1, tile, npcId, domain: 'food', metric: 'fish', delta: 1, narration }
}

describe('selectNarrativeItems', () => {
  it('returns empty array when world is null', () => {
    expect(selectNarrativeItems(null)).toEqual([])
  })

  it('returns empty when no events', () => {
    expect(selectNarrativeItems(makeWorld())).toEqual([])
  })

  it('caps output at 3 items', () => {
    const world = makeWorld({
      productiveActions: [
        makeAction('t_dock', 'Mira 釣魚。'),
        makeAction('t_forest', 'Theo 伐木。', 'npc2'),
        makeAction('t_mountain', 'Rosa 採礦。', 'npc3'),
        makeAction('t_ruin', 'Kira 挖廢料。', 'npc4'),
      ],
    })
    expect(selectNarrativeItems(world)).toHaveLength(3)
  })

  it('prioritises productive actions over pressure moments', () => {
    const world = makeWorld({
      productiveActions: [makeAction('t_dock', 'Mira 釣了魚。')],
      pressureMoments: [{ tick: 2, tileId: 't_salt_marsh', kind: 'pressure.food_shortage', narration: '鹽沼糧食告急。' }],
    })
    const [first, second] = selectNarrativeItems(world)
    expect(first!.sentence).toBe('Mira 釣了魚。')
    expect(second!.sentence).toBe('鹽沼糧食告急。')
  })

  it('maps tile id to Chinese area name', () => {
    const world = makeWorld({
      productiveActions: [makeAction('t_dock', 'Mira 在碼頭工作。')],
    })
    const [item] = selectNarrativeItems(world)
    expect(item!.tileId).toBe('t_dock')
    expect(item!.areaName).toBe('碼頭區')
  })

  it('skips items with empty narration', () => {
    const world = makeWorld({
      productiveActions: [
        makeAction('t_dock', ''),
        makeAction('t_forest', 'Theo 採木材。', 'npc2'),
      ],
    })
    const items = selectNarrativeItems(world)
    expect(items).toHaveLength(1)
    expect(items[0]!.sentence).toBe('Theo 採木材。')
  })

  it('includes world events at lowest priority', () => {
    const world = makeWorld({
      worldEvents: [{ tick: 1, templateId: 'evt1', type: 'eco', scope: 'world', narration: '世界風暴來臨。' }],
    })
    const items = selectNarrativeItems(world)
    expect(items).toHaveLength(1)
    expect(items[0]!.sentence).toBe('世界風暴來臨。')
    expect(items[0]!.tileId).toBeNull()
  })
})

describe('formatDecaySummary', () => {
  it('returns null when needs is null', () => {
    expect(formatDecaySummary(null)).toBeNull()
  })

  it('returns null when both needs are healthy (≥75)', () => {
    expect(formatDecaySummary(makeNeeds({ nourishment: 75, vigor: 80 }))).toBeNull()
    expect(formatDecaySummary(makeNeeds({ nourishment: 80, vigor: 75 }))).toBeNull()
  })

  it('mentions nourishment when it drops below 75', () => {
    const result = formatDecaySummary(makeNeeds({ nourishment: 48, vigor: 80 }))
    expect(result).toContain('溫飽掉到 48%')
    expect(result).toContain('體況尚可')
  })

  it('mentions both values when vigor is also low', () => {
    const result = formatDecaySummary(makeNeeds({ nourishment: 48, vigor: 50 }))
    expect(result).toContain('溫飽掉到 48%')
    expect(result).toContain('體況降至 50%')
  })

  it('reports collapsed state', () => {
    const result = formatDecaySummary(makeNeeds({ nourishment: 10, vigor: 5, collapsed: true }))
    expect(result).toContain('已倒下')
    expect(result).toContain('10%')
    expect(result).toContain('5%')
  })

  it('rounds fractional values', () => {
    const result = formatDecaySummary(makeNeeds({ nourishment: 48.7, vigor: 80 }))
    expect(result).toContain('49%')
  })
})

describe('ticksToHoursLabel', () => {
  it('returns "片刻之間" for zero or negative diff', () => {
    expect(ticksToHoursLabel(100, 100)).toBe('片刻之間')
    expect(ticksToHoursLabel(100, 90)).toBe('片刻之間')
  })

  it('returns tick count when diff is less than 1 hour (12 ticks)', () => {
    expect(ticksToHoursLabel(100, 105)).toBe('5 個時段')
  })

  it('returns "1 小時" for exactly 12 ticks', () => {
    expect(ticksToHoursLabel(0, 12)).toBe('1 小時')
  })

  it('returns "N 小時" for multi-hour diffs', () => {
    expect(ticksToHoursLabel(0, 96)).toBe('8 小時')
    expect(ticksToHoursLabel(0, 24)).toBe('2 小時')
  })
})

describe('buildActionButtons', () => {
  it('always includes a dismiss button', () => {
    const buttons = buildActionButtons([], null)
    expect(buttons.some((b) => b.kind === 'dismiss')).toBe(true)
  })

  it('adds a navigate button for items with tileId', () => {
    const items: NarrativeItem[] = [{ sentence: '…', tileId: 't_dock', areaName: '碼頭區' }]
    const navButtons = buildActionButtons(items, null).filter((b) => b.kind === 'navigate')
    expect(navButtons).toHaveLength(1)
    expect(navButtons[0]!.label).toContain('碼頭區')
    expect(navButtons[0]!.tileId).toBe('t_dock')
  })

  it('deduplicates navigate buttons by tileId', () => {
    const items: NarrativeItem[] = [
      { sentence: 'A', tileId: 't_dock', areaName: '碼頭區' },
      { sentence: 'B', tileId: 't_dock', areaName: '碼頭區' },
    ]
    expect(buildActionButtons(items, null).filter((b) => b.kind === 'navigate')).toHaveLength(1)
  })

  it('caps navigate buttons at 2', () => {
    const items: NarrativeItem[] = [
      { sentence: 'A', tileId: 't_dock', areaName: '碼頭區' },
      { sentence: 'B', tileId: 't_forest', areaName: '潮見丘' },
      { sentence: 'C', tileId: 't_mountain', areaName: '煙嵐山' },
    ]
    expect(buildActionButtons(items, null).filter((b) => b.kind === 'navigate')).toHaveLength(2)
  })

  it('adds eat button when nourishment < 60', () => {
    const buttons = buildActionButtons([], makeNeeds({ nourishment: 40 }))
    expect(buttons.some((b) => b.kind === 'eat')).toBe(true)
  })

  it('omits eat button when nourishment ≥ 60', () => {
    expect(buildActionButtons([], makeNeeds({ nourishment: 60 })).some((b) => b.kind === 'eat')).toBe(false)
    expect(buildActionButtons([], makeNeeds({ nourishment: 75 })).some((b) => b.kind === 'eat')).toBe(false)
  })

  it('skips navigate buttons for null tileId items', () => {
    const items: NarrativeItem[] = [{ sentence: 'X', tileId: null, areaName: null }]
    expect(buildActionButtons(items, null).filter((b) => b.kind === 'navigate')).toHaveLength(0)
  })
})

describe('wygHasContent', () => {
  it('returns false when both world and needs are null', () => {
    expect(wygHasContent(null, null)).toBe(false)
  })

  it('returns true when world has productive actions', () => {
    expect(wygHasContent(makeWorld({ productiveActions: [makeAction('t_dock', 'X')] }), null)).toBe(true)
  })

  it('returns true when world has pressure moments', () => {
    expect(wygHasContent(makeWorld({ pressureMoments: [{ tick: 1, tileId: 't_dock', kind: 'pressure.food_shortage', narration: 'Y' }] }), null)).toBe(true)
  })

  it('returns true when needs nourishment < 60', () => {
    expect(wygHasContent(null, makeNeeds({ nourishment: 50 }))).toBe(true)
  })

  it('returns true when player is collapsed', () => {
    expect(wygHasContent(null, makeNeeds({ nourishment: 80, vigor: 80, collapsed: true }))).toBe(true)
  })

  it('returns false when world is empty and needs are healthy', () => {
    expect(wygHasContent(makeWorld(), makeNeeds({ nourishment: 80, vigor: 80 }))).toBe(false)
  })
})

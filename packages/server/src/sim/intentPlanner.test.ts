import { describe, expect, it } from 'vitest'
import { computeIntentStack, selectHighestIntent } from './intentPlanner.js'
import type { BeliefRow } from '../projections/beliefProjection.js'
import type { NpcProfile } from '../npcs/types.js'
import type { NpcRuntimeState } from './npcEngine.js'

// ─── Tile IDs used (from MAP_ADJACENCY in mapGraph.ts) ───────────────────────
// t_forest adjacents: ['t_desert', 't_mountain', 't_central']
// t_central adjacents: ['t_forest', 't_dimai', 't_dock', 't_ruin']
// t_desert adjacents: ['t_forest', 't_dock']

const CURRENT_TILE = 't_forest'
const ADJACENT_SAFE = 't_central'   // adjacent to t_forest, no dangerous belief in most tests
const ADJACENT_OTHER = 't_mountain' // adjacent to t_forest

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeProfile(overrides: Partial<NpcProfile['personality']> = {}): NpcProfile {
  return {
    id: 'npc_test',
    name: { zh: '測試', en: 'Test' },
    role: { zh: '測試員', en: 'Tester' },
    defaultLocation: 't_dock',
    routine: [],
    triggers: [],
    memory: { consultsEventTypes: [], decayFn: 'none', decayParam: 0 },
    personality: { safetyWeight: 1.0, economyWeight: 0.7, factionLoyalty: 0.5, ...overrides },
  }
}

function makeBelief(
  overrides: Partial<BeliefRow> & Pick<BeliefRow, 'subject' | 'qualifier' | 'value' | 'confidence'>,
): BeliefRow {
  return {
    npcId: 'npc_test',
    observedAtTick: 0,
    decayRatePerDay: 1,
    ...overrides,
  }
}

type Override = NpcRuntimeState['intentOverride']

// ─── computeIntentStack ───────────────────────────────────────────────────────

describe('computeIntentStack', () => {
  it('returns empty stack when no matching beliefs', () => {
    const stack = computeIntentStack(
      'npc_test', [], makeProfile(), {}, CURRENT_TILE, 'ally_faction', 0,
    )
    expect(stack.entries).toHaveLength(0)
    expect(stack.npcId).toBe('npc_test')
    expect(stack.computedAtTick).toBe(0)
  })

  it('survival intent fires when tile_safety=dangerous on current tile', () => {
    const beliefs: BeliefRow[] = [
      makeBelief({ subject: 'tile_safety', qualifier: CURRENT_TILE, value: 'dangerous', confidence: 80 }),
    ]
    const stack = computeIntentStack('npc_test', beliefs, makeProfile(), {}, CURRENT_TILE, 'ally_faction', 1)
    expect(stack.entries.length).toBeGreaterThan(0)
    expect(stack.entries[0]!.kind).toBe('survival')
  })

  it('survival urgency = min(100, confidence × safetyWeight × multiplier)', () => {
    const beliefs: BeliefRow[] = [
      makeBelief({ subject: 'tile_safety', qualifier: CURRENT_TILE, value: 'dangerous', confidence: 80 }),
    ]
    const profile = makeProfile({ safetyWeight: 1.0 })
    const stack = computeIntentStack('npc_test', beliefs, profile, {}, CURRENT_TILE, undefined, 0)
    const entry = stack.entries.find(e => e.kind === 'survival')!
    // confidence=80 × safetyWeight=1.0 × multiplier=1.0 = 80
    expect(entry.urgency).toBeCloseTo(80)
  })

  it('survival targetTile is an adjacent non-dangerous tile', () => {
    // t_forest adjacents: t_desert, t_mountain, t_central
    // Make t_desert dangerous; t_mountain is safe (no belief); t_central is safe
    const beliefs: BeliefRow[] = [
      makeBelief({ subject: 'tile_safety', qualifier: CURRENT_TILE, value: 'dangerous', confidence: 80 }),
      makeBelief({ subject: 'tile_safety', qualifier: 't_desert', value: 'dangerous', confidence: 70 }),
    ]
    const stack = computeIntentStack('npc_test', beliefs, makeProfile(), {}, CURRENT_TILE, undefined, 0)
    const entry = stack.entries.find(e => e.kind === 'survival')!
    // t_desert is dangerous, so should pick t_mountain (first non-dangerous adjacent)
    // MAP_ADJACENCY.t_forest = ['t_desert', 't_mountain', 't_central']
    // t_desert is dangerous → skip; t_mountain has no belief → safe → pick t_mountain
    expect(entry.targetTile).toBe('t_mountain')
  })

  it('survival falls back to defaultLocation when all adjacents are dangerous', () => {
    // Make all adjacents of t_forest dangerous
    const beliefs: BeliefRow[] = [
      makeBelief({ subject: 'tile_safety', qualifier: CURRENT_TILE, value: 'dangerous', confidence: 80 }),
      makeBelief({ subject: 'tile_safety', qualifier: 't_desert', value: 'dangerous', confidence: 90 }),
      makeBelief({ subject: 'tile_safety', qualifier: 't_mountain', value: 'dangerous', confidence: 85 }),
      makeBelief({ subject: 'tile_safety', qualifier: 't_central', value: 'dangerous', confidence: 75 }),
    ]
    const profile = makeProfile()
    const stack = computeIntentStack('npc_test', beliefs, profile, {}, CURRENT_TILE, undefined, 0)
    const entry = stack.entries.find(e => e.kind === 'survival')!
    // All adjacents dangerous → fall back to lowest-confidence adjacent; but spec says defaultLocation
    // Re-reading spec: "If all are dangerous (or no adjacents), use profile.defaultLocation"
    // So targetTile should be profile.defaultLocation = 't_dock'
    expect(entry.targetTile).toBe(profile.defaultLocation)
  })

  it('economic intent fires when goods_scarcity=scarce belief exists', () => {
    const beliefs: BeliefRow[] = [
      makeBelief({ subject: 'goods_scarcity', qualifier: 'fish', value: 'scarce', confidence: 60 }),
    ]
    const stack = computeIntentStack('npc_test', beliefs, makeProfile(), {}, CURRENT_TILE, undefined, 0)
    const entry = stack.entries.find(e => e.kind === 'economic')
    expect(entry).toBeDefined()
    expect(entry!.kind).toBe('economic')
  })

  it('social intent fires when enemy faction controls current tile', () => {
    const beliefs: BeliefRow[] = [
      makeBelief({
        subject: 'faction_control',
        qualifier: CURRENT_TILE,
        value: 'controlled',
        confidence: 70,
        factionId: 'enemy_faction',
      }),
    ]
    const stack = computeIntentStack(
      'npc_test', beliefs, makeProfile(), {}, CURRENT_TILE, 'ally_faction', 0,
    )
    const entry = stack.entries.find(e => e.kind === 'social')
    expect(entry).toBeDefined()
    expect(entry!.kind).toBe('social')
  })

  it('social intent does NOT fire when NPC has no faction', () => {
    const beliefs: BeliefRow[] = [
      makeBelief({
        subject: 'faction_control',
        qualifier: CURRENT_TILE,
        value: 'controlled',
        confidence: 70,
        factionId: 'enemy_faction',
      }),
    ]
    const stack = computeIntentStack(
      'npc_test', beliefs, makeProfile(), {}, CURRENT_TILE, undefined, 0,
    )
    const entry = stack.entries.find(e => e.kind === 'social')
    expect(entry).toBeUndefined()
  })

  it('social intent does NOT fire for friendly faction control', () => {
    const beliefs: BeliefRow[] = [
      makeBelief({
        subject: 'faction_control',
        qualifier: CURRENT_TILE,
        value: 'controlled',
        confidence: 70,
        factionId: 'ally_faction', // same faction as NPC
      }),
    ]
    const stack = computeIntentStack(
      'npc_test', beliefs, makeProfile(), {}, CURRENT_TILE, 'ally_faction', 0,
    )
    const entry = stack.entries.find(e => e.kind === 'social')
    expect(entry).toBeUndefined()
  })

  it('ecosystem intent fires when ecosystem_health=depleted on current tile', () => {
    const beliefs: BeliefRow[] = [
      makeBelief({ subject: 'ecosystem_health', qualifier: CURRENT_TILE, value: 'depleted', confidence: 70 }),
    ]
    const stack = computeIntentStack('npc_test', beliefs, makeProfile(), {}, CURRENT_TILE, undefined, 0)
    const entry = stack.entries.find(e => e.kind === 'ecosystem')
    expect(entry).toBeDefined()
    expect(entry!.kind).toBe('ecosystem')
  })

  it('stack entries are sorted by urgency descending', () => {
    // survival: conf=90, safetyWeight=1.0 → urgency=90
    // ecosystem: conf=70, × 0.4 → urgency=28
    const beliefs: BeliefRow[] = [
      makeBelief({ subject: 'tile_safety', qualifier: CURRENT_TILE, value: 'dangerous', confidence: 90 }),
      makeBelief({ subject: 'ecosystem_health', qualifier: CURRENT_TILE, value: 'depleted', confidence: 70 }),
    ]
    const stack = computeIntentStack('npc_test', beliefs, makeProfile(), {}, CURRENT_TILE, undefined, 0)
    expect(stack.entries.length).toBeGreaterThanOrEqual(2)
    for (let i = 1; i < stack.entries.length; i++) {
      expect(stack.entries[i - 1]!.urgency).toBeGreaterThanOrEqual(stack.entries[i]!.urgency)
    }
  })

  it('survival falls back to currentTile when defaultLocation absent and all adjacents dangerous', () => {
    const beliefs: BeliefRow[] = [
      makeBelief({ subject: 'tile_safety', qualifier: CURRENT_TILE, value: 'dangerous', confidence: 80 }),
      makeBelief({ subject: 'tile_safety', qualifier: 't_desert', value: 'dangerous', confidence: 90 }),
      makeBelief({ subject: 'tile_safety', qualifier: 't_mountain', value: 'dangerous', confidence: 85 }),
      makeBelief({ subject: 'tile_safety', qualifier: 't_central', value: 'dangerous', confidence: 75 }),
    ]
    const profile = { ...makeProfile(), defaultLocation: '' } as unknown as NpcProfile
    const stack = computeIntentStack('npc_test', beliefs, profile, {}, CURRENT_TILE, undefined, 0)
    const entry = stack.entries.find(e => e.kind === 'survival')!
    expect(entry.targetTile).toBe(CURRENT_TILE)
  })

  it('learningWeights multiplier scales urgency', () => {
    const beliefs: BeliefRow[] = [
      makeBelief({ subject: 'tile_safety', qualifier: CURRENT_TILE, value: 'dangerous', confidence: 80 }),
    ]
    const profile = makeProfile({ safetyWeight: 1.0 })

    // Baseline: multiplier=1.0 → urgency = 80
    const baseStack = computeIntentStack('npc_test', beliefs, profile, {}, CURRENT_TILE, undefined, 0)
    const baseUrgency = baseStack.entries.find(e => e.kind === 'survival')!.urgency

    // With learningWeights.survival = 1.5 → urgency = min(100, 80 × 1.0 × 1.5) = 100? No: 80×1.5=120, clamped to 100
    // Use confidence=50 to stay under 100: 50 × 1.0 × 1.5 = 75
    const beliefs2: BeliefRow[] = [
      makeBelief({ subject: 'tile_safety', qualifier: CURRENT_TILE, value: 'dangerous', confidence: 50 }),
    ]
    const scaledStack = computeIntentStack(
      'npc_test', beliefs2, profile, { survival: 1.5 }, CURRENT_TILE, undefined, 0,
    )
    const scaledUrgency = scaledStack.entries.find(e => e.kind === 'survival')!.urgency

    const baseStack2 = computeIntentStack('npc_test', beliefs2, profile, {}, CURRENT_TILE, undefined, 0)
    const baseUrgency2 = baseStack2.entries.find(e => e.kind === 'survival')!.urgency

    // scaledUrgency should be 1.5× baseUrgency2
    expect(scaledUrgency).toBeCloseTo(baseUrgency2 * 1.5)
    void baseUrgency // used in sanity check above
  })
})

// ─── selectHighestIntent ──────────────────────────────────────────────────────

describe('selectHighestIntent', () => {
  const noOverride: Override = null

  function makeStack(urgency: number): ReturnType<typeof computeIntentStack> {
    return {
      npcId: 'npc_test',
      computedAtTick: 0,
      entries: urgency > 0
        ? [{ kind: 'survival', urgency, targetTile: ADJACENT_SAFE, reason: 'test' }]
        : [],
    }
  }

  it('returns null for empty stack', () => {
    const stack = makeStack(0)
    expect(selectHighestIntent(stack, 30, noOverride)).toBeNull()
  })

  it('returns null if top urgency <= threshold (strictly >)', () => {
    // urgency = 30, threshold = 30 → null
    const stack = makeStack(30)
    expect(selectHighestIntent(stack, 30, noOverride)).toBeNull()
  })

  it('returns top entry if urgency > threshold and no current override', () => {
    const stack = makeStack(50)
    const result = selectHighestIntent(stack, 30, noOverride)
    expect(result).not.toBeNull()
    expect(result!.kind).toBe('survival')
    expect(result!.urgency).toBe(50)
  })

  it('returns null if new urgency is not 1.5× above currentOverride urgency', () => {
    // currentOverride.urgency = 60, new urgency = 80 → 80 < 60 × 1.5 = 90 → null
    const override: Override = {
      targetTile: 't_dock',
      expiresAtTick: 1000,
      intentType: 'survival',
      urgency: 60,
      reason: 'existing',
    }
    const stack = makeStack(80)
    expect(selectHighestIntent(stack, 30, override)).toBeNull()
  })

  it('returns entry if new urgency is strictly > 1.5× currentOverride urgency', () => {
    // currentOverride.urgency = 50, new urgency = 76 → 76 > 50 × 1.5 = 75 → returns entry
    const override: Override = {
      targetTile: 't_dock',
      expiresAtTick: 1000,
      intentType: 'survival',
      urgency: 50,
      reason: 'existing',
    }
    const stack = makeStack(76)
    const result = selectHighestIntent(stack, 30, override)
    expect(result).not.toBeNull()
    expect(result!.urgency).toBe(76)
  })

  it('returns null if currentOverride is null and urgency is exactly threshold', () => {
    // urgency = 30, threshold = 30 → null (strict >)
    const stack = makeStack(30)
    expect(selectHighestIntent(stack, 30, null)).toBeNull()
  })
})

// ─── memoryUrgencyBoost ───────────────────────────────────────────────────────

describe('computeIntentStack with memoryUrgencyBoost', () => {
  it('memoryUrgencyBoost amplifies survival urgency', () => {
    const beliefs: BeliefRow[] = [
      makeBelief({ subject: 'tile_safety', qualifier: CURRENT_TILE, value: 'dangerous', confidence: 50 }),
    ]
    const profile = makeProfile({ safetyWeight: 1.0 })
    const base = computeIntentStack('npc_test', beliefs, profile, {}, CURRENT_TILE, undefined, 0, 0)
    const boosted = computeIntentStack('npc_test', beliefs, profile, {}, CURRENT_TILE, undefined, 0, 1.0)
    const baseUrgency = base.entries.find(e => e.kind === 'survival')!.urgency
    const boostedUrgency = boosted.entries.find(e => e.kind === 'survival')!.urgency
    // boost=1.0 should raise urgency: confidence(50) * safetyWeight(1.0) * (1.0 + 1.0) = 100
    expect(boostedUrgency).toBeGreaterThan(baseUrgency)
    expect(boostedUrgency).toBeCloseTo(50 * 1.0 * 2.0)
  })

  it('memoryUrgencyBoost does not affect economic, social, or ecosystem intents', () => {
    const beliefs: BeliefRow[] = [
      makeBelief({ subject: 'goods_scarcity', qualifier: 'fish', value: 'scarce', confidence: 60 }),
      makeBelief({ subject: 'faction_control', qualifier: CURRENT_TILE, value: 'controlled', confidence: 70, factionId: 'enemy' }),
      makeBelief({ subject: 'ecosystem_health', qualifier: CURRENT_TILE, value: 'depleted', confidence: 50 }),
    ]
    const profile = makeProfile({ safetyWeight: 1.0, economyWeight: 0.7, factionLoyalty: 0.5 })
    const base = computeIntentStack('npc_test', beliefs, profile, {}, CURRENT_TILE, 'ally', 0, 0)
    const boosted = computeIntentStack('npc_test', beliefs, profile, {}, CURRENT_TILE, 'ally', 0, 1.0)
    for (const kind of ['economic', 'social', 'ecosystem'] as const) {
      const baseEntry = base.entries.find(e => e.kind === kind)
      const boostedEntry = boosted.entries.find(e => e.kind === kind)
      if (baseEntry && boostedEntry) {
        expect(boostedEntry.urgency).toBeCloseTo(baseEntry.urgency)
      }
    }
  })
})

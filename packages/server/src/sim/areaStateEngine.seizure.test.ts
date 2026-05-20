import { describe, expect, it } from 'vitest'
import { AreaStateEngine } from './areaStateEngine.js'

const EMPTY_FACTS = {
  weather: '晴',
  npcStates: new Map(),
  npcFactionLean: new Map(),
}

describe('AreaStateEngine — seizure intents', () => {
  it('emits seizure intent when dominant faction first appears', () => {
    const engine = new AreaStateEngine(['tile_forest'])
    // Pre-seed: guild=85, all rivals low — dominantFaction stored as null
    engine.hydrate('tile_forest', {
      factionControl: { tide_hunters: 5, free_runners: 5, guild: 85, civilian: 10 },
      dominantFaction: null,
      resources: { food: 70, safety: 70, economy: 70 },
      lastUpdatedTick: 0,
      recentEvents: [],
    })
    const result = engine.tick(1, EMPTY_FACTS)
    expect(result.seizureIntents).toHaveLength(1)
    expect(result.seizureIntents[0]?.factionId).toBe('guild')
    expect(result.seizureIntents[0]?.previousFactionId).toBeNull()
    expect(result.seizureIntents[0]?.tileId).toBe('tile_forest')
  })

  it('emits seizure intent when dominant faction changes', () => {
    const engine = new AreaStateEngine(['tile_forest'])
    engine.hydrate('tile_forest', {
      factionControl: { tide_hunters: 88, free_runners: 5, guild: 10, civilian: 5 },
      dominantFaction: 'guild',
      resources: { food: 70, safety: 70, economy: 70 },
      lastUpdatedTick: 0,
      recentEvents: [],
    })
    const result = engine.tick(1, EMPTY_FACTS)
    expect(result.seizureIntents).toHaveLength(1)
    expect(result.seizureIntents[0]?.factionId).toBe('tide_hunters')
    expect(result.seizureIntents[0]?.previousFactionId).toBe('guild')
  })

  it('does NOT emit seizure intent when dominant faction unchanged', () => {
    const engine = new AreaStateEngine(['tile_forest'])
    engine.hydrate('tile_forest', {
      factionControl: { tide_hunters: 5, free_runners: 5, guild: 90, civilian: 5 },
      dominantFaction: 'guild',
      resources: { food: 70, safety: 70, economy: 70 },
      lastUpdatedTick: 0,
      recentEvents: [],
    })
    const result = engine.tick(1, EMPTY_FACTS)
    expect(result.seizureIntents).toHaveLength(0)
  })

  it('does NOT emit seizure intent when hysteresis buffer not met (rival within 5 pts)', () => {
    const engine = new AreaStateEngine(['tile_forest'])
    // guild will become dominant (82 > 80), but tide_hunters is at 79 — difference after decay: ~82.92 - 78.92 = 4 < 5
    engine.hydrate('tile_forest', {
      factionControl: { tide_hunters: 79, free_runners: 5, guild: 83, civilian: 5 },
      dominantFaction: null,
      resources: { food: 70, safety: 70, economy: 70 },
      lastUpdatedTick: 0,
      recentEvents: [],
    })
    const result = engine.tick(1, EMPTY_FACTS)
    // guild = 83 - 0.08 = 82.92, tide_hunters = 79 - 0.08 = 78.92, diff = 4 < 5 → no seizure
    expect(result.seizureIntents).toHaveLength(0)
  })

  it('emits seizure intent when hysteresis buffer is met (rival sufficiently behind)', () => {
    const engine = new AreaStateEngine(['tile_forest'])
    // guild = 90, best rival = 82 — difference after decay: 89.92 - 81.92 = 8 >= 5
    engine.hydrate('tile_forest', {
      factionControl: { tide_hunters: 82, free_runners: 5, guild: 90, civilian: 5 },
      dominantFaction: null,
      resources: { food: 70, safety: 70, economy: 70 },
      lastUpdatedTick: 0,
      recentEvents: [],
    })
    const result = engine.tick(1, EMPTY_FACTS)
    expect(result.seizureIntents).toHaveLength(1)
    expect(result.seizureIntents[0]?.factionId).toBe('guild')
  })
})

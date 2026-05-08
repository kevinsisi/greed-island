import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { loadCardCatalog } from '../cards/loader.js'
import type { SimulationRuntime } from '../sim/runtime.js'
import { CardActionPipeline } from './cardCommands.js'
import { CardDropEngine } from './cardDropEngine.js'
import { CardWorldStore } from './cardWorldStore.js'

const MANY_TILE_IDS = Array.from({ length: 128 }, (_, i) => `t_replay_${i}`)
const SEED_TILE_IDS = Array.from({ length: 32 }, (_, i) => `t_seed_${i}`)

describe('card drop engine deterministic replay', () => {
  it('replays equivalent normal tick spawn facts from identical inputs', () => {
    const first = createHarness(MANY_TILE_IDS, { weather: '霧雨', rareOpen: true })
    const second = createHarness(MANY_TILE_IDS, { weather: '霧雨', rareOpen: true })

    try {
      for (let tick = 1; tick <= 50; tick += 1) {
        first.engine.onTick(tick)
        second.engine.onTick(tick)
      }

      const firstSpawns = spawnFacts(first.pipeline)
      const secondSpawns = spawnFacts(second.pipeline)

      expect(firstSpawns.length).toBeGreaterThan(0)
      expect(firstSpawns).toStrictEqual(secondSpawns)
    } finally {
      first.db.close()
      second.db.close()
    }
  })

  it('replays equivalent boot seed spawn facts from identical inputs', () => {
    const first = createHarness(SEED_TILE_IDS, { weather: '晴', rareOpen: false })
    const second = createHarness(SEED_TILE_IDS, { weather: '晴', rareOpen: false })

    try {
      first.engine.seedInitialDrops(0)
      second.engine.seedInitialDrops(0)

      const firstSpawns = spawnFacts(first.pipeline)
      const secondSpawns = spawnFacts(second.pipeline)

      expect(firstSpawns.length).toBeGreaterThan(0)
      expect(firstSpawns).toStrictEqual(secondSpawns)
    } finally {
      first.db.close()
      second.db.close()
    }
  })
})

function createHarness(
  tileIds: readonly string[],
  worldFacts: Readonly<{ weather: string; rareOpen: boolean }>
) {
  const db = new Database(':memory:')
  const catalog = loadCardCatalog()
  const store = new CardWorldStore(db, catalog)
  const pipeline = new CardActionPipeline(db, store)
  const runtime = {
    getCurrentWeather: () => worldFacts.weather,
    isRareWindowOpen: () => worldFacts.rareOpen,
  } as unknown as SimulationRuntime
  const engine = new CardDropEngine(store, pipeline, catalog, tileIds, runtime)
  return { db, engine, pipeline }
}

function spawnFacts(pipeline: CardActionPipeline) {
  return pipeline
    .recentEvents(500)
    .filter((event) => event.eventType === 'CARD_DROP_SPAWN')
    .map((event) => ({
      eventType: event.eventType,
      actorId: event.actorId,
      tick: event.tick,
      payload: withoutAutoincrementId(event.payload),
    }))
}

function withoutAutoincrementId(payload: Record<string, unknown>) {
  const { dropId: _dropId, ...rest } = payload
  return rest
}

import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadCardCatalog } from '../cards/loader.js'
import { SqliteEventStore } from '../kernel/eventStore.js'
import { loadNpcProfiles } from '../npcs/loader.js'
import {
  MAX_COMMANDS_PER_TICK_SOFT_CAP,
  MAX_COMMANDS_PER_TICK_HARD_CAP,
  NPC_PARTITION_PERIOD,
} from '../config/world.js'
import { SimulationRuntime } from './runtime.js'

type Internal = { runTick: () => void }

describe('SimulationRuntime budget observability (Phase 1 slice 1)', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    warnSpy.mockRestore()
  })

  it('exposes tickCommandStats on the snapshot after a tick', () => {
    const db = new Database(':memory:')
    const eventStore = new SqliteEventStore(db)
    const runtime = new SimulationRuntime(eventStore, loadNpcProfiles(), loadCardCatalog())
    try {
      ;(runtime as unknown as Internal).runTick()
      const snapshot = runtime.getSnapshot()
      expect(snapshot.tickCommandStats).toBeDefined()
      expect(snapshot.tickCommandStats.softCap).toBe(MAX_COMMANDS_PER_TICK_SOFT_CAP)
      expect(snapshot.tickCommandStats.hardCap).toBe(MAX_COMMANDS_PER_TICK_HARD_CAP)
      expect(snapshot.tickCommandStats.lastTick).toBeGreaterThan(0)
      expect(snapshot.tickCommandStats.peak).toBeGreaterThanOrEqual(snapshot.tickCommandStats.lastTick)
      expect(snapshot.tickCommandStats.softCapHitCount).toBe(0)
      expect(snapshot.tickCommandStats.hardCapRejectedSinceBoot).toBe(0)
    } finally {
      runtime.stop()
      db.close()
    }
  })

  it('exposes npcPartition stats on the snapshot after a tick', () => {
    const db = new Database(':memory:')
    const eventStore = new SqliteEventStore(db)
    const runtime = new SimulationRuntime(eventStore, loadNpcProfiles(), loadCardCatalog())
    try {
      ;(runtime as unknown as Internal).runTick()
      const snapshot = runtime.getSnapshot()
      expect(snapshot.npcPartition).toBeDefined()
      expect(snapshot.npcPartition.period).toBe(NPC_PARTITION_PERIOD)
      expect(snapshot.npcPartition.totalCount).toBe(50)
      expect(snapshot.npcPartition.activeCount).toBeGreaterThan(0)
      expect(snapshot.npcPartition.activeCount).toBeLessThan(snapshot.npcPartition.totalCount)
    } finally {
      runtime.stop()
      db.close()
    }
  })

  it('npc partition activeCount sums to total across one full period', () => {
    const db = new Database(':memory:')
    const eventStore = new SqliteEventStore(db)
    const runtime = new SimulationRuntime(eventStore, loadNpcProfiles(), loadCardCatalog())
    try {
      const run = (runtime as unknown as Internal).runTick
      let total = 0
      for (let i = 0; i < NPC_PARTITION_PERIOD; i += 1) {
        run.call(runtime)
        total += runtime.getSnapshot().npcPartition.activeCount
      }
      expect(total).toBe(runtime.getSnapshot().npcPartition.totalCount)
    } finally {
      runtime.stop()
      db.close()
    }
  })

  it('under real load: no hard-cap rejections and rejected_command_log stays clean of COMMAND_CAP_EXCEEDED', () => {
    const db = new Database(':memory:')
    const eventStore = new SqliteEventStore(db)
    const runtime = new SimulationRuntime(eventStore, loadNpcProfiles(), loadCardCatalog())
    try {
      const run = (runtime as unknown as Internal).runTick
      run.call(runtime)
      run.call(runtime)
      run.call(runtime)
      const stats = runtime.getSnapshot().tickCommandStats
      expect(stats.hardCapRejectedSinceBoot).toBe(0)
      const audit = eventStore.readRejectedCommandAudit()
      expect(audit.filter((row) => row.rejectionCode === 'COMMAND_CAP_EXCEEDED')).toEqual([])
    } finally {
      runtime.stop()
      db.close()
    }
  })

  it('peak is monotonically non-decreasing across ticks', () => {
    const db = new Database(':memory:')
    const eventStore = new SqliteEventStore(db)
    const runtime = new SimulationRuntime(eventStore, loadNpcProfiles(), loadCardCatalog())
    try {
      const run = (runtime as unknown as Internal).runTick
      run.call(runtime)
      const peakAfterFirst = runtime.getSnapshot().tickCommandStats.peak
      run.call(runtime)
      run.call(runtime)
      const peakAfterThird = runtime.getSnapshot().tickCommandStats.peak
      expect(peakAfterThird).toBeGreaterThanOrEqual(peakAfterFirst)
    } finally {
      runtime.stop()
      db.close()
    }
  })

  it('does not warn when command count stays under the soft cap (real load)', () => {
    const db = new Database(':memory:')
    const eventStore = new SqliteEventStore(db)
    const runtime = new SimulationRuntime(eventStore, loadNpcProfiles(), loadCardCatalog())
    try {
      // Real runtime load with 50 NPCs sits well below the 5000 soft cap.
      ;(runtime as unknown as Internal).runTick()
      const softCapWarnings = warnSpy.mock.calls.filter((call) =>
        String(call[0] ?? '').includes('soft cap')
      )
      expect(softCapWarnings).toHaveLength(0)
      expect(runtime.getSnapshot().tickCommandStats.softCapHitCount).toBe(0)
    } finally {
      runtime.stop()
      db.close()
    }
  })

  it('soft cap stats survive multiple ticks deterministically', () => {
    const db = new Database(':memory:')
    const eventStore = new SqliteEventStore(db)
    const runtime = new SimulationRuntime(eventStore, loadNpcProfiles(), loadCardCatalog())
    try {
      const run = (runtime as unknown as Internal).runTick
      run.call(runtime)
      run.call(runtime)
      run.call(runtime)
      const stats = runtime.getSnapshot().tickCommandStats
      // Soft cap not hit under normal load.
      expect(stats.softCapHitCount).toBe(0)
      // lastTick reflects the latest tick's count; peak is the max so far.
      expect(stats.peak).toBeGreaterThanOrEqual(stats.lastTick)
    } finally {
      runtime.stop()
      db.close()
    }
  })
})

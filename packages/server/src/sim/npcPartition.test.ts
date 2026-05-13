import { describe, expect, it } from 'vitest'
import { npcBucketIndex, partitionNpcsForTick } from './npcPartition.js'

const sampleIds = [
  'central.broker.gui',
  'central.exchange.shen_ruo_yun',
  'desert.keeper.bai_wei',
  'dock.surfer.jiang_bo_ran',
  'forest.guildmaster.lian_bo_wen',
  'forest.hunter.lyra',
  'mountain.abbot.li_shu',
  'port.concierge.an_qing_an',
  'port.merchant.anton',
  'temple.cleric.sela',
] as const

describe('npcBucketIndex', () => {
  it('returns a non-negative integer below period', () => {
    for (const id of sampleIds) {
      const idx = npcBucketIndex(id, 4)
      expect(idx).toBeGreaterThanOrEqual(0)
      expect(idx).toBeLessThan(4)
    }
  })

  it('is deterministic across calls', () => {
    const a = sampleIds.map((id) => npcBucketIndex(id, 7))
    const b = sampleIds.map((id) => npcBucketIndex(id, 7))
    expect(a).toEqual(b)
  })
})

describe('partitionNpcsForTick', () => {
  it('every NPC is active exactly once per period over a full cycle', () => {
    const ids = [...sampleIds]
    const period = 4
    const activations = new Map<string, number>()
    for (const id of ids) activations.set(id, 0)
    for (let tick = 0; tick < period; tick += 1) {
      const partition = partitionNpcsForTick(ids, tick, period)
      for (const id of partition.active) {
        activations.set(id, (activations.get(id) ?? 0) + 1)
      }
    }
    for (const [id, count] of activations) {
      expect(count, `${id} activations across one full period`).toBe(1)
    }
  })

  it('sums to total count over a full period', () => {
    const ids = [...sampleIds]
    const period = 4
    let total = 0
    for (let tick = 0; tick < period; tick += 1) {
      const partition = partitionNpcsForTick(ids, tick, period)
      total += partition.activeCount
    }
    expect(total).toBe(ids.length)
  })

  it('partition is identical across two independent calls (replay safety)', () => {
    const ids = [...sampleIds]
    const a = partitionNpcsForTick(ids, 17, 4)
    const b = partitionNpcsForTick(ids, 17, 4)
    expect([...a.active].sort()).toEqual([...b.active].sort())
    expect(a.activeCount).toBe(b.activeCount)
  })

  it('partition is independent of npc id input order', () => {
    const ids = [...sampleIds]
    const reversed = [...ids].reverse()
    const a = partitionNpcsForTick(ids, 42, 4)
    const b = partitionNpcsForTick(reversed, 42, 4)
    expect([...a.active].sort()).toEqual([...b.active].sort())
  })

  it('exposes period and totalCount on the result', () => {
    const ids = [...sampleIds]
    const partition = partitionNpcsForTick(ids, 0, 4)
    expect(partition.period).toBe(4)
    expect(partition.totalCount).toBe(ids.length)
    expect(partition.activeCount).toBe(partition.active.size)
  })

  it('throws on invalid period', () => {
    expect(() => partitionNpcsForTick(['a'], 0, 0)).toThrow()
    expect(() => partitionNpcsForTick(['a'], 0, -1)).toThrow()
    expect(() => partitionNpcsForTick(['a'], 0, 1.5)).toThrow()
  })

  it('throws on invalid tick', () => {
    expect(() => partitionNpcsForTick(['a'], -1, 4)).toThrow()
    expect(() => partitionNpcsForTick(['a'], 1.5, 4)).toThrow()
  })

  it('handles empty input', () => {
    const partition = partitionNpcsForTick([], 0, 4)
    expect(partition.activeCount).toBe(0)
    expect(partition.totalCount).toBe(0)
  })
})

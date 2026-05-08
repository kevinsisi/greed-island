import { describe, it, expect } from 'vitest'
import {
  DEFAULT_WORLD_CONFIG,
  EVENT_RETENTION_DAYS,
  EVENT_RETENTION_TICKS,
  TICKS_PER_DAY,
  TICKS_PER_HOUR,
  TICKS_PER_MINUTE,
  TICK_DURATION_MS,
  isWithinRetention,
  retentionCutoffTick,
} from './world.js'

describe('world config', () => {
  it('uses 5s ticks by default', () => {
    expect(TICK_DURATION_MS).toBe(5000)
  })

  it('derives 12 ticks per minute', () => {
    expect(TICKS_PER_MINUTE).toBe(12)
  })

  it('derives 720 ticks per hour', () => {
    expect(TICKS_PER_HOUR).toBe(720)
  })

  it('derives 17280 ticks per in-world day', () => {
    expect(TICKS_PER_DAY).toBe(17_280)
  })

  it('retains events for 30 in-world days', () => {
    expect(EVENT_RETENTION_DAYS).toBe(30)
    expect(EVENT_RETENTION_TICKS).toBe(518_400)
  })

  it('isWithinRetention is true at the boundary and false past it', () => {
    const current = 1_000_000
    expect(isWithinRetention(current - EVENT_RETENTION_TICKS, current)).toBe(true)
    expect(isWithinRetention(current - EVENT_RETENTION_TICKS - 1, current)).toBe(false)
  })

  it('retentionCutoffTick clamps at zero for young worlds', () => {
    expect(retentionCutoffTick(100)).toBe(0)
    expect(retentionCutoffTick(EVENT_RETENTION_TICKS + 50)).toBe(50)
  })

  it('exposes a default WorldConfig snapshot of the constants', () => {
    expect(DEFAULT_WORLD_CONFIG).toStrictEqual({
      tickDurationMs: 5000,
      ticksPerDay: 17_280,
      timezone: 'GMT+8',
      timezoneOffsetMinutes: 480,
      eventRetentionTicks: 518_400,
      narrationRetentionTicks: 518_400,
    })
  })
})

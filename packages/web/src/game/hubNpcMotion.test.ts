import { describe, expect, it } from 'vitest'
import { deterministicHubNpcMotionSeed, hubNpcMotionMode } from './hubNpcMotion'

describe('hubNpcMotionMode', () => {
  it('keeps routed or moving NPCs visually walking while the authoritative route is present', () => {
    expect(hubNpcMotionMode({ activity: 'move' })).toBe('route-loop')
    expect(hubNpcMotionMode({
      activity: 'idle',
      travelRoute: { fromDistrictId: 't_central', toDistrictId: 't_forest', targetDistrictId: 't_forest' }
    })).toBe('route-loop')
  })

  it('gives visible outdoor NPCs a bounded local stroll instead of a frozen statue pose', () => {
    expect(hubNpcMotionMode({ activity: 'idle' })).toBe('local-stroll')
    expect(hubNpcMotionMode({ activity: 'work' })).toBe('local-stroll')
    expect(hubNpcMotionMode({})).toBe('local-stroll')
  })

  it('does not animate sleeping NPCs as walking', () => {
    expect(hubNpcMotionMode({ activity: 'sleep' })).toBe('still')
  })

  it('uses stable per-npc seeds for deterministic visual offsets', () => {
    expect(deterministicHubNpcMotionSeed('npc-a')).toBe(deterministicHubNpcMotionSeed('npc-a'))
    expect(deterministicHubNpcMotionSeed('npc-a')).not.toBe(deterministicHubNpcMotionSeed('npc-b'))
  })
})

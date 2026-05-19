import { describe, expect, it } from 'vitest'
import { planFactionEcology } from './factionEcologyPlanner.js'
import {
  FREE_RUNNERS_LIVESTOCK_THRESHOLD,
  GUILD_CLEARCUT_PRESSURE_THRESHOLD,
  TIDE_HUNTERS_QUOTA_DENSITY_THRESHOLD,
} from '../config/world.js'

describe('factionEcologyPlanner', () => {
  it('guild emits FOREST_CLEARCUT_ORDERED when forest pressure is high', () => {
    const result = planFactionEcology({
      tick: 100,
      factions: [{ id: 'guild', ecologyStance: 'clearcut' }],
      getPressureLevel: (tileId) => tileId === 't_forest' ? GUILD_CLEARCUT_PRESSURE_THRESHOLD : 0,
      getFisheryDensity: () => 50,
      getLivestockCount: () => 0,
      tileIds: ['t_forest', 't_marsh'],
    })
    expect(result).toHaveLength(1)
    expect(result[0]?.type).toBe('FOREST_CLEARCUT_ORDERED')
    expect(result[0]?.factionId).toBe('guild')
  })

  it('guild emits nothing when no tile meets pressure threshold', () => {
    const result = planFactionEcology({
      tick: 100,
      factions: [{ id: 'guild', ecologyStance: 'clearcut' }],
      getPressureLevel: () => GUILD_CLEARCUT_PRESSURE_THRESHOLD - 1,
      getFisheryDensity: () => 50,
      getLivestockCount: () => 0,
      tileIds: ['t_forest'],
    })
    expect(result).toHaveLength(0)
  })

  it('tide_hunters emits FISHING_QUOTA_ENFORCED when fishery density is low', () => {
    const result = planFactionEcology({
      tick: 200,
      factions: [{ id: 'tide_hunters', ecologyStance: 'quota' }],
      getPressureLevel: () => 0,
      getFisheryDensity: (tileId) => tileId === 't_marsh' ? TIDE_HUNTERS_QUOTA_DENSITY_THRESHOLD : 100,
      getLivestockCount: () => 0,
      tileIds: ['t_marsh'],
    })
    expect(result).toHaveLength(1)
    expect(result[0]?.type).toBe('FISHING_QUOTA_ENFORCED')
    expect(result[0]?.factionId).toBe('tide_hunters')
  })

  it('free_runners emits INDUSTRIAL_SITE_SABOTAGED when livestock count is high', () => {
    const result = planFactionEcology({
      tick: 300,
      factions: [{ id: 'free_runners', ecologyStance: 'sabotage' }],
      getPressureLevel: () => 0,
      getFisheryDensity: () => 100,
      getLivestockCount: (tileId) => tileId === 't_central' ? FREE_RUNNERS_LIVESTOCK_THRESHOLD : 0,
      tileIds: ['t_central'],
    })
    expect(result).toHaveLength(1)
    expect(result[0]?.type).toBe('INDUSTRIAL_SITE_SABOTAGED')
    expect(result[0]?.factionId).toBe('free_runners')
  })

  it('hidden_overseer emits RITUAL_ECOSYSTEM_MANIPULATION unconditionally', () => {
    const result = planFactionEcology({
      tick: 400,
      factions: [{ id: 'hidden_overseer', ecologyStance: 'ritual' }],
      getPressureLevel: () => 0,
      getFisheryDensity: () => 0,
      getLivestockCount: () => 0,
      tileIds: [],
    })
    expect(result).toHaveLength(1)
    expect(result[0]?.type).toBe('RITUAL_ECOSYSTEM_MANIPULATION')
    expect(result[0]?.factionId).toBe('hidden_overseer')
  })

  it('all four factions emit their commands when conditions met', () => {
    const result = planFactionEcology({
      tick: 500,
      factions: [
        { id: 'guild', ecologyStance: 'clearcut' },
        { id: 'tide_hunters', ecologyStance: 'quota' },
        { id: 'free_runners', ecologyStance: 'sabotage' },
        { id: 'hidden_overseer', ecologyStance: 'ritual' },
      ],
      getPressureLevel: () => GUILD_CLEARCUT_PRESSURE_THRESHOLD,
      getFisheryDensity: () => TIDE_HUNTERS_QUOTA_DENSITY_THRESHOLD,
      getLivestockCount: () => FREE_RUNNERS_LIVESTOCK_THRESHOLD,
      tileIds: ['t_forest'],
    })
    expect(result).toHaveLength(4)
  })
})

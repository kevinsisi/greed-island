import { describe, expect, it } from 'vitest'
import {
  ECOSYSTEM_REGION_IDS,
  getSpecies,
  listSpecies,
  listSpeciesByCategory,
  listSpeciesByRegion,
  requireSpecies,
} from './species.js'

describe('ecosystem species catalog (Phase E0.1)', () => {
  it('contains the documented 23 initial species in canonical order', () => {
    const all = listSpecies()
    expect(all).toHaveLength(23)
    expect(all[0]?.id).toBe('marsh_fish')
    expect(all[all.length - 1]?.id).toBe('lantern_moth')
  })

  it('uses unique deterministic ids', () => {
    const ids = listSpecies().map((entry) => entry.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(listSpecies().map((entry) => entry.id)).toEqual(ids)
  })

  it('matches the expected per-region counts from WORLD_CAPABILITIES', () => {
    expect(ECOSYSTEM_REGION_IDS).toEqual(['salt_marsh', 'forest', 'mountain', 'desert', 'ruin'])
    expect(listSpeciesByRegion('salt_marsh')).toHaveLength(6)
    expect(listSpeciesByRegion('forest')).toHaveLength(5)
    expect(listSpeciesByRegion('mountain')).toHaveLength(4)
    expect(listSpeciesByRegion('desert')).toHaveLength(4)
    expect(listSpeciesByRegion('ruin')).toHaveLength(4)
  })

  it('looks up a species by id', () => {
    const marshHeron = getSpecies('marsh_heron')
    expect(marshHeron?.category).toBe('avian')
    expect(marshHeron?.migrationPattern).toBe('seasonal')
    expect(marshHeron?.biomeAffinity).toContain('salt_marsh')
    expect(getSpecies('missing_species')).toBeNull()
  })

  it('requireSpecies throws for unknown ids', () => {
    expect(() => requireSpecies('missing_species')).toThrow('Unknown ecosystem species: missing_species')
  })

  it('filters by category', () => {
    const predators = listSpeciesByCategory('predator').map((entry) => entry.id)
    expect(predators).toEqual([
      'reed_eel',
      'fog_wolf',
      'mountain_bear',
      'ash_serpent',
      'iron_hound',
    ])
  })

  it('exposes legendary and mythical species explicitly', () => {
    const leviathan = requireSpecies('white_marsh_leviathan')
    expect(leviathan.category).toBe('mythical')
    expect(leviathan.rarity).toBe('legendary')
    expect(leviathan.carryingCapacity).toBe(1)

    const hound = requireSpecies('iron_hound')
    expect(hound.category).toBe('predator')
    expect(hound.rarity).toBe('legendary')
    expect(hound.carryingCapacity).toBe(1)
  })
})

// BioNode plant species catalog (Phase E5 — plant ecology substrate).
// Plants are not animals: they don't move, hunt, or reproduce — they grow.
// Each plant species has a per-biome carrying capacity and regrowth rate;
// the BioNode projection tracks current density per (tileId, speciesId).
// Harvest events reduce density; the regrowth engine brings depleted nodes
// back toward capacity over time.

import type { EcosystemRegionId } from './species.js'

export type PlantCategory = 'tree' | 'shrub' | 'reed' | 'herb' | 'fungus'

export type PlantSpecies = Readonly<{
  id: string
  nameZh: string
  category: PlantCategory
  biomeAffinity: readonly EcosystemRegionId[]
  carryingCapacity: number       // density 0..100 the biome can sustain
  regrowthPerHour: number         // density units regenerated per TICKS_PER_HOUR
  harvestGoodsId: string          // goods produced when foraged/logged
  harvestUnitsPerDensity: number  // how much goods per 1 unit of density consumed
}>

export const PLANT_SPECIES_CATALOG: readonly PlantSpecies[] = Object.freeze([
  Object.freeze({
    id: 'oak',
    nameZh: '橡樹',
    category: 'tree',
    biomeAffinity: ['forest'],
    carryingCapacity: 100,
    regrowthPerHour: 0.6,
    harvestGoodsId: 'lumber',
    harvestUnitsPerDensity: 0.4,
  } as PlantSpecies),
  Object.freeze({
    id: 'pine',
    nameZh: '松木',
    category: 'tree',
    biomeAffinity: ['forest', 'mountain'],
    carryingCapacity: 80,
    regrowthPerHour: 0.8,
    harvestGoodsId: 'lumber',
    harvestUnitsPerDensity: 0.3,
  } as PlantSpecies),
  Object.freeze({
    id: 'reed',
    nameZh: '蘆葦',
    category: 'reed',
    biomeAffinity: ['salt_marsh'],
    carryingCapacity: 120,
    regrowthPerHour: 2.0,
    harvestGoodsId: 'fiber',
    harvestUnitsPerDensity: 0.5,
  } as PlantSpecies),
  Object.freeze({
    id: 'wild_herb',
    nameZh: '野草藥',
    category: 'herb',
    biomeAffinity: ['forest', 'desert'],
    carryingCapacity: 60,
    regrowthPerHour: 1.4,
    harvestGoodsId: 'wild_herb',
    harvestUnitsPerDensity: 0.6,
  } as PlantSpecies),
  Object.freeze({
    id: 'cave_fungus',
    nameZh: '洞穴菌',
    category: 'fungus',
    biomeAffinity: ['ruin'],
    carryingCapacity: 50,
    regrowthPerHour: 1.0,
    harvestGoodsId: 'fungi',
    harvestUnitsPerDensity: 0.4,
  } as PlantSpecies),
])

export function getPlantSpecies(id: string): PlantSpecies | null {
  return PLANT_SPECIES_CATALOG.find((s) => s.id === id) ?? null
}

/** Returns plant species ids whose biomeAffinity includes the given biome. */
export function plantSpeciesForBiome(biome: string): readonly string[] {
  return PLANT_SPECIES_CATALOG
    .filter((s) => (s.biomeAffinity as readonly string[]).includes(biome))
    .map((s) => s.id)
}

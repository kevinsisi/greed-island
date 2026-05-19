export type EcosystemRegionId = 'salt_marsh' | 'forest' | 'mountain' | 'desert' | 'ruin'

export type SpeciesCategory =
  | 'fish'
  | 'herbivore'
  | 'predator'
  | 'scavenger'
  | 'insect'
  | 'livestock'
  | 'mythical'
  | 'avian'
  | 'fungal'

export type SpeciesDietType =
  | 'herbivore'
  | 'carnivore'
  | 'omnivore'
  | 'scavenger'
  | 'filter'
  | 'fungal'

export type SpeciesPackBehavior =
  | 'solitary'
  | 'pair'
  | 'pack'
  | 'school'
  | 'swarm'
  | 'colony'
  | 'herd'

export type SpeciesActivityWindow = 'day' | 'night' | 'dawn_dusk' | 'any'

export type SpeciesMigrationPattern = 'none' | 'seasonal' | 'pressure' | 'event_driven'

export type SpeciesRarity = 'common' | 'uncommon' | 'rare' | 'legendary'

export type AnimalLifecycleStage = 'juvenile' | 'adult' | 'elder'

export type AnimalState = 'idle' | 'forage' | 'hunt' | 'flee' | 'migrate' | 'rest'

export type Species = Readonly<{
  id: string
  category: SpeciesCategory
  biomeAffinity: readonly EcosystemRegionId[]
  dietType: SpeciesDietType
  aggression: number
  fear: number
  intelligence: number
  packBehavior: SpeciesPackBehavior
  activityWindow: SpeciesActivityWindow
  migrationPattern: SpeciesMigrationPattern
  reproductionRate: number
  carryingCapacity: number
  predatorTargets: readonly string[]
  preyTargets: readonly string[]
  edibleYield: number
  byproducts: readonly string[]
  rarity: SpeciesRarity
  climateTolerance: number
  civilizationTolerance: number
  extinctionThreshold: number
  mountEligible?: boolean
}>

export type Animal = Readonly<{
  id: string
  speciesId: string
  tileId: string
  biomeRegion: EcosystemRegionId
  position: Readonly<{ subCol: number; subRow: number; subZ: number }>
  state: AnimalState
  hunger: number
  health: number
  fear: number
  aggression: number
  packId?: string | null
  migrationTarget?: string | null
  currentTarget?: string | null
  reproductionCooldown: number
  lifecycleStage: AnimalLifecycleStage
  ownerSettlementId?: string | null
  domesticatedBy?: string | null
}>

const REGION_SPECIES = {
  salt_marsh: [
    species({ id: 'marsh_fish', category: 'fish', biomeAffinity: ['salt_marsh'], dietType: 'filter', aggression: 5, fear: 70, intelligence: 10, packBehavior: 'school', activityWindow: 'day', migrationPattern: 'seasonal', reproductionRate: 70, carryingCapacity: 180, predatorTargets: ['reed_eel', 'marsh_heron', 'white_marsh_leviathan'], preyTargets: [], edibleYield: 2, byproducts: ['fish_bones'], rarity: 'common', climateTolerance: 75, civilizationTolerance: 40, extinctionThreshold: 18 }),
    species({ id: 'salt_crab', category: 'fish', biomeAffinity: ['salt_marsh'], dietType: 'omnivore', aggression: 15, fear: 60, intelligence: 8, packBehavior: 'colony', activityWindow: 'dawn_dusk', migrationPattern: 'pressure', reproductionRate: 55, carryingCapacity: 120, predatorTargets: ['marsh_heron', 'white_marsh_leviathan'], preyTargets: [], edibleYield: 2, byproducts: ['crab_shell'], rarity: 'common', climateTolerance: 80, civilizationTolerance: 55, extinctionThreshold: 14 }),
    species({ id: 'reed_eel', category: 'predator', biomeAffinity: ['salt_marsh'], dietType: 'carnivore', aggression: 45, fear: 30, intelligence: 18, packBehavior: 'solitary', activityWindow: 'night', migrationPattern: 'pressure', reproductionRate: 32, carryingCapacity: 30, predatorTargets: [], preyTargets: ['marsh_fish', 'salt_crab'], edibleYield: 1, byproducts: ['eel_skin'], rarity: 'uncommon', climateTolerance: 70, civilizationTolerance: 20, extinctionThreshold: 4 }),
    species({ id: 'marsh_heron', category: 'avian', biomeAffinity: ['salt_marsh'], dietType: 'carnivore', aggression: 10, fear: 65, intelligence: 28, packBehavior: 'pair', activityWindow: 'day', migrationPattern: 'seasonal', reproductionRate: 28, carryingCapacity: 30, predatorTargets: [], preyTargets: ['marsh_fish', 'salt_crab'], edibleYield: 1, byproducts: ['feathers'], rarity: 'rare', climateTolerance: 68, civilizationTolerance: 35, extinctionThreshold: 3 }),
    species({ id: 'white_marsh_leviathan', category: 'mythical', biomeAffinity: ['salt_marsh'], dietType: 'carnivore', aggression: 95, fear: 5, intelligence: 50, packBehavior: 'solitary', activityWindow: 'any', migrationPattern: 'event_driven', reproductionRate: 1, carryingCapacity: 1, predatorTargets: [], preyTargets: ['marsh_fish', 'salt_crab', 'reed_eel', 'marsh_heron'], edibleYield: 40, byproducts: ['leviathan_scale'], rarity: 'legendary', climateTolerance: 90, civilizationTolerance: 0, extinctionThreshold: 1 }),
    species({ id: 'marsh_yak', category: 'livestock', biomeAffinity: ['salt_marsh'], dietType: 'herbivore', aggression: 8, fear: 55, intelligence: 14, packBehavior: 'herd', activityWindow: 'day', migrationPattern: 'pressure', reproductionRate: 38, carryingCapacity: 40, predatorTargets: ['reed_eel'], preyTargets: [], edibleYield: 6, byproducts: ['milk', 'hide'], rarity: 'common', climateTolerance: 78, civilizationTolerance: 80, extinctionThreshold: 5, mountEligible: true }),
  ],
  forest: [
    species({ id: 'forest_deer', category: 'herbivore', biomeAffinity: ['forest'], dietType: 'herbivore', aggression: 5, fear: 75, intelligence: 16, packBehavior: 'herd', activityWindow: 'day', migrationPattern: 'pressure', reproductionRate: 55, carryingCapacity: 90, predatorTargets: ['fog_wolf', 'mountain_bear'], preyTargets: [], edibleYield: 4, byproducts: ['hide', 'bone'], rarity: 'common', climateTolerance: 70, civilizationTolerance: 35, extinctionThreshold: 10 }),
    species({ id: 'moss_boar', category: 'herbivore', biomeAffinity: ['forest'], dietType: 'omnivore', aggression: 55, fear: 20, intelligence: 14, packBehavior: 'pair', activityWindow: 'dawn_dusk', migrationPattern: 'pressure', reproductionRate: 35, carryingCapacity: 30, predatorTargets: ['fog_wolf', 'mountain_bear'], preyTargets: [], edibleYield: 5, byproducts: ['hide', 'tusk'], rarity: 'uncommon', climateTolerance: 60, civilizationTolerance: 20, extinctionThreshold: 5 }),
    species({ id: 'fog_wolf', category: 'predator', biomeAffinity: ['forest'], dietType: 'carnivore', aggression: 80, fear: 15, intelligence: 35, packBehavior: 'pack', activityWindow: 'night', migrationPattern: 'pressure', reproductionRate: 25, carryingCapacity: 30, predatorTargets: [], preyTargets: ['forest_deer', 'moss_boar'], edibleYield: 2, byproducts: ['pelt', 'fang'], rarity: 'rare', climateTolerance: 72, civilizationTolerance: 10, extinctionThreshold: 3 }),
    species({ id: 'ember_owl', category: 'avian', biomeAffinity: ['forest'], dietType: 'carnivore', aggression: 12, fear: 55, intelligence: 26, packBehavior: 'solitary', activityWindow: 'night', migrationPattern: 'none', reproductionRate: 30, carryingCapacity: 30, predatorTargets: [], preyTargets: ['bark_mantis'], edibleYield: 1, byproducts: ['feathers'], rarity: 'uncommon', climateTolerance: 65, civilizationTolerance: 40, extinctionThreshold: 3 }),
    species({ id: 'bark_mantis', category: 'insect', biomeAffinity: ['forest'], dietType: 'carnivore', aggression: 25, fear: 40, intelligence: 6, packBehavior: 'swarm', activityWindow: 'day', migrationPattern: 'none', reproductionRate: 50, carryingCapacity: 72, predatorTargets: ['ember_owl'], preyTargets: [], edibleYield: 0, byproducts: ['mantis_shell'], rarity: 'common', climateTolerance: 78, civilizationTolerance: 45, extinctionThreshold: 20 }),
  ],
  mountain: [
    species({ id: 'cliff_goat', category: 'herbivore', biomeAffinity: ['mountain'], dietType: 'herbivore', aggression: 12, fear: 65, intelligence: 18, packBehavior: 'herd', activityWindow: 'day', migrationPattern: 'pressure', reproductionRate: 42, carryingCapacity: 40, predatorTargets: ['mountain_bear'], preyTargets: [], edibleYield: 4, byproducts: ['hide', 'horn'], rarity: 'common', climateTolerance: 82, civilizationTolerance: 30, extinctionThreshold: 6 }),
    species({ id: 'iron_beak_vulture', category: 'scavenger', biomeAffinity: ['mountain'], dietType: 'scavenger', aggression: 20, fear: 35, intelligence: 20, packBehavior: 'pair', activityWindow: 'day', migrationPattern: 'pressure', reproductionRate: 28, carryingCapacity: 30, predatorTargets: [], preyTargets: ['cliff_goat'], edibleYield: 1, byproducts: ['feathers'], rarity: 'uncommon', climateTolerance: 85, civilizationTolerance: 25, extinctionThreshold: 2 }),
    species({ id: 'stone_lizard', category: 'herbivore', biomeAffinity: ['mountain'], dietType: 'omnivore', aggression: 18, fear: 45, intelligence: 8, packBehavior: 'solitary', activityWindow: 'day', migrationPattern: 'none', reproductionRate: 48, carryingCapacity: 55, predatorTargets: ['mountain_bear', 'iron_beak_vulture'], preyTargets: [], edibleYield: 1, byproducts: ['lizard_skin'], rarity: 'common', climateTolerance: 88, civilizationTolerance: 35, extinctionThreshold: 8 }),
    species({ id: 'mountain_bear', category: 'predator', biomeAffinity: ['mountain'], dietType: 'omnivore', aggression: 90, fear: 10, intelligence: 22, packBehavior: 'solitary', activityWindow: 'dawn_dusk', migrationPattern: 'pressure', reproductionRate: 22, carryingCapacity: 30, predatorTargets: [], preyTargets: ['cliff_goat', 'stone_lizard', 'forest_deer'], edibleYield: 8, byproducts: ['pelt', 'claw'], rarity: 'rare', climateTolerance: 84, civilizationTolerance: 8, extinctionThreshold: 1 }),
  ],
  desert: [
    species({ id: 'dune_lizard', category: 'herbivore', biomeAffinity: ['desert'], dietType: 'omnivore', aggression: 10, fear: 60, intelligence: 10, packBehavior: 'solitary', activityWindow: 'day', migrationPattern: 'pressure', reproductionRate: 52, carryingCapacity: 70, predatorTargets: ['ash_serpent', 'mirage_hawk'], preyTargets: [], edibleYield: 1, byproducts: ['lizard_skin'], rarity: 'common', climateTolerance: 92, civilizationTolerance: 30, extinctionThreshold: 10 }),
    species({ id: 'ash_serpent', category: 'predator', biomeAffinity: ['desert'], dietType: 'carnivore', aggression: 85, fear: 12, intelligence: 18, packBehavior: 'solitary', activityWindow: 'night', migrationPattern: 'pressure', reproductionRate: 28, carryingCapacity: 30, predatorTargets: [], preyTargets: ['dune_lizard', 'sand_runner'], edibleYield: 2, byproducts: ['serpent_scale'], rarity: 'rare', climateTolerance: 95, civilizationTolerance: 6, extinctionThreshold: 2 }),
    species({ id: 'sand_runner', category: 'herbivore', biomeAffinity: ['desert'], dietType: 'herbivore', aggression: 8, fear: 78, intelligence: 16, packBehavior: 'herd', activityWindow: 'dawn_dusk', migrationPattern: 'seasonal', reproductionRate: 45, carryingCapacity: 60, predatorTargets: ['ash_serpent', 'mirage_hawk'], preyTargets: [], edibleYield: 3, byproducts: ['hide'], rarity: 'common', climateTolerance: 90, civilizationTolerance: 28, extinctionThreshold: 9 }),
    species({ id: 'mirage_hawk', category: 'avian', biomeAffinity: ['desert'], dietType: 'carnivore', aggression: 35, fear: 25, intelligence: 24, packBehavior: 'solitary', activityWindow: 'day', migrationPattern: 'pressure', reproductionRate: 30, carryingCapacity: 30, predatorTargets: [], preyTargets: ['dune_lizard', 'sand_runner'], edibleYield: 1, byproducts: ['feathers'], rarity: 'uncommon', climateTolerance: 88, civilizationTolerance: 18, extinctionThreshold: 3 }),
  ],
  ruin: [
    species({ id: 'ruin_rat', category: 'scavenger', biomeAffinity: ['ruin'], dietType: 'omnivore', aggression: 22, fear: 40, intelligence: 12, packBehavior: 'pack', activityWindow: 'night', migrationPattern: 'pressure', reproductionRate: 45, carryingCapacity: 60, predatorTargets: ['iron_hound'], preyTargets: [], edibleYield: 1, byproducts: ['hide'], rarity: 'common', climateTolerance: 68, civilizationTolerance: 70, extinctionThreshold: 16 }),
    species({ id: 'mimic_mold', category: 'fungal', biomeAffinity: ['ruin'], dietType: 'fungal', aggression: 0, fear: 0, intelligence: 0, packBehavior: 'colony', activityWindow: 'any', migrationPattern: 'none', reproductionRate: 36, carryingCapacity: 48, predatorTargets: [], preyTargets: [], edibleYield: 0, byproducts: ['spores'], rarity: 'uncommon', climateTolerance: 58, civilizationTolerance: 65, extinctionThreshold: 12 }),
    species({ id: 'iron_hound', category: 'predator', biomeAffinity: ['ruin'], dietType: 'carnivore', aggression: 92, fear: 3, intelligence: 42, packBehavior: 'solitary', activityWindow: 'night', migrationPattern: 'event_driven', reproductionRate: 1, carryingCapacity: 1, predatorTargets: [], preyTargets: ['ruin_rat', 'lantern_moth'], edibleYield: 8, byproducts: ['iron_fang', 'relic_collar'], rarity: 'legendary', climateTolerance: 80, civilizationTolerance: 0, extinctionThreshold: 1 }),
    species({ id: 'lantern_moth', category: 'avian', biomeAffinity: ['ruin'], dietType: 'filter', aggression: 2, fear: 82, intelligence: 6, packBehavior: 'swarm', activityWindow: 'night', migrationPattern: 'seasonal', reproductionRate: 45, carryingCapacity: 60, predatorTargets: ['iron_hound'], preyTargets: [], edibleYield: 0, byproducts: ['glow_dust'], rarity: 'rare', climateTolerance: 60, civilizationTolerance: 50, extinctionThreshold: 10 }),
  ],
} as const satisfies Record<EcosystemRegionId, readonly Species[]>

function species(input: Species): Species {
  return Object.freeze({
    ...input,
    biomeAffinity: Object.freeze([...input.biomeAffinity]),
    predatorTargets: Object.freeze([...input.predatorTargets]),
    preyTargets: Object.freeze([...input.preyTargets]),
    byproducts: Object.freeze([...input.byproducts]),
  })
}

export const ECOSYSTEM_REGION_IDS = Object.freeze(Object.keys(REGION_SPECIES) as EcosystemRegionId[])

export const SPECIES_CATALOG = Object.freeze(
  ECOSYSTEM_REGION_IDS.flatMap((region) => REGION_SPECIES[region])
) as readonly Species[]

const SPECIES_BY_ID = new Map<string, Species>(SPECIES_CATALOG.map((entry) => [entry.id, entry]))

export function listSpecies(): readonly Species[] {
  return SPECIES_CATALOG
}

export function getSpecies(id: string): Species | null {
  return SPECIES_BY_ID.get(id) ?? null
}

export function requireSpecies(id: string): Species {
  const hit = getSpecies(id)
  if (!hit) throw new Error(`Unknown ecosystem species: ${id}`)
  return hit
}

export function listSpeciesByRegion(region: EcosystemRegionId): readonly Species[] {
  return REGION_SPECIES[region]
}

export function listSpeciesByCategory(category: SpeciesCategory): readonly Species[] {
  return SPECIES_CATALOG.filter((entry) => entry.category === category)
}

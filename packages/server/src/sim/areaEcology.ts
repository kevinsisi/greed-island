// Sprint 2A — world-visibility-ecology
//
// Per-tile rollup of the four E0/E1 ecology projections. Pure types +
// builder helper. No state of its own — every call reads the current
// projection snapshots, so this is replay-safe and deterministic.

import type { EcosystemRegionId } from '../ecosystem/species.js'
import type { MigrationType } from '../ecosystem/migration.js'

export type AnimalGroupRow = Readonly<{
  speciesId: string
  tileId: string
  biomeRegion: EcosystemRegionId
  count: number
  animalIds: readonly string[]
}>

export type FisheryRow = Readonly<{
  tileId: string
  density: number
  harvestedTotal: number
  collapsed: boolean
  lastUpdatedTick: number
}>

export type MigrationRow = Readonly<{
  waveId: string
  speciesId: string
  fromTileId: string
  toTileId: string
  migrationType: MigrationType
  startedAtTick: number
  count: number
}>

export type PredatorWarningRow = Readonly<{
  predatorSpeciesId: string
  tileId: string
  lastKillAtTick: number
}>

export type AreaEcologyView = Readonly<{
  tileId: string
  animals: readonly AnimalGroupRow[]
  fishery: FisheryRow | null
  migrationsArriving: readonly MigrationRow[]
  migrationsDeparting: readonly MigrationRow[]
  predatorWarnings: readonly PredatorWarningRow[]
}>

export type AreaEcologyInput = Readonly<{
  tileId: string
  animals: ReadonlyArray<{
    speciesId: string
    tileId: string
    biomeRegion: EcosystemRegionId
    count: number
    animalIds: readonly string[]
  }>
  fishery: {
    tileId: string
    density: number
    harvestedTotal: number
    collapsed: boolean
    lastUpdatedTick: number
  } | null
  migrationWaves: ReadonlyArray<{
    waveId: string
    speciesId: string
    fromTileId: string
    toTileId: string
    migrationType: MigrationType
    startedAtTick: number
    count: number
  }>
  predatorHunger: ReadonlyArray<{
    predatorSpeciesId: string
    tileId: string
    lastKillAtTick: number
  }>
}>

export function buildAreaEcology(input: AreaEcologyInput): AreaEcologyView {
  const animals: AnimalGroupRow[] = input.animals
    .filter((row) => row.tileId === input.tileId && row.count > 0)
    .map((row) => ({
      speciesId: row.speciesId,
      tileId: row.tileId,
      biomeRegion: row.biomeRegion,
      count: row.count,
      animalIds: [...row.animalIds],
    }))
    .sort(
      (a, b) =>
        b.count - a.count ||
        a.speciesId.localeCompare(b.speciesId)
    )

  const migrationsArriving: MigrationRow[] = input.migrationWaves
    .filter((wave) => wave.toTileId === input.tileId)
    .map(toMigrationRow)
    .sort(sortMigration)

  const migrationsDeparting: MigrationRow[] = input.migrationWaves
    .filter((wave) => wave.fromTileId === input.tileId)
    .map(toMigrationRow)
    .sort(sortMigration)

  const predatorWarnings: PredatorWarningRow[] = input.predatorHunger
    .filter((row) => row.tileId === input.tileId)
    .map((row) => ({
      predatorSpeciesId: row.predatorSpeciesId,
      tileId: row.tileId,
      lastKillAtTick: row.lastKillAtTick,
    }))
    .sort((a, b) => a.predatorSpeciesId.localeCompare(b.predatorSpeciesId))

  const fishery: FisheryRow | null =
    input.fishery && input.fishery.tileId === input.tileId
      ? {
          tileId: input.fishery.tileId,
          density: input.fishery.density,
          harvestedTotal: input.fishery.harvestedTotal,
          collapsed: input.fishery.collapsed,
          lastUpdatedTick: input.fishery.lastUpdatedTick,
        }
      : null

  return {
    tileId: input.tileId,
    animals,
    fishery,
    migrationsArriving,
    migrationsDeparting,
    predatorWarnings,
  }
}

function toMigrationRow(wave: {
  waveId: string
  speciesId: string
  fromTileId: string
  toTileId: string
  migrationType: MigrationType
  startedAtTick: number
  count: number
}): MigrationRow {
  return {
    waveId: wave.waveId,
    speciesId: wave.speciesId,
    fromTileId: wave.fromTileId,
    toTileId: wave.toTileId,
    migrationType: wave.migrationType,
    startedAtTick: wave.startedAtTick,
    count: wave.count,
  }
}

function sortMigration(a: MigrationRow, b: MigrationRow): number {
  return (
    a.startedAtTick - b.startedAtTick ||
    a.speciesId.localeCompare(b.speciesId) ||
    a.waveId.localeCompare(b.waveId)
  )
}

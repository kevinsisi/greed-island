// Sprint 2A — world-visibility-ecology
// Pure helper that derives per-tile ecology summaries for the Hub map
// from the WorldSnapshot.facts payloads. Kept pure so it can be unit-
// tested without touching Phaser.

import type {
  AnimalGroupRow,
  MigrationRow,
  PredatorWarningRow,
} from '../api/client'

export type EcologyBadge = Readonly<{
  speciesId: string
  count: number
}>

export type MigrationDirection = Readonly<{
  fromTileId: string
  toTileId: string
  speciesId: string
}>

export type HubEcologySummary = Readonly<{
  tileId: string
  /** Top 2 species by count desc, lex tiebreak. Length 0–2. */
  badges: readonly EcologyBadge[]
  /** Hungry predator species ids on this tile (empty array = no warning). */
  predatorWarningSpecies: readonly string[]
  /** Migration waves arriving at this tile (to draw an incoming arrow). */
  migrationsArriving: readonly MigrationDirection[]
  /** Migration waves leaving this tile. */
  migrationsDeparting: readonly MigrationDirection[]
}>

export function buildHubEcologySummaries(input: {
  animals: readonly AnimalGroupRow[]
  migrations: readonly MigrationRow[]
  predatorHunger: readonly PredatorWarningRow[]
}): readonly HubEcologySummary[] {
  const byTile = new Map<string, AnimalGroupRow[]>()
  for (const row of input.animals) {
    if (row.count <= 0) continue
    if (!byTile.has(row.tileId)) byTile.set(row.tileId, [])
    byTile.get(row.tileId)!.push(row)
  }

  const tileIds = new Set<string>([...byTile.keys()])
  for (const w of input.migrations) {
    tileIds.add(w.fromTileId)
    tileIds.add(w.toTileId)
  }
  for (const p of input.predatorHunger) tileIds.add(p.tileId)

  const summaries: HubEcologySummary[] = []
  for (const tileId of tileIds) {
    const rows = (byTile.get(tileId) ?? []).slice().sort(
      (a, b) => b.count - a.count || a.speciesId.localeCompare(b.speciesId)
    )
    const badges = rows.slice(0, 2).map((r) => ({ speciesId: r.speciesId, count: r.count }))
    const predatorWarningSpecies = input.predatorHunger
      .filter((p) => p.tileId === tileId)
      .map((p) => p.predatorSpeciesId)
      .filter((id, idx, arr) => arr.indexOf(id) === idx)
      .sort()
    const migrationsArriving = input.migrations
      .filter((m) => m.toTileId === tileId)
      .map((m) => ({ fromTileId: m.fromTileId, toTileId: m.toTileId, speciesId: m.speciesId }))
    const migrationsDeparting = input.migrations
      .filter((m) => m.fromTileId === tileId)
      .map((m) => ({ fromTileId: m.fromTileId, toTileId: m.toTileId, speciesId: m.speciesId }))
    summaries.push({
      tileId,
      badges,
      predatorWarningSpecies,
      migrationsArriving,
      migrationsDeparting,
    })
  }
  return summaries.sort((a, b) => a.tileId.localeCompare(b.tileId))
}

# Proposal — World Visibility: Ecology (Phase E0/E1 follow-up)

## Why

`docs/WORLD_CAPABILITIES.md` Part I §6.2 declares ecosystem autonomy as a
core principle — the world's wildlife, migrations, predators and fishery
should be a living substrate the player feels at all times, not just a
backend simulation. Today the backend has shipped every E0/E1 ecology
projection (`animalPopulation`, `migrationRoutes`, `fisheryDensity`,
`predatorHunger`), but **none of it is rendered to the player**:

- `/api/world` does carry `facts.animalPopulation`, but `packages/web/src`
  has no consumer — grep returns zero hits outside the admin GM page.
- `AreaScene.ts` and `MapScene.ts` (the only player-facing Phaser scenes)
  paint districts as flat colored blocks; no animals, no migration, no
  fishery, no predator state appear on the map.
- The user observed this directly: "目前世界地圖上會看到動物嗎?" — the
  answer is no, even though the ecology is alive in the EventLog.

This slice closes that implicit "player must see ecology" requirement
that Phases E0/E1 left open. It is **read-only**: no new commands, no
new events, no change to the Rule Engine. Pure projection surfacing
plus rendering.

Animal-as-aggressor behavior (hungry predators attacking NPCs, NPC
counter-hunting parties) is **out of scope here** and tracked separately
as Sprint 2B `animal-aggression` (fits Phase 5 §40 "Persistent Combat
Consequences (incl. wildlife)") and Sprint 2C `npc-defense-coordination`
(Phase 3/5 extension).

## What Changes

### New read surface
- `GET /api/area/:tileId/ecology` returns the per-tile rollup:
  `{ tileId, animals: AnimalGroupRow[], fishery: FisheryRow | null,
     migrationsArriving: MigrationRow[], migrationsDeparting: MigrationRow[],
     predatorWarnings: PredatorHungerRow[] }`.
- `AnimalGroupRow` exposes both group-level (`speciesId`, `count`,
  `biomeRegion`) and individual-level (`animalIds: string[]`) data so the
  client can render clusters or individual sprites depending on density.

### Player-facing rendering
- **Hub map** (`MapScene.ts`): every district paints up to 2 ecology
  badges in a stable anchor (top-right corner). Badge shows species emoji
  (or fallback letter) plus total animal count. Predator-hunger tiles
  show an additional dimmed warning ring.
- **AreaScene** (`AreaScene.ts`): when a player enters a district, the
  scene paints animal presence inside the district:
  - ≤ 5 animals of a species: one small sprite per `animalId`, anchored
    at deterministic sub-cell positions hashed from `animalId`.
  - ≥ 6 animals: a single cluster sprite + count label.
  - Water-biome districts also paint a small fishery density bar.
  - Migration waves arriving/departing show a stylized arrow on the
    relevant tile edge.

### AI dialog connection
- `buildEcologyBlock()` (`aiDialog.ts`, shipped in v0.17.0 §37.1) gains
  a structured `animals: { speciesId, count }[]` field instead of just a
  flat count. NPC AI prompts can reference specific species + counts
  (still bound by anti-hallucination block: species must be in the
  passed list).

### GM/admin surface
- `/admin/world` adds the missing `facts.animalPopulation` table.
  Existing `migrationRoutes` and `predatorHunger` panels stay as-is.

## Out Of Scope

- Animal aggression / counter-attack (Sprint 2B `animal-aggression`).
- NPC defense party formation (Sprint 2C `npc-defense-coordination`).
- Sub-cell terrain mask (Sprint 4 `district-subtile-terrain`).
- Sprite art assets — uses Phaser geometry + emoji like the rest of
  the prototype layer.
- Species-specific habit AI (just rendering; behavior follows existing
  predation / migration policies).
- Tile-edge migration animation timing / interpolation — show a static
  arrow this slice; animation is a future polish.

# Design — World Visibility: Ecology

## Principle alignment

- **Part I §6.2 Ecosystem Autonomy** (`docs/WORLD_CAPABILITIES.md`):
  "The ecosystem must be a living substrate the player can feel."
  Today the substrate exists but is invisible. This change closes the
  feel gap.
- **Part I §2.4 AI Read-Only Principle**: AI gains richer ecology
  facts in its dialog prompt but is still rendering, not commanding.
- **ARCHITECTURE.md §0 Command/Event/Rule Engine**: this change adds
  zero commands and zero events. Pure projection-to-UI surface.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  SimulationRuntime (server)                                     │
│  ─ AnimalPopulationProjection (existing)                        │
│  ─ AnimalMigrationProjection (existing)                         │
│  ─ FisheryDensityProjection (existing)                          │
│  ─ PredatorHungerProjection (existing)                          │
└──┬──────────────────────────────────────────────────────────────┘
   │ tile-scoped accessors (existing + 1 new rollup helper)
   ▼
┌─────────────────────────────────────────────────────────────────┐
│  HTTP routers (server)                                          │
│  ─ NEW  GET /api/area/:tileId/ecology   (this slice)            │
│  ─       GET /api/world.facts.animalPopulation  (existing)       │
│  ─ admin GET /api/admin/world             (existing, +1 table)   │
└──┬───────────────────────────────────┬──────────────────────────┘
   │ per-tile rollup                   │ snapshot (Hub)
   ▼                                   ▼
┌─────────────────────────────┐  ┌────────────────────────────────┐
│ AreaScene (web)             │  │ MapScene / HubPage (web)       │
│ ─ individual sprites (≤5)   │  │ ─ ecology badges per district  │
│ ─ cluster sprite (≥6)       │  │ ─ predator-warning ring        │
│ ─ fishery density bar       │  │ ─ migration arrow on tile edge │
│ ─ migration arrow           │  │                                │
└─────────────────────────────┘  └────────────────────────────────┘
   ▲
   │ ecology block (animals: {speciesId, count}[])
   │
┌─────────────────────────────────────────────────────────────────┐
│  aiDialog.ts (server) — buildEcologyBlock()                     │
│  Uses anti-hallucination guard from v0.17.0 §37.1.              │
└─────────────────────────────────────────────────────────────────┘
```

## Decision log

### D1 — One rollup endpoint vs five
**Chose**: one rollup endpoint `/api/area/:tileId/ecology` that returns
animals + fishery + migrations + predator warnings as a single
`AreaEcologyView`.

**Why**: client always needs all four together to render a district.
Five separate requests would create N+1 latency and torn views (animal
list at tick T, migration at tick T+1). Rollup keeps the per-tile
ecology snapshot internally consistent.

### D2 — Group + individual in the same row
**Chose**: `AnimalGroupRow` carries both `count` AND `animalIds: string[]`.

**Why**: AreaScene needs `animalIds` for per-id sub-cell hash placement
(≤ 5 case); Hub badge only needs `count` (≥ 6 case). One row, two render
paths.

### D3 — Sub-cell placement = `hashSeed(animalId, tileId)`
**Chose**: deterministic sub-cell `(subCol, subRow)` derived from
`hashSeed(animalId, tileId, 'ecology-placement')` mod (subCols×subRows).

**Why**:
- Replay-safe: same animal id always lands on the same sub-cell across
  reloads.
- Avoids storing per-animal x/y in a new projection (no new server state).
- Will not collide with NPC presence: this is purely client-side
  rendering placement; backend authoritative presence is unaffected.

### D4 — Cluster threshold = 5
**Chose**: ≤ 5 animals → individual sprites; ≥ 6 → cluster + count.

**Why**: Phaser sprite rendering stays cheap (≤ 5 × 8 species per tile ≈
40 sprites max per scene). Above that, clutter overwhelms the small
district pixel budget.

### D5 — Hub badge cap = top 2 species per tile
**Chose**: badge shows up to 2 species ranked by `count` desc, then
`speciesId` lex tiebreak.

**Why**: deterministic, readable, won't overflow the small corner anchor.
A tile with 5 species still tells the player "this place is alive" via
the top 2.

### D6 — AI ecology block: structured array, not flat string
**Chose**: extend `EcologyContext` with `animals: { speciesId, count }[]`
sorted by count desc; serialize to prompt as `"鹿 ×3, 狼 ×1"` (zh-TW
preferred) so NPCs can speak specific numbers.

**Why**: v0.17.0's anti-hallucination block requires the AI to only
reference items in the supplied list. A structured list keeps that
guarantee intact while letting NPCs say "I saw three deer" instead of
"some animals".

## Determinism notes

- All client-side hashing (`hashSeed(animalId, tileId, 'ecology-placement')`)
  must use the same `hashSeed` utility the server uses. Web client already
  imports `hashSeed` for sprite positioning of NPC presence; reuse.
- No new server-side mutable state. All four projections continue to
  rebuild from the EventLog with their existing canonical-hash tests.

## Failure modes & guards

- **Tile not in map**: `/api/area/:tileId/ecology` returns `404` with
  `{ error: 'unknown tile' }`; client falls back to no overlay.
- **Projection empty**: endpoint returns `{ animals: [], fishery: null,
  migrationsArriving: [], migrationsDeparting: [], predatorWarnings: [] }`
  (200 OK, empty rollup) — client renders nothing, no error UI.
- **Migration arrow collides with NPC sprite**: arrow is rendered on tile
  edge z-index BELOW NPC sprites; visual stays readable.

## Testing strategy

- **Server**: vitest on the new endpoint covering empty / populated /
  migration-in-transit / predator-warning / unknown-tile.
- **Server**: vitest on the AI ecology block ensuring the structured
  animals array is in the prompt and species not in the list are not
  injected.
- **Web**: vitest on `MapScene` badge picker (top-2 selection, lex
  tiebreak) and on the sub-cell hash placement helper.
- **Web**: a Phaser scene render-counts test: 5 animals of one species →
  5 individual sprites; 6 animals → 1 cluster sprite + count label.

## Rollout

- Version bump to `v0.19.0` (web + server `version.ts` + workspace
  `package.json`s).
- No data migration. Existing EventLog and projections unchanged.
- Backward compatible: clients on older versions still get the prior
  flat `facts.animalPopulation` (now hydrated for them too via the
  unchanged `/api/world` route).

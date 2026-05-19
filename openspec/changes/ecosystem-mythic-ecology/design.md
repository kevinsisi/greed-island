## Context

Phase E3 delivered a fully functional livestock/mount lifecycle. The ecosystem simulation now has: spawning, reproduction, predation, migration, pressure/collapse, extinction tracking, and domestication. What's missing is narrative drama — the ecosystem should occasionally produce *legendary events* that the world's NPCs and history chronicle can react to.

The existing ecosystem infrastructure (`AnimalPopulationProjection`, `LivestockRegistryProjection`, `EcosystemRegionProjection`, `pressurePlanner`, `extinctionPlanner`) provides all the substrate needed. Phase E4 adds three interlocking layers on top:

1. **Legendary species** — low-probability apex predators that spawn as named individuals.
2. **World events** — a projection tracking active legendary-creature events; drives settlement NPC panic via existing `areaSafety` pathway.
3. **Faction ecology** — each faction's ecological ideology produces periodic commands the chronicle can narrate.

## Goals / Non-Goals

**Goals:**
- Add `white_marsh_leviathan` and `iron_hound` as `rarity: 'legendary'` species with very low spawn probability (≤ 1% per cadence check when conditions met).
- `WorldEventProjection` tracks `WORLD_EVENT_SPAWNED` / `WORLD_EVENT_RESOLVED` — active events visible in snapshot facts.
- Settlement panic: `areaSafety` for a tile drops when an active world event targets it, causing hunter/guard NPCs to increase activity (existing nudge logic handles the rest).
- Legendary hunt arc: when ≥ 3 hunter-role NPCs are on the same tile as a legendary creature for ≥ `LEGENDARY_HUNT_THRESHOLD_TICKS`, emit `LEGENDARY_HUNT_STARTED`; when the creature dies, emit `LEGENDARY_HUNT_CONCLUDED`.
- Faction ecology: 4 stances × 1 periodic command each, gated on ecosystem state (pressure level / fishery density / livestock count). Chinese chronicle narration for all.
- Admin UI section "神話生態 Mythic Ecology".

**Non-Goals:**
- Combat mechanics for legendary creatures (Phase 5 / wildlife combat is out of scope here).
- Player-triggered hunt commands (Phase 6).
- More than 2 legendary species for v0.29.0.
- Faction ideology changes (stances are static data on the faction, not player-adjustable).
- History chronicle projection / arc detection (Phase 5 §40.4).

## Decisions

### Legendary species spawn gating
`legendarySpawnPlanner` runs every `LEGENDARY_SPAWN_CADENCE_TICKS` (= `10 × ECOSYSTEM_REPRODUCTION_CADENCE_TICKS`). It checks:
1. No existing legendary animal of that species already alive on any tile (singleton constraint).
2. Wild population of prey species on the target tile ≥ threshold.
3. Ecosystem pressure on the tile ≤ `LEGENDARY_MAX_PRESSURE` (healthy ecosystem needed).
4. Deterministic probability check: `hash(tick + speciesId) % 1000 < LEGENDARY_SPAWN_PROBABILITY` (default 5 = 0.5%).

If all pass, emits `ANIMAL_SPAWNED` with the legendary animal. No new command type — reuses existing `ANIMAL_SPAWNED`.

### World event lifecycle
`WORLD_EVENT_SPAWNED` emitted by runtime when a legendary creature appears. Payload: `{ eventKind, tileId, linkedAnimalId, speciesId, tick }`.
`WORLD_EVENT_RESOLVED` emitted when `ANIMAL_KILLED` / `ANIMAL_STARVED` / `ANIMAL_MIGRATED` matches a tracked legendary animal. `WorldEventProjection` maintains `Map<linkedAnimalId, WorldEventRow>`.

`areaSafety` injection: runtime reads `worldEventProjection.getActiveByTile(tileId)` and subtracts severity from the tile's safety score before passing `areaSafety` to `npcEngine.tick()`. Existing personality nudge logic in `npcEngine.ts` then makes NPCs flee/hunt without any NpcEngine changes.

### Legendary hunt detection
`legendaryHuntPlanner` is called each tick (light — O(n) over active world events). For each active event, count hunter-tagged NPCs on the event tile. When count ≥ `LEGENDARY_HUNT_MIN_HUNTERS` (= 3) for ≥ `LEGENDARY_HUNT_THRESHOLD_TICKS` (= `5 × TICKS_PER_MINUTE`), emit `LEGENDARY_HUNT_STARTED` (once per event). When the creature's world event resolves with a kill, emit `LEGENDARY_HUNT_CONCLUDED`.

Hunt state (started tick, emitted flags) lives in a lightweight in-memory `LegendaryHuntTracker` (not a projection — it's ephemeral and rebuilt from active world events on boot).

### Faction ecology
`factionEcologyPlanner` runs every `FACTION_ECOLOGY_CADENCE_TICKS` (= `8 × ECOSYSTEM_REPRODUCTION_CADENCE_TICKS`). Static stance map:
- `guild` → if ecosystem pressure on any forest tile ≥ threshold → `FOREST_CLEARCUT_ORDERED`
- `tide_hunters` → if fishery density on any salt_marsh tile ≤ threshold → `FISHING_QUOTA_ENFORCED`
- `free_runners` → if any settlement has livestock count ≥ threshold → `INDUSTRIAL_SITE_SABOTAGED`
- `hidden_overseer` → unconditional every N ticks → `RITUAL_ECOSYSTEM_MANIPULATION`

These commands currently produce chronicle entries only (no gameplay effect yet). Effects can be wired in a follow-up.

### `WorldEventProjection` boot hydration
Same pattern as every other projection: added to `ECOSYSTEM_BOOT_EVENT_TYPES`, wired into both boot branches and both per-event fan-out loops.

## Risks / Trade-offs

- **Singleton legendary constraint** uses `animalPopulationProjection.list()` to check for existing legendary animals. This is O(all animals) but runs infrequently (every ~120 ticks) and the population list is small.
- **Faction ecology commands have no gameplay effect** in this phase. They exist for chronicle narration only — this is a deliberate choice to keep scope tight and defer effect wiring to a follow-up.
- **`areaSafety` patch** modifies the map built each tick in `runtime.ts` before passing to `npcEngine.tick()`. This is the simplest hook without touching NpcEngine internals.
- **Hunt detection is in-memory** (not a projection). If the server restarts during an active hunt, the `LEGENDARY_HUNT_STARTED` event may be re-emitted. Idempotency: `WorldEventProjection` tracks whether `huntStartedEmitted` for each event, so the runtime cadence block checks the projection before emitting a duplicate.

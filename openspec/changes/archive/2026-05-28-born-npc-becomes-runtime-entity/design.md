## Context

The current NPC architecture has two-tier identity:

1. **Config-loaded NPCs** — `NpcProfile[]` read from JSON profile files at server boot. ~50 NPCs across 17 files. Each has a fixed `id`, `name`, `role`, `personality`, `defaultLocation`, `routine`, `triggers`.
2. **Event-recorded births** — `NPC_CHILD_BORN` writes to `LifeExpansionState.households[].childIds` (a string array of child ids) and stores `nameZh` / `nameEn`. **No matching `NpcProfile` is ever created.** No `NpcEngine.getState()` is wired. The child appears in `getNpcs()` as nothing.

Knock-on effects:
- `BeliefProjection`, `IntentProjection`, `RelationshipGraph`, `npc_memory`, `npc_relationships`, `AreaStateProjection` all key off `npcId` — children have ids but are never used as keys, so projections never receive them.
- AI dialog grounding (`AiDialogContext`) iterates `runtime.getNpcs()` — children are invisible.
- `/admin/npcs` reports `byOrigin.born = 0` because `runtime.getManualNpcIds()` returns all 50 config NPCs and `totalNpcs - manual = 0`.
- The ecosystem layer is correctly asymmetric: `ANIMAL_REPRODUCED` produces real `Animal` entities tracked in `AnimalPopulationProjection`. Humans don't do this.

The repository has Cognitive Runtime (Belief v0.50, Intent v0.51, Memory v0.53), so once a born NPC enters `getNpcs()` and `NpcEngine.getState()` is wired, that NPC automatically participates in the full cognitive stack with no per-projection changes. The blocker is solely the **profile registry** + **maturation lifecycle**.

## Goals / Non-Goals

**Goals:**
- Born children become real runtime NPC entities after a maturation period (deterministic, event-sourced).
- Closes the verification path for WORLD_CAPABILITIES.md §43.1 first criterion (deceased ancestor remembered by descendant).
- Matured born NPCs participate fully in Cognitive Runtime (belief / intent / memory / relationships).
- Population grows over real wall-clock time as a function of household formation cadence (1078 births → 1078 future runtime NPCs after maturation).
- Boot hydration replays every `NPC_MATURED` event from the EventLog so post-restart runtime has the same NPC roster.
- Children's names are deterministic and diverse (not all `潮生`).
- Existing config-loaded profiles continue to work unchanged.

**Non-Goals:**
- Multi-dimensional NPC↔NPC emotional relationships — separate OpenSpec change.
- Pregnancy / gestation state — separate change.
- Skill / wealth / household-position inheritance from parents to matured children — out of scope for this change. The matured child gets baseline civic.gold=0, skillXp=0; inheritance is a future Phase 3 extension.
- Player-triggered NPC creation.
- Visible "minor" state — children remain abstract in `LifeExpansionState` until `NPC_MATURED` fires. We do not render children-as-NPCs on the map before maturation.

## Decisions

### Decision 1: New `NPC_MATURED` event, projected by `BornNpcsProjection`

**Choice:** Introduce a new event type `NPC_MATURED` that promotes a child from `LifeExpansionState.childIds` into a runtime NPC entity. `BornNpcsProjection` derives an `NpcProfile`-shaped record from the matured child id.

**Why not just use `NPC_CHILD_BORN` directly?**
- Children should not appear as adults the tick they are born — that breaks the world's biological believability.
- Maturation tick (`NPC_MATURATION_TICKS`) lets us tune the "world generation cycle" without rewriting events.
- Two events allow future extensions (e.g., child mortality before maturation) without touching the maturation pathway.

**Alternatives considered:**
- *Mutate `profiles` array in `SimulationRuntime`* — breaks immutability. Reject.
- *Compute matured-NPC list lazily from `LifeExpansionState.childIds`* — couples profile generation to an unrelated projection; testing becomes harder; cannot handle the case where parents die before maturation. Reject.
- *Reuse `NPC_CHILD_BORN` payload to immediately register as adult* — biologically nonsensical; coarser event semantics. Reject.

### Decision 2: Deterministic profile derivation from `childId`

**Choice:** `BornNpcsProjection.deriveProfile(childId, parents, homeTileId, nameZh, nameEn)` produces a complete `NpcProfile` synchronously, using `hashSeed(childId, ...)` to choose:
- `personality.archetype` from a small enum pool (`commoner` | `craftsman` | `dreamer` | `hunter_apprentice`).
- `personality.patience` / `greed` / `talkativeness` / `factionLean` — int in known ranges via `hashInt(childId, field) % range`.
- `role.zh` / `role.en` from a small enum based on archetype (e.g., `commoner` → 「街坊年輕人」/「young townsfolk」).
- `defaultLocation` = the parents' `homeTileId` at the time of `NPC_HOUSEHOLD_FORMED`.
- `routine` = a minimal default routine (3 windows: morning home tile, midday central, evening home).
- `triggers = []` (matured children start with no scripted triggers).

**Why deterministic derivation rather than persisting profile in the event?**
- Keeps event payload small. The event records identity (`childId`, name, household, tile); derivation handles personality.
- Replay-safe — any future change to the derivation function only affects worlds initialized after that change (or worlds rebuilt by `BornNpcsProjection.rebuildFromEvents`).
- Aligns with existing pattern: `npcLifespanTicks(npcId)` already derives lifespan deterministically from id; `Animal` runtime state is also derived from `ANIMAL_SPAWNED` payload + species catalog.

**Alternative considered:**
- *Persist the full `NpcProfile` JSON in the `NPC_MATURED` payload* — bloats EventLog, conflates intent (the event) with realized state (the profile). Reject.

### Decision 3: `NpcEngine.registerDynamicNpc(profile)` API

**Choice:** `NpcEngine` exposes a method to admit a new profile into its internal `Map<npcId, NpcRuntimeState>` (currently it's seeded from constructor only).

**Why not a new `DynamicNpcEngine`?**
- Two engines means `runtime.ts` must run both per tick, merge states, handle priority — large surface change.
- The cognitive loop is identical for born NPCs and config NPCs once they have a profile.
- Existing `npcEngine.getState(id)` already returns `null` for unknown ids — adding ids dynamically is the obvious extension.

**Implementation:** internal map of profiles becomes mutable (`Map<string, NpcProfile>`); `registerDynamicNpc(profile)` adds to map + initializes default `NpcRuntimeState` at `profile.defaultLocation`. Constructor still accepts initial `readonly NpcProfile[]`.

### Decision 4: Boot hydration via `BORN_NPC_BOOT_EVENT_TYPES`

**Choice:** Two event types — `NPC_CHILD_BORN` and `NPC_MATURED` — added to a new boot hydration set. `BornNpcsProjection.rebuildFromEvents(events)` reconstructs the matured-NPC roster on every server start.

**Why both events and not just `NPC_MATURED`?**
- The projection needs the `NPC_CHILD_BORN` payload (name, household, tile) to derive the profile when it sees the subsequent `NPC_MATURED`.
- Following the existing pattern of selective large-log hydration (`MORTALITY_BOOT_EVENT_TYPES`, `LINEAGE_BOOT_EVENT_TYPES`, `BUILDING_OCCUPANTS_BOOT_EVENT_TYPES`, etc.).

### Decision 5: Maturation cadence & threshold

**Choice:**
- `NPC_MATURATION_TICKS = 17_280` ticks (one in-game "year" at 720 ticks/in-game-hour × 24 = 17280 → 24 in-game days = roughly 1 day of real wall clock).
- `MATURATION_CADENCE_TICKS = 720` (check once per in-game hour).
- Maturation planner iterates households, finds children with `currentTick - childBornAtTick ≥ NPC_MATURATION_TICKS`, emits `NPC_MATURED` for each.

**Why these numbers?**
- 17,280 ticks = ~1 real day of continuous server uptime. Slow enough to feel like time passes; fast enough to be observable in a development cycle.
- 720-tick cadence keeps the per-tick scan cheap (`MATURATION_CADENCE_TICKS` aligns with one in-game hour, same cadence as other planners).
- Tunable in `config/world.ts` — production deployments can crank the maturation threshold up (e.g., 7 in-game years).

### Decision 6: Deterministic child name generation

**Choice:** Replace `nameZh: '潮生'` constant with `generateChildName(childId, householdId)` — deterministic function returning `{ nameZh, nameEn }` from a small bilingual name pool (~30 entries) selected via `hashSeed`.

**Why a small pool?**
- Easy to author, lore-consistent (all names follow the 潮鳴市 naming conventions).
- Pool size > expected births in a typical play session → collisions are tolerable (real-world humans share names too).
- Pool stored in `packages/server/src/data/npcChildNamePool.ts` — easily extended later.

**Alternative considered:**
- *Algorithmically generate names from syllable tables* — overengineering, risks unpronounceable strings. Reject for v1.

### Decision 7: Parents-alive guard

**Choice:** `MaturationPlanner` skips children whose **all** household partners are deceased at the time of the check. If both parents are dead before the child matures, the child does not mature (becomes a "lost child", recorded but not promoted).

**Why:** A child with no surviving caretaker is biologically and narratively an orphan; making them mature into a fully-formed adult on schedule feels wrong. Future Phase 3 can extend with `NPC_ORPHANED` + adoption mechanics. For v1: silently skip.

**Side note:** Households without children (`childIds.length === 0`) are unaffected.

## Risks / Trade-offs

- **[Risk] EventLog bloat from many `NPC_MATURED` events over years of uptime.**
  → Mitigation: each event is ~200 bytes; at current cadence of 90 ticks between births per family with ~10 active families, this is ~10 events per in-game day. Over a year of wall-clock uptime: < 10 MB. Negligible relative to the 547k events already in the production EventLog.

- **[Risk] Cognitive Runtime cost scales linearly with NPC count.**
  → Mitigation: Already protected by `MAX_COMMANDS_PER_TICK_HARD_CAP`, `NPC_PARTITION_PERIOD = 4`, and `TILE_ACTIVITY_RECENCY_TICKS` regional throttling. Born NPCs use the same throttling. Load test should confirm at 200 + 100 = 300 NPCs.

- **[Risk] Tests that hardcode the 50-NPC roster (`expect(npcs.length).toBe(50)`).**
  → Mitigation: grep for fixed counts; replace with `≥ 50` or filter by a known config id.

- **[Risk] Snapshot serializers may not handle changing `npcs[]` size between consecutive snapshots.**
  → Mitigation: snapshots already include unbounded `getActiveWorldEvents()`, dynamic tiles (v0.84.0), and dynamic buildings. The pattern is established.

- **[Trade-off] Matured children have generic profiles, not personality-blended from parents.**
  → Conscious choice for v1. Inheritance is rich enough to deserve its own change.

- **[Trade-off] Two events per child (`NPC_CHILD_BORN` + `NPC_MATURED`) instead of one.**
  → Accepted. Mirrors animal lifecycle (`ANIMAL_SPAWNED` followed by later `ANIMAL_REPRODUCED` chains).

- **[Risk] `NPC_DECEASED` for a matured born NPC: does the lineage projection know the parents?**
  → `NpcLineageProjection` already supports `parentNpcId` linkage via `NPC_HEIR_ASSIGNED` and household members. Born NPCs' `householdId` field at maturation time correctly seeds the projection.

## Migration Plan

1. Land event type + projection + planner with tests, no runtime wiring yet.
2. Wire boot hydration + per-event fan-out — runtime now hydrates from EventLog but no children mature yet (planner cadence gate).
3. Wire planner into `computeNextTick` cadence block. First `NPC_MATURED` fires roughly `NPC_MATURATION_TICKS` ticks after the next `NPC_CHILD_BORN` (existing births don't have `bornAtTick` ≤ `currentTick - threshold` yet, so it's a slow ramp).
4. Verify behavior: NPC roster grows; admin dashboard "自我誕生 NPC" count > 0 after first maturation; dialog calls grounded against new ids.

**Rollback:** Disable maturation planner with feature flag `MATURATION_ENABLED = false` if production behavior misbehaves; `NPC_MATURED` events already committed are still hydrated but no new ones fire. Born children remain abstract.

## Open Questions

- **Q1:** Should the matured born NPC's `bornAtTick` (used by `npcLifespanTicks` for mortality) be the maturation tick or the original birth tick?
  - **Answer**: Original birth tick. The `NpcMortalityProjection` already uses `bornAtTick` as the age clock; using birth-tick makes the matured NPC's natural lifespan tied to actual age, not maturation age. This means a matured NPC has used up `NPC_MATURATION_TICKS / NPC_BASE_LIFESPAN_TICKS ≈ 14%` of their lifespan when they enter the runtime.

- **Q2:** Should the matured NPC carry visible `parentNpcIds` for dialog grounding?
  - **Answer**: Yes. `BornNpcsProjection` records `parentNpcIds: readonly string[]` from the `NPC_HOUSEHOLD_FORMED` event of the child's household. `AiDialogContext` can surface this so the matured NPC's dialog respects "my parents are..." factually.

- **Q3:** What if a child id collides with a config-loaded profile id?
  - **Answer**: Cannot happen by construction — child ids are `household.<partner1>.<partner2>.child.1`, which contains dots and slashes that no config-loaded profile id uses. Add an explicit guard in `BornNpcsProjection.deriveProfile` that throws if a collision is ever detected.

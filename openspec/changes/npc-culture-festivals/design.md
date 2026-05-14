## Context

Three distinct patterns in the existing runtime can produce cultural events deterministically:
1. `RARE_WINDOW_OPEN` fires every `RARE_WINDOW_PERIOD_TICKS` (10 min) for `windowId='tide_festival'`. Runtime tracks `rareWindowOpen: boolean` as in-memory state. No occurrence counter exists yet.
2. `BUILDING_ENTER` events carry `npcId` + `buildingId`. NPC profiles carry `factionLean`. Building catalog (`catalog.ts`) has `type: 'temple'` but no `tags` field for ritual sites.
3. `SkillXpProjection` tracks `(npcId, skillId) → { level }`. Per-tile skill distribution can be computed from `SimulationRuntime.getNpcSkills()` + NPC location.

`CulturalElementProjection` is the canonical store for all three element types — one projection, three event types, all `rebuildFromEvents`-compliant.

## Goals / Non-Goals

**Goals:**
- `CULTURAL_FESTIVAL_FORMED` emitted after `RARE_WINDOW_OPEN` has occurred ≥ `CULTURAL_FESTIVAL_THRESHOLD` (= 3) times for the same `windowId`. Fires exactly once per festival (idempotent guard in projection).
- `CULTURAL_RITUAL_PERFORMED` emitted when `BUILDING_ENTER` accepted for an NPC whose `factionLean` is in `RITUAL_FACTION_LEANS` (`['monastic', 'temple']`) and the entered building has tag `ritual_site`, while `rareWindowOpen === true`.
- `CULTURAL_NORM_ESTABLISHED` emitted when ≥ `CULTURAL_NORM_NPC_THRESHOLD` (= 3) distinct NPCs on the same tile have `level ≥ 1` in the same skill. Fires at most once per `(tileId, skillId)` pair.
- `CulturalElementProjection` stores all three; `getCulturalElements(tileId)` accessor on `SimulationRuntime`.
- `CULTURAL_FESTIVAL_FORMED` and `CULTURAL_NORM_ESTABLISHED` surface in the chronicle (treated as narration-worthy by `readNarrativeFromAnyEvent`).
- `BuildingDef` gains optional `tags?: readonly string[]`; temple/shrine buildings in catalog get `tags: ['ritual_site']`.

**Non-Goals:**
- Cultural elements do not expire or decay in this slice.
- No player-visible UI panel for cultural elements beyond the chronicle.
- No faction-war consequence from norm/ritual conflict.
- Only `tide_festival` window is wired to festival seeder; other windowIds ignored.

## Decisions

**D1 — Single projection, three event types.**
`CulturalElementProjection` maps `(tileId, elementId)` → row. `elementId` is a stable slug: `festival:tide_festival`, `ritual:<buildingId>:<npcFaction>:<tick_bucket>`, `norm:<tileId>:<skillId>`. Avoids three separate projections.

**D2 — Festival seeder is occurrence-counted, not tick-counted.**
Each `RARE_WINDOW_OPEN` increments a counter in the projection. When counter reaches threshold, seeder emits festival command. Counter stored in projection row with `elementType: 'festival_counter'`; on threshold, row upgrades to `elementType: 'festival'`. No FACT_SET needed.

**D3 — Ritual is per-NPC per-window-opening, not per-building-instance.**
`elementId = ritual:<buildingId>:<npcId>:<openingTick>` — so the same NPC can perform a ritual in subsequent openings. This makes ritual a repeating living act, not a one-time badge.

**D4 — Norm check runs after skill observation seeder, not every tick.**
Norm seeder is called from `runTick` only when new `NPC_OBSERVED_SKILL` events were committed this tick (cheap guard). Avoids O(NPCs × skills) scan every tick.

**D5 — Tags on BuildingDef are optional readonly string[].**
`exactOptionalPropertyTypes` is on: use `tags?: readonly string[]` and conditional spread when constructing. Existing buildings without tags compile unchanged.

**D6 — Chronicle wiring uses existing `readNarrativeFromAnyEvent`.**
The function already picks up `narration` from accepted events. Festival and norm commands include a Chinese `narration` string; they appear in `TimelinePage` automatically.

## Risks / Trade-offs

- **Festival fires once then never again**: By design for this slice — `CulturalElementProjection` idempotency guard prevents re-emission after first `festival` row exists. Future slice can add annual recurrence.
- **Norm may never fire** if population is small or skills are low: acceptable — norms are rare and meaningful. Threshold of 3 NPCs at level ≥ 1 is achievable once mentorship runs for several hundred ticks.
- **Ritual requires rareWindowOpen to be true at moment of BUILDING_ENTER**: NPCs enter buildings routinely during rare windows, so this will fire naturally without scripting.

## Migration Plan

No migration — `CulturalElementProjection.rebuildFromEvents` starts from empty on first boot. Existing EventLog has no `CULTURAL_*` events; projection initialises clean.

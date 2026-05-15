## Why

NPCs today have zero cultural memory — no festivals, no rituals, no inherited norms. Phase 3's DoD requires "at least one regional festival visible in the chronicle" before Phase 3 is complete. This slice ships the `CulturalElement` domain: emergent cultural artifacts that arise from repeated world patterns, not from scripted flags. Three concrete elements close §37.3.

## What Changes

- New command/event: `CULTURAL_FESTIVAL_FORMED` — emitted when the `tide_festival` rare window has recurred ≥ 3 times; the festival is now a named recurring cultural fact on `t_dock`.
- New command/event: `CULTURAL_RITUAL_PERFORMED` — emitted when an NPC with `factionLean` in `['monastic', 'temple']` enters a building tagged as `ritual_site` during an open rare window.
- New command/event: `CULTURAL_NORM_ESTABLISHED` — emitted when 3+ distinct NPCs on the same tile have `level ≥ 1` in the same skill (via `SkillXpProjection`); captures emergent regional specialisation.
- New projection: `CulturalElementProjection` — tracks `(tileId, elementId) → { elementType, formedAtTick, detail }` rows; `rebuildFromEvents` / `canonicalHash` compliant.
- `SimulationRuntime` gains `getCulturalElements(tileId)` accessor.
- Chronicle renderer (`narrativeEngine.ts` / ambient narration) treats `CULTURAL_FESTIVAL_FORMED` and `CULTURAL_NORM_ESTABLISHED` as chronicle-worthy events — they appear in `TimelinePage`.
- Festival seeder fires when `RARE_WINDOW_OPEN` is accepted and occurrence count crosses threshold.
- Ritual seeder fires when `BUILDING_ENTER` is accepted, checks NPC factionLean + building tag + rareWindowOpen.
- Norm seeder fires in the mentorship/skill tick, checks per-tile skill distribution via `SkillXpProjection`.

## Capabilities

### New Capabilities

- `cultural-element`: The `CulturalElementProjection` and its three event types — festival / ritual / norm lifecycle, rebuild-from-events, chronicle surface.
- `cultural-seeders`: Three seeders that detect world-state patterns and emit the corresponding cultural commands.

### Modified Capabilities

- `living-world`: `RARE_WINDOW_OPEN` fan-out extended to include festival seeder. `BUILDING_ENTER` fan-out extended to include ritual seeder.

## Impact

- `packages/server/src/kernel/livingWorldCommands.ts` — 3 new command/event types + validators
- `packages/server/src/projections/culturalElement.ts` — new projection
- `packages/server/src/sim/culturalSeeders.ts` — festival / ritual / norm seeder functions
- `packages/server/src/sim/runtime.ts` — wire seeders, expose `getCulturalElements()`
- `packages/server/src/npcs/profiles/` — tag at least one building as `ritual_site` (building catalog entry)
- `packages/server/src/buildings/catalog.ts` — add `tags?: string[]` field; mark temple/shrine buildings
- No breaking changes to existing events or projections

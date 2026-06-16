## Why

NPC descriptions, animations, and physical presence are three separate systems that currently operate independently — a librarian shows a hammer-swing animation, stands outdoors with no building, and has a generic "working in district" intentLine. Players receive contradictory signals that break world believability. This must be fixed at all three layers simultaneously.

## What Changes

- **A — Activity granularity**: Expand `NpcActivity` from 7 catch-all values to include role-specific types: `read`, `perform`, `craft`, `study`, `pray`, `write`, `guard`; each gets a distinct character animation and emoji glyph
- **B — Schedule targetBuilding**: Add optional `buildingId` field to `ScheduleSlot`; NPC engine places the NPC inside the specified building during that slot instead of floating in the tile
- **C — Missing buildings**: Add `b_central_library` to t_central so the librarian and any NPC with a "library" schedule slot has a physical home; audit other tiles for similar role↔building mismatches and fix them

## Capabilities

### New Capabilities

- `npc-granular-activity`: Extended NpcActivity type with role-specific values, per-activity character animations and emoji glyphs, and schedule-label-to-activity mapping for the new types
- `npc-schedule-building-placement`: ScheduleSlot gains `buildingId?: string`; NPC engine resolves the slot's building and sets `buildingId` on the NPC presence; buildings have a capacity so they don't overflow

### Modified Capabilities

- `living-world`: NPC presence now includes a richer activity type and optional building anchor derived from schedule; API consumers receive the same `activity` and `buildingId` fields but with finer-grained values

## Impact

- `packages/server/src/sim/npcEngine.ts` — NpcActivity type extension, label→activity mapping additions, schedule slot resolution with buildingId
- `packages/server/src/npcs/profiles/*.json` — schedule slots updated with `buildingId` references
- `packages/server/src/buildings/catalog.ts` — add `b_central_library` and any other missing buildings
- `packages/web/src/game/characterAvatar.ts` — new pose/animation for `read`, `perform`, `craft`, `study`, `pray`, `write`, `guard`
- `packages/web/src/game/npcVisuals.ts` — emoji glyph mapping for new activity types
- `packages/web/src/state/types.ts` — NpcActivity type mirror updated
- No breaking API change: `activity` and `buildingId` fields already exist on ServerNpc; values become richer

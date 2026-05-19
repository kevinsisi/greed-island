## Why

Phase E3 gave civilizations livestock and mounts; the ecosystem is now utilitarian. Phase E4 makes the ecosystem *mythic* — rare apex species emerge as world-scale events that shock settlements, drive legendary hunts, and leave permanent marks in the history chronicle. Faction ecological ideology becomes visible behavior. This closes the ecosystem program (E0→E4) and delivers the "civilization trapped inside a living planet" acceptance criterion from WORLD_CAPABILITIES §43.

## What Changes

- **Rare species catalog**: `white_marsh_leviathan` (salt_marsh apex) and `iron_hound` (mountain apex) added to `SPECIES_CATALOG` with `rarity: 'legendary'`, low spawn probability, and elevated threat stats.
- **World event system**: `WORLD_EVENT_SPAWNED` / `WORLD_EVENT_RESOLVED` command/event pair. A world event has a `kind`, `tileId`, `severity`, and `linkedEntityId` (e.g. leviathan's animalId). Runtime emits one when a legendary creature appears; resolves when it dies or migrates away.
- **World event projection**: `WorldEventProjection` — list of active world events; feeds `facts.activeWorldEvents` (already a placeholder in snapshot).
- **Settlement panic response**: when a `WORLD_EVENT_SPAWNED` targets a settlement's tile, that settlement's `civilizationTolerance` check triggers NPC "flee" personality nudges (via `areaSafety` already in `NpcTickContext`).
- **Legendary hunt arc**: a `LEGENDARY_HUNT_STARTED` / `_CONCLUDED` command pair lets the runtime record when hunter NPCs cluster around a legendary creature tile and ultimately kill it. Chronicle narration picks this up as a named arc.
- **Faction ecological ideology**: each of the four factions (`guild`, `tide_hunters`, `free_runners`, `hidden_overseer`) gains an `ecologyStance` field. The runtime cadence block emits faction-specific commands (`FOREST_CLEARCUT_ORDERED`, `FISHING_QUOTA_ENFORCED`, `INDUSTRIAL_SITE_SABOTAGED`, `RITUAL_ECOSYSTEM_MANIPULATION`) based on the faction's stance and current ecosystem state.
- **Chronicle narration**: world-event spawn/resolve + legendary hunt concluded + faction ecology commands get Chinese narration in `chronicleRenderer.ts`.
- **Admin UI**: "神話生態 Mythic Ecology" section showing active world events and faction ecology stances.

## Capabilities

### New Capabilities

- `ecosystem-mythic-ecology`: rare/legendary species spawning, world-event lifecycle, legendary hunt arc, faction ecological ideology commands, settlement panic response.

### Modified Capabilities

- `ecosystem-runtime`: legendary species spawn gating (probability check), world-event projection wiring, faction ecology cadence block.
- `living-world`: four new faction ecology command types added to `LivingWorldCommandPayload` union; `WORLD_EVENT_SPAWNED`, `WORLD_EVENT_RESOLVED`, `LEGENDARY_HUNT_STARTED`, `LEGENDARY_HUNT_CONCLUDED`.
- `event-motivation-chronicle`: new narration entries for world events + legendary hunt + faction ecology actions.

## Impact

- `packages/server/src/ecosystem/species.ts` — add `white_marsh_leviathan`, `iron_hound`; add `rarity: 'legendary'` marker.
- `packages/server/src/kernel/livingWorldCommands.ts` — 8 new command types and payload types.
- `packages/server/src/projections/worldEvent.ts` (new) — `WorldEventProjection`.
- `packages/server/src/ecosystem/legendarySpawnPlanner.ts` (new) — probability-gated spawn for legendary species.
- `packages/server/src/ecosystem/legendaryHuntPlanner.ts` (new) — detect hunter clustering → emit hunt arc events.
- `packages/server/src/ecosystem/factionEcologyPlanner.ts` (new) — per-faction ecology stance → emit faction ecology commands.
- `packages/server/src/sim/runtime.ts` — new projection, boot hydration, fan-out, E4 cadence block.
- `packages/server/src/kernel/chronicleRenderer.ts` — narration for 6+ new event types.
- `packages/web/src/pages/AdminWorldPage.tsx` — "神話生態" section.

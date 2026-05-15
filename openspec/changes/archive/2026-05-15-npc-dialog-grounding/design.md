## Context

`buildSystemPrompt()` in `aiDialog.ts` currently assembles: NPC profile, player message, history block, trust level, and (since Phase 3 Slice 1) active rumors. Nothing prevents the AI model from hallucinating people, species, or places — the prompt has no constraint block and no grounding data beyond the NPC's static profile.

All the necessary data already exists in live projections:
- `SqliteNpcMemoryStore` holds `interact`-type memories that record which NPCs have ever interacted
- `AnimalPopulationProjection` holds per-tile animal counts
- `FisheryDensityProjection` holds per-tile fishery density rows
- `getRecentEvents()` returns the last N non-suppressed narrative events from the EventLog

No new projections, tables, or event types are required.

## Goals / Non-Goals

**Goals:**
- Inject known-person list (NPCs this NPC has met) into AI prompt
- Inject ecological context (animal population + fishery state on tile)
- Inject recent local world events (last 5 narrative events on tile)
- Add strict anti-hallucination constraint block: model MUST NOT reference names or species not in the supplied lists
- All context assembly happens in `npc.ts` (HTTP handler), following the rumor context pattern

**Non-Goals:**
- Faction knowledge (Phase 3.3)
- Household shared economy (Phase 3.4)
- Cross-tile or region-wide ecological awareness (only current tile + immediate neighbors)
- NPC-to-NPC social graph beyond direct interact memory (no transitive friends-of-friends)
- Changing key-pool, fallback, or parse behavior

## Decisions

**D1 — Assemble in HTTP handler, not runtime**
Context assembly happens in `npc.ts`, same as rumor context. The runtime exposes narrow accessor methods (`getAnimalPopulationOnTile`, `getFisheryDensityOnTile`) rather than exposing raw projection internals. This keeps the runtime's public surface minimal and testable.

Alternative considered: assemble in a dedicated `dialogContextBuilder.ts` helper. Rejected — the extra indirection is not yet warranted with only 4–5 context blocks.

**D2 — Known-person graph from NPC memory `interact` rows**
`npcMemoryStore.getMemories(npcId)` already returns all memories for an NPC. Filter `memoryType === 'interact'`, extract `contentJson.otherNpcId`, look up each NPC's display name via `npcProfiles`. Cap at 10 most recent unique names.

Alternative: track a separate `npc_relationships` table. Rejected — the memory store already has this data; a second table adds write-path complexity with no added value at this stage.

**D3 — Ecological context from runtime accessors**
Add two public methods to `SimulationRuntime`:
- `getAnimalPopulationOnTile(tileId: string): Array<{ speciesId: string; count: number }>`
- `getFisheryDensityOnTile(tileId: string): { speciesId: string; density: 'abundant' | 'moderate' | 'scarce' | 'depleted' } | null`

Both delegate to existing private projections; no new projection state.

**D4 — Recent events: filter getRecentEvents() by tile**
`getRecentEvents(limit)` returns EventLog rows sorted by sequence descending. Filter for events whose `payload.data.tileId` matches the NPC's tile and take the first 5. Format as one-line strings. If tileId is absent from payload, skip the event.

**D5 — Anti-hallucination block is a static constraint section in the prompt**
A short block before the conversation history that lists:
- Allowed person names (derived from known-person graph + NPC's own name)
- Allowed species names (derived from ecological awareness block)
- Hard prohibition: model MUST NOT mention any other named person or species

This is prompt-level only — no post-processing validation in this slice.

## Risks / Trade-offs

- **Prompt length growth**: adding 3–4 context blocks increases token usage per dialog call. Mitigation: cap known-person list at 10, ecology rows at 10, events at 5. Monitor via existing AI call logging.
- **Stale ecology data**: projections are rebuilt from EventLog on boot; in a long-running session the data is always current. No risk.
- **Empty known-person graph on fresh NPC**: if an NPC has never interacted, the known-person list is empty and the anti-hallucination block prohibits all person names. This is correct behavior — an isolated NPC shouldn't name anyone.
- **Event filtering by tileId**: not all events carry `tileId` in payload; those are silently skipped. Result: fewer than 5 events is acceptable.

## Migration Plan

Pure additive change to `aiDialog.ts` and `npc.ts`. No data migration, no schema change, no breaking API change. Deploy is a drop-in server image update.

Rollback: revert the two files; behavior degrades to pre-grounding prompt (same as current production).

## Why

NPC AI dialog prompts currently receive no grounded world context: NPCs cannot reference people they have actually met, ecological changes they would plausibly know about, or recent world events — and nothing prevents the model from hallucinating names, species, or places that do not exist in the world. This slice wires up the information that already exists in projections (NPC memory, animal population, fishery density, rumor projection) into the AI prompt, and adds a strict anti-hallucination constraint block.

## What Changes

- **Known-person context block**: query `NpcMemoryStore` for NPCs with whom this NPC has `interact`-type memories; inject a named-person list into the system prompt so the model knows who is "knowable"
- **Anti-hallucination constraint block**: explicit prompt rule — the model must never name a person not in the known-person list, never name a species not in the provided ecology list, and never invent place names outside the tile catalog
- **Ecological awareness block**: pull `animalPopulation` rows for the NPC's current tile + adjacent tiles; pull `fisheryDensity` for the tile; format as human-readable ecology summary ("fog_wolf: 3 on t_forest", "marsh_brine_fish: scarce")
- **Recent world events block**: pull the last N non-suppressed narrative events from the EventLog for the NPC's tile; format as 1-line summaries; cap at 5 items
- **Rumor context** (already shipped in Phase 3 Slice 1) stays as-is; this slice does not change it

## Capabilities

### New Capabilities

- `npc-dialog-grounding`: Structured world-context query layer for NPC AI prompts — known-person graph, ecological awareness, anti-hallucination constraints, recent local events

### Modified Capabilities

- `ai-npc-dialog`: `buildSystemPrompt()` gains new context blocks; `AiDialogContext` gains new optional fields; existing fallback + key-pool behavior is unchanged

## Impact

- `packages/server/src/npcs/aiDialog.ts` — new exported builder functions and extended `AiDialogContext`
- `packages/server/src/http/npc.ts` — query runtime projections and pass grounded context to `generateAiReply()`
- `packages/server/src/sim/runtime.ts` — expose `getAnimalPopulationOnTile(tileId)` and `getFisheryDensityOnTile(tileId)` helpers (or reuse existing snapshot data)
- No new Command/Event types; no schema changes; no new projections required (all data already exists)

## 1. Domain Command Catalog

- [x] 1.1 Define typed payloads for `NPC_MOVE`, `NPC_ACTIVITY_CHANGE`, `NPC_INTERACT`, `AREA_PRESSURE`, `WEATHER_CHANGE`, `SEASON_CHANGE`, `WORLD_EVENT_SPAWN`, `WORLD_EVENT_END`, `BUILDING_ENTER`, `BUILDING_LEAVE`, `RARE_WINDOW_OPEN`, `RARE_WINDOW_CLOSE`, `WORLD_TICK` in `kernel/livingWorldCommands.ts`.
- [x] 1.2 Define matching Event types and a deterministic-key seed for each (command type + actor + payload + tick + ruleset).
- [x] 1.3 Document which actor types may submit each command (`player`, `npc`, `system`).

## 2. Rule Engine Extensions

- [x] 2.1 Extend `KernelRuleEngine.evaluate` to dispatch on registered command types and produce typed Events; keep `SET_FACT` working as a generic projection escape hatch.
- [x] 2.2 Validate each command against `WorldState(t-1)` (e.g. `NPC_MOVE.from` matches the NPC's last known tile).
- [x] 2.3 Reject commands with `INVALID_PAYLOAD` / `INVALID_STATE` instead of mutating WorldState.
- [x] 2.4 Add unit tests for accept and reject paths per command type.

## 3. EventLog as Only Write Path

- [x] 3.1 Refactor `SimulationRuntime.runTick` to collect Commands from NPC engine, area engine, building runtime, world-event engine, and weather/season cycle.
- [x] 3.2 Run all collected Commands through `processCommand` (Rule Engine) before any Event reaches `event_log`.
- [x] 3.3 Remove direct `eventStore.appendEvents` calls from runtime; only `processCommand` writes Events.
- [x] 3.4 Preserve narrative text by attaching it to the typed event payload (no separate `narrative.*` shadow facts).

## 4. WorldState Projector

- [x] 4.1 Extend reducer to project NPC state, area state, building occupants, weather, season, rare window, and active world events from typed events.
- [x] 4.2 Keep `FACT_SET` / `facts` map for backward compatibility and arbitrary system flags.
- [x] 4.3 Add a `LivingWorldProjection` shape that exposes NPC, area, weather, season, building, and event slices in one read.

## 5. NPC Memory Projection

- [x] 5.1 Add SQLite schema `npc_memory` (npc_id, memory_type, content_json, tick, importance) plus indexes by npc_id and tick.
- [x] 5.2 Project memories from `NPC_INTERACT`, `NPC_BUILDING_ENTER`, `AREA_PRESSURE` (witness), and weather/season change events.
- [x] 5.3 Provide `getRecentMemories(npcId, limit)` and `getImportantMemories(npcId, threshold)` reads.
- [x] 5.4 Add tests proving identical EventLog → identical memory rows on replay.

## 6. NPC Relationships Projection

- [x] 6.1 Add SQLite schema `npc_relationships` (npc_a, npc_b, relationship_type, trust 0–100, history_json) with `npc_a < npc_b` canonical ordering.
- [x] 6.2 Project from `NPC_INTERACT`: `chat` raises trust by +1, `argue` lowers it by −2; threshold crosses promote / demote `relationship_type` between `neutral`, `friend`, `rival`.
- [x] 6.3 Provide `getRelationship(npcA, npcB)` and `listRelationshipsFor(npcId)` reads.
- [x] 6.4 Add tests proving identical EventLog → identical relationship rows on replay.

## 7. Emotional Simulation Derivation

- [x] 7.1 Define `EmotionalSnapshot { attachment, tension, trust, loss }` as a pure function over recent memories + relationship rows + current area pressure.
- [x] 7.2 Expose per-NPC emotional snapshot via `runtime.getNpcEmotionalSnapshot(npcId)`.
- [x] 7.3 Add tests proving the snapshot is purely derived (no stored scalar drift).

## 8. Offline Catch-up Summary

- [x] 8.1 Add `summarizeWindow(sinceTick, untilTick)` reading committed events and grouping by area, NPC, and faction.
- [x] 8.2 Expose `/api/world/catch-up?sinceTick=N` returning the deterministic summary plus the latest tick.
- [x] 8.3 Add a unit test that the same EventLog window yields identical summary text.

## 9. Deterministic Replay Validation

- [x] 9.1 Add `kernel/replay.test.ts` that loads a fixture EventLog and asserts identical WorldState, NPC memory, and NPC relationship rows on two independent reductions.
- [x] 9.2 Add explicit assertions that no event outside the EventLog is read during reduction.

## 10. Verification And Handoff

- [x] 10.1 Run `npm run build` and `npm run test` from repo root.
- [x] 10.2 Bump app version to v0.11.0 in `packages/server/src/version.ts`, `packages/server/package.json`, `packages/web/package.json`, and root `package.json`.
- [x] 10.3 Update auto-memory deploy state and commit + push the change.
- [x] 10.4 Rebuild and redeploy the docker-compose stack on the desktop host so the new tables and projections go live.

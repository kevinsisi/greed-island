## Context

NPCs execute productive actions (`ANIMAL_HUNT_RESOLVED`, `FISHERY_HARVESTED`, `BUILDING_CONSTRUCTED`) but the outcomes are never observed or learned from. `LivingWorldRuleEngine` processes all commands; `SimulationRuntime` hosts all projections. The `NpcMemoryStore` already records interaction events as rows with `memoryType = 'interaction'`. The `RumorProjection` is the pattern for a new per-NPC keyed projection.

## Goals / Non-Goals

**Goals:**
- `NPC_OBSERVED_SKILL` command — co-present NPC gains XP toward the skill demonstrated in a productive event.
- `NPC_MENTORSHIP_STARTED` / `NPC_MENTORSHIP_COMPLETED` events — explicit teaching relationship; mentee accumulates XP faster.
- `SkillXpProjection` — persistent `(npcId, skillId) → { xp, level }` map; `rebuildFromEvents` / `project` compliant.
- `SimulationRuntime.getNpcSkills(npcId)` — returns current skill rows for a given NPC.
- `buildSkillBlock()` in `aiDialog.ts` — injects NPC's known skills into system prompt so it can reference them in dialog.
- Observation seeder runs after accepted productive-action events; mentorship engine runs every tick.

**Non-Goals:**
- Skill-based gating of NPC productive actions (post-Phase 3).
- Player-visible skill UI or skill trees.
- Skill decay over time.
- More than 3 canonical skill IDs in this slice (`hunting`, `fishing`, `construction`).

## Decisions

**D1 — Skill IDs are string literals (not enum).**
Rationale: same pattern as `RumorTopic`; the catalog stays in `livingWorldCommands.ts` as a `readonly string[]` constant `SKILL_IDS`. Avoids a new enum file; easy to extend.

**D2 — XP thresholds are constants, not config.**
`SKILL_XP_PER_OBSERVE = 5`, `SKILL_XP_PER_MENTOR_TICK = 8`, `SKILL_XP_LEVEL_THRESHOLD = 100`. Stored in `config/world.ts` alongside rumor constants. Magic-number rule: name the constants.

**D3 — Observation seeder pattern mirrors `rumorSeeder.ts`.**
After `ANIMAL_HUNT_RESOLVED` / `FISHERY_HARVESTED` / `BUILDING_CONSTRUCTED` are accepted, the seeder queries co-present NPCs on the same tile and enqueues `NPC_OBSERVED_SKILL` commands. Max 3 observers per event (avoids tick explosion).

**D4 — Mentorship state lives in the projection, not a separate table.**
Active mentorships are tracked as rows with `level = -1` (sentinel) while XP < threshold, then level-up is emitted once. Alternative considered: a separate `activeMentorships` map. Rejected: doubles state surface. Instead, `NPC_MENTORSHIP_STARTED` creates a row at XP=0 with a `mentorId` field; the engine checks `mentorId !== null` to identify active pairs.

**D5 — `NPC_MENTORSHIP_COMPLETED` is an event (not a command).**
The rule engine emits it deterministically when XP crosses threshold — no external actor triggers it. Matches how `FISHERY_COLLAPSED` is emitted by the rule engine from accumulated state.

**D6 — AI dialog skill block is opt-in via `skillLevels` field.**
Same pattern as `knownPersonNames` in §37.1 — only injected when the field is non-empty. `buildSkillBlock()` returns `[]` when passed `undefined`.

## Risks / Trade-offs

- **Tick load from observation seeder**: Capped at 3 observers per productive event; productive events are rare (not every tick). Acceptable.
- **XP numbers are arbitrary first pass**: `SKILL_XP_LEVEL_THRESHOLD = 100` with 5 XP per observation means ~20 witnessed events per level. Tunable via constants without code change.
- **Mentorship engine may miss pairs if NPC moves away**: No proximity enforcement for ongoing mentorships. Mitigation: mentorship completion is purely XP-driven; spatial separation doesn't cancel it. Simplification is intentional for this slice.

## Migration Plan

No migration needed — `SkillXpProjection.rebuildFromEvents` rebuilds from zero on first boot. Existing EventLog has no `NPC_OBSERVED_SKILL` / `NPC_MENTORSHIP_*` events, so the projection starts empty, which is correct.

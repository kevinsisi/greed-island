## Why

NPCs currently have no mechanism to acquire skills through observation or teaching — every NPC's ability set is static from birth. This closes WORLD_CAPABILITIES.md §37.2: skill lineage is the second pillar of NPC humanity (after rumor propagation and dialog grounding), and is a prerequisite for §37.4's household economy and Phase 4's card-as-rule-operators that reference skill levels.

## What Changes

- New command: `NPC_OBSERVED_SKILL` — NPC witnesses another performing a productive action; gains XP toward that skill.
- New command: `NPC_MENTORSHIP_STARTED` — senior NPC intentionally begins teaching a junior a named skill.
- New event: `NPC_MENTORSHIP_COMPLETED` — emitted when mentee's XP crosses the level-up threshold; grants permanent skill-level increment.
- New projection: `skill_xp` — persists `(npcId, skillId) → { xp, level }` rows; rebuilt from EventLog on restart.
- `SimulationRuntime` gains `getNpcSkills(npcId)` accessor.
- `AiDialogContext` extended with optional `skillLevels` field; `buildSystemPrompt()` injects skill block so NPCs can reference their own expertise.
- Observation seeder fires after accepted productive-action events (`ANIMAL_HUNTED`, `FISH_HARVESTED`, `BUILDING_CONSTRUCTED`) to enqueue `NPC_OBSERVED_SKILL` for co-present NPCs.
- Mentorship engine: each tick, active mentor–mentee pairs emit XP increments and check for completion.

## Capabilities

### New Capabilities

- `npc-skill-xp`: Skill XP and level projection — stores `(npcId, skillId) → { xp, level }`; rebuilt from events; queryable by runtime.
- `npc-skill-observation`: Observation seeder — converts accepted productive events into `NPC_OBSERVED_SKILL` commands for co-present NPCs.
- `npc-mentorship`: Mentorship lifecycle — `NPC_MENTORSHIP_STARTED` / `NPC_MENTORSHIP_COMPLETED` commands/events, tick-driven XP increment, level-up rule.

### Modified Capabilities

- `ai-npc-dialog`: `AiDialogContext` gains optional `skillLevels` field; `buildSystemPrompt()` injects a skill block.

## Impact

- `packages/server/src/sim/runtime.ts` — new accessor `getNpcSkills(npcId)`
- `packages/server/src/sim/livingWorldRuleEngine.ts` — register new command/event validators
- `packages/server/src/projections/skillXp.ts` — new projection file
- `packages/server/src/sim/skillObservationSeeder.ts` — new seeder
- `packages/server/src/sim/mentorshipEngine.ts` — new tick-driven engine
- `packages/server/src/npcs/aiDialog.ts` — new `buildSkillBlock()` + context wiring
- `packages/server/src/http/npc.ts` — assemble `skillLevels` before calling `generateAiReply`
- No breaking changes to existing events or projections

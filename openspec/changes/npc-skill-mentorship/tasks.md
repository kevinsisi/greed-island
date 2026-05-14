## 1. Constants & Command Types

- [x] 1.1 Add `SKILL_IDS`, `SKILL_XP_PER_OBSERVE`, `SKILL_XP_PER_MENTOR_TICK`, `SKILL_XP_LEVEL_THRESHOLD` to `config/world.ts`
- [x] 1.2 Add `NPC_OBSERVED_SKILL`, `NPC_MENTORSHIP_STARTED`, `NPC_MENTORSHIP_COMPLETED` to command/event union types in `livingWorldCommands.ts`
- [x] 1.3 Add payload type definitions and validators for all three new command/event types in `livingWorldCommands.ts`
- [x] 1.4 Register the three new validators in `LivingWorldRuleEngine`

## 2. SkillXpProjection

- [x] 2.1 Create `packages/server/src/projections/skillXp.ts` with `SkillXpRow` type and `SkillXpProjection` class
- [x] 2.2 Implement `project(event)` — handle `NPC_OBSERVED_SKILL` (add XP, level up when threshold crossed), `NPC_MENTORSHIP_STARTED` (set `mentorId`), `NPC_MENTORSHIP_COMPLETED` (clear `mentorId`, increment level)
- [x] 2.3 Implement `rebuildFromEvents(events)` and `canonicalHash()` on `SkillXpProjection`
- [x] 2.4 Add `getByNpc(npcId)` and `getAll()` accessors on `SkillXpProjection`

## 3. SimulationRuntime Integration

- [x] 3.1 Instantiate `SkillXpProjection` in `SimulationRuntime` constructor and hydrate in `rebuildProjections()`
- [x] 3.2 Wire `skillXpProjection.project(event)` into the fan-out loop in `runTick`
- [x] 3.3 Add `getNpcSkills(npcId): Array<{ skillId: string; xp: number; level: number }>` public method to `SimulationRuntime`

## 4. Observation Seeder

- [x] 4.1 Create `packages/server/src/sim/skillObservationSeeder.ts` — `planSkillObservations(event, runtime): NpcObservedSkillCommand[]`
- [x] 4.2 Map `ANIMAL_HUNT_RESOLVED → 'hunting'`, `FISHERY_HARVESTED → 'fishing'`, `BUILDING_CONSTRUCTED → 'construction'`; cap observers at 3; exclude actor NPC
- [x] 4.3 Call seeder in `LivingWorldRuleEngine` after each accepted productive event and enqueue resulting commands

## 5. Mentorship Engine

- [x] 5.1 Create `packages/server/src/sim/mentorshipEngine.ts` — `planMentorshipTick(runtime, tick): Command[]`
- [x] 5.2 Implement: for each active mentorship row, emit `NPC_OBSERVED_SKILL` with `SKILL_XP_PER_MENTOR_TICK`; when projected XP would reach threshold, emit `NPC_MENTORSHIP_COMPLETED` instead
- [x] 5.3 Call `mentorshipEngine.planMentorshipTick` in `runTick` fan-out and enqueue returned commands

## 6. AI Dialog Integration

- [x] 6.1 Add `skillLevels?: readonly { skillId: string; level: number }[]` to `AiDialogContext` in `aiDialog.ts`
- [x] 6.2 Implement and export `buildSkillBlock(skills: readonly { skillId: string; level: number }[] | undefined): string[]`
- [x] 6.3 Wire `buildSkillBlock` into `buildSystemPrompt()` — inject before history section
- [x] 6.4 In `npc.ts` handler, call `getNpcSkills(npcId)`, map to `{ skillId, level }`, set `skillLevels` on `dialogCtx` when non-empty

## 7. Tests

- [x] 7.1 Add unit tests for `SkillXpProjection` — XP accumulation, level-up, `rebuildFromEvents` idempotency, `mentorId` lifecycle
- [x] 7.2 Add unit tests for `skillObservationSeeder` — correct skill mapping, actor exclusion, 3-observer cap
- [x] 7.3 Add unit tests for `mentorshipEngine` — XP increment per tick, completion threshold, `NPC_MENTORSHIP_COMPLETED` emission
- [x] 7.4 Add unit tests for `buildSkillBlock` — populated list, undefined input, level display

## 8. Validation & Cleanup

- [x] 8.1 Run `npm run build:server` — confirm zero TypeScript errors
- [x] 8.2 Run `npm test` — confirm all tests pass
- [x] 8.3 Run `npx openspec validate --all --strict` — confirm all specs pass
- [x] 8.4 Update `PROGRESS.md` and `ROADMAP.md` with Phase 3 §37.2 completion

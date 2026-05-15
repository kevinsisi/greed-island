# Tasks — NPC Defense Coordination (Sprint 2C)

## 1. Command catalog

- [x] 1.1 Add `'NPC_DEFENSE_PARTY_FORMED'` to
  `LIVING_WORLD_COMMAND_TYPES` in
  `packages/server/src/kernel/livingWorldCommands.ts`.
- [x] 1.2 Define `NpcDefensePartyFormedCmd` payload type:
  `{ partyId, targetAnimalId, targetSpeciesId, tileId, victimNpcId,
  memberNpcIds: readonly string[], reactionToAttackId, formedAtTick,
  motivation?, narration }`.
- [x] 1.3 Add `VALIDATORS` entry (non-empty ids, `memberNpcIds.length
  >= 2`, integer `formedAtTick >= 0`).
- [x] 1.4 Add union variant.

## 2. Constants

- [x] 2.1 Add `DEFENSE_REACTION_WINDOW_TICKS = 2` and
  `DEFENSE_PARTY_MIN_MEMBERS = 2` to `packages/server/src/config/world.ts`.

## 3. Pure planner

- [x] 3.1 Create `packages/server/src/ecosystem/defenseParty.ts`
  exporting `planDefenseParty(input)`.
- [x] 3.2 Input: `{ tick, recentAttacks, animalPopulation, npcsByTile,
  priorPartyAttackIds: Set<string> }`. Output:
  `DefensePartyPlan[]` (zero or more plans).
- [x] 3.3 Each plan picks the lex-min member as the hunt leader and
  records the full ordered member list.
- [x] 3.4 Unit tests: no attack in window, only victim on tile,
  attacker dead, idempotency guard.

## 4. Runtime integration

- [x] 4.1 After the predation step in `runtime.ts`, walk
  `getRecentEvents(DEFENSE_REACTION_WINDOW_TICKS + 1)` for
  `ANIMAL_ATTACKED_NPC` and `NPC_DEFENSE_PARTY_FORMED` events.
- [x] 4.2 Call `planDefenseParty` and push each plan as
  `NPC_DEFENSE_PARTY_FORMED` followed by a coordinated
  `ANIMAL_HUNT_STARTED` / `ANIMAL_HUNT_RESOLVED` (success) /
  `ANIMAL_KILLED` / `CARCASS_CREATED` chain.
- [x] 4.3 The party hunt MUST NOT trigger retaliation (skip the
  retaliation planner for these hunts).
- [x] 4.4 Each new event sets `motivation.projectPurpose = 'defense'`.

## 5. Narrative

- [x] 5.1 `NPC_DEFENSE_PARTY_FORMED` surfaces to `/api/events`
  (not added to the suppression list — players should see the rally).

## 6. Documentation + version

- [x] 6.1 Bump versions to `0.21.0`.
- [x] 6.2 Update `ROADMAP.md` and `PROGRESS.md`.

## 7. Verification gate

- [x] 7.1 `npm run build:server` clean.
- [x] 7.2 `npm run build:web` clean.
- [x] 7.3 `npm test` (server + web) passes.
- [x] 7.4 `npx openspec validate npc-defense-coordination --strict` passes.
- [x] 7.5 `npx openspec validate --all --strict` passes.

## 8. Commit / push / CI / archive

- [x] 8.1 Single commit `feat(civ): Sprint 2C — NPC defense coordination`.
- [x] 8.2 Push; watch CI + Deploy Dev to success.
- [x] 8.3 Sync deltas into main specs; archive change folder.

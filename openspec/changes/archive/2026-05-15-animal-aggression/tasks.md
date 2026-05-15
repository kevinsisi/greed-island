# Tasks — Animal Aggression (Sprint 2B)

## 1. Command catalog

- [x] 1.1 Add `'ANIMAL_TARGETED_NPC'`, `'ANIMAL_ATTACKED_NPC'`,
  `'ANIMAL_FLED'`, `'ANIMAL_RETALIATED'` to `LIVING_WORLD_COMMAND_TYPES`
  in `packages/server/src/kernel/livingWorldCommands.ts`.
- [x] 1.2 Define `AnimalTargetedNpcCmd`, `AnimalAttackedNpcCmd`,
  `AnimalFledCmd`, `AnimalRetaliatedCmd` payload types and add them
  to the `LivingWorldCommand` union.
- [x] 1.3 Add `VALIDATORS` entries for all four commands.
- [x] 1.4 Unit-test validators with valid + invalid payload variants.

## 2. Pure planners

- [x] 2.1 Create `packages/server/src/ecosystem/aggression.ts` exporting
  `planAnimalAggression(input)` and `planAnimalRetaliation(input)`.
- [x] 2.2 Aggression planner accepts `{ tick, predatorRow (animal),
  npcsOnTile, predatorHungerRow, species, hashSeed }` and returns
  `AnimalAggressionPlan | null`.
- [x] 2.3 Retaliation planner accepts the in-flight hunt plan and
  `species` and returns `AnimalRetaliationPlan | null`.
- [x] 2.4 Deterministic identifiers via `hashSeed` (`attackId`,
  `retaliationId`, `fleeRouteId`).
- [x] 2.5 Unit tests: empty inputs, deterministic target pick across
  multiple NPCs, replay equivalence.

## 3. Runtime integration

- [x] 3.1 In `runtime.ts`, after `planPredation` returns `'starvation'`,
  look up NPCs present on the tile via NPC state projection.
- [x] 3.2 If NPCs present and `species.aggression > 0`, invoke
  `planAnimalAggression` and push the aggression chain instead of the
  starvation chain.
- [x] 3.3 In the simple hunt path, after each accepted
  `ANIMAL_HUNT_STARTED`, invoke `planAnimalRetaliation` and push
  `ANIMAL_RETALIATED` before `ANIMAL_HUNT_RESOLVED`.
- [x] 3.4 NPC damage is applied by emitting an `NPC_STATE_RECORDED`
  with the existing NpcStateProjection contract and clamped mood +
  health (>= 0).
- [x] 3.5 Animal flee is emitted only when the predator's `species.fear
  / 100` rolls above a deterministic threshold; destination is a random
  adjacent tile from `MAP_ADJACENCY` (deterministic via `hashSeed`).

## 4. Narrative / chronicle

- [x] 4.1 Each new event type produces a narration line in the
  chronicle renderer so `/api/events` shows the attack to the player.
- [x] 4.2 Routine `ANIMAL_TARGETED_NPC` is suppressed from the chronicle
  (it is internal intent); only `ANIMAL_ATTACKED_NPC`, `ANIMAL_FLED`,
  and `ANIMAL_RETALIATED` surface to the public stream.

## 5. Determinism + replay

- [x] 5.1 Replay test rebuilds aggression + retaliation events from the
  same EventLog and confirms the `NpcStateProjection` canonical hash.
- [x] 5.2 No new server state — planners are pure; injuries flow
  through the existing NpcStateProjection.

## 6. Web (lightweight)

- [x] 6.1 No new Phaser VFX this slice. Chronicle / timeline already
  consumes typed events, so attacks appear in the existing event feed.
- [x] 6.2 `AdminWorldPage` (optional): brief mention of new event types
  in the README/help row.

## 7. Documentation + version

- [x] 7.1 Bump `packages/{server,web}/src/version.ts` to `0.20.0`.
- [x] 7.2 Bump root + workspace `package.json` versions to `0.20.0`.
- [x] 7.3 Update `ROADMAP.md` with a v0.20.0 in-progress block.
- [x] 7.4 Update `PROGRESS.md` with the implementation entry and
  verification + CI/Deploy evidence.

## 8. Verification gate

- [x] 8.1 `npm run build:server` clean.
- [x] 8.2 `npm run build:web` clean.
- [x] 8.3 `npm test` (server + web) passes.
- [x] 8.4 `npx openspec validate animal-aggression --strict` passes.
- [x] 8.5 `npx openspec validate --all --strict` passes.

## 9. Commit / push / CI / archive

- [x] 9.1 Commit titled `feat(eco): Sprint 2B — animal aggression
  (hungry predator attacks NPC, retaliation, flee)`.
- [x] 9.2 Push to `main`; watch CI + Deploy Dev to success.
- [x] 9.3 Sync delta specs into main capability specs, then archive
  the change folder.

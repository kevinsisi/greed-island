## Why

`v0.87.0` shipped `NPC_MATURED` so born children become real runtime NPCs (closing §43.1 verification path), but matured NPCs start life with `civic.gold = 0` and every `skillXp` key = 0. They get no seed wealth and no transmitted skill from the parents who raised them. This violates `docs/WORLD_CAPABILITIES.md §37.4` "Household shared economy" intent — households are supposed to pool resources and pass them on, but currently a matured child is economically indistinguishable from a freshly-spawned config NPC.

Two visible consequences:

- A wealthy carrier-NPC dies; their matured child inherits *nothing* even though the household pool documented in `household-shared-economy` exists as substrate.
- Phase 3 §37.4 calls out "Inheritance on `NPC_DECEASED`" as a done item, but the matching event `HOUSEHOLD_INHERITANCE_ASSIGNED` is declared substrate that "this slice MUST NOT require to generate `NPC_DECEASED` events". Nothing in the runtime ever emits it. Phase D in v0.87.0 PROGRESS.md explicitly flagged this as deferred.

This change closes Phase D by adding inheritance at the **maturation moment** (when a child becomes a runtime entity), grounded in parent state at that tick. Existing `HOUSEHOLD_INHERITANCE_ASSIGNED` substrate is reserved for its declared spouse-on-death semantics; we add a sibling event for child-on-maturation so chronicle can narrate the two arcs distinctly.

## What Changes

- New command + event type **`NPC_INHERITANCE_GRANTED`** in `kernel/livingWorldCommands.ts` with payload `{ npcId, parentNpcIds, householdId, gold, skillXp: { construction, knowledge, commerce, civic }, grantedAtTick, narration }` and a validator. Reasons it cannot reuse `HOUSEHOLD_INHERITANCE_ASSIGNED`: required `deceasedNpcId` does not exist at maturation time (parents may both be alive), and the projection target is per-NPC civic record, not household pool.
- New pure planner **`planMaturationInheritance(maturationIntent, civicProjection, mortalityProjection)`** in `packages/server/src/sim/maturationInheritancePlanner.ts`. Reads each parent's last-known `NpcCivicRecord` (alive-or-deceased) and computes the child's seed deterministically: `gold = floor(meanParentGold * INHERITANCE_GOLD_FRACTION)`; `skillXp[domain] = floor(meanParentSkill[domain] * INHERITANCE_SKILL_FRACTION)`. Returns `null` if both parents lack civic records (no economic substrate to inherit from — child starts at zero, as today).
- New tunables in `config/world.ts`: `INHERITANCE_GOLD_FRACTION = 0.25`, `INHERITANCE_SKILL_FRACTION = 0.10`. Chosen to be visible (matured child enters with a fair starting purse and a small head-start in every domain their parents practiced) without trivializing the productive earning loop.
- Runtime wiring: in `runtime.ts`, when a `MaturationIntent` is converted to `NPC_MATURED`, the same tick also emits one `NPC_INHERITANCE_GRANTED` per matured NPC, **after** the `NPC_MATURED` event so the child's profile exists before their civic record is seeded.
- `npcCivicRecords` initialization path in `cityLife.ts` learns to accept an inheritance seed instead of always calling `createNpcCivicRecord(npcId)` with zeros. This is a new event-sourced state mutation, validated through the rule engine like every other state change.
- Admin `/api/admin/npc-stats` includes a new `inheritedRecent` block (last 10 inheritance events with parent ids, gold, skillXp totals) so the GM can verify the loop visually.
- Replay/boot path adds `NPC_INHERITANCE_GRANTED` to the relevant boot event lists so canonical-hash rebuild still matches.

## Capabilities

### New Capabilities
- `matured-child-inheritance`: requirements for `NPC_INHERITANCE_GRANTED` event-sourcing, the maturation-time inheritance planner, deterministic gold + skill seeding from parents (including handling of one-deceased-one-alive parent split), tick-pairing with `NPC_MATURED`, and projection-side updates to `NpcCivicRecord`.

### Modified Capabilities
- _None._ `npc-lineage` covers death-time heir selection (`NPC_DECEASED` → `HOUSEHOLD_INHERITANCE_ASSIGNED` with `amount: 0`); this change adds a complementary moment (`NPC_MATURED` → `NPC_INHERITANCE_GRANTED`) without changing existing death-time behavior.

## Impact

- **Code**:
  - `packages/server/src/kernel/livingWorldCommands.ts` — new command type + payload + validator.
  - `packages/server/src/sim/maturationInheritancePlanner.ts` — new file.
  - `packages/server/src/sim/runtime.ts` — wire the planner into the existing maturation block; project `NPC_INHERITANCE_GRANTED` into `lifeExpansion.npcCivicRecords`.
  - `packages/server/src/sim/cityLife.ts` — extend `lifeExpansion` mutation path; new seed function `seedInheritedCivicRecord`.
  - `packages/server/src/config/world.ts` — two named constants (no magic numbers per CLAUDE.md global rule).
  - `packages/server/src/http/adminNpcsRouter.ts` — new `inheritedRecent` field in npc-stats response.
  - `packages/web/src/admin/...` — surface the new field if the existing matured panel is the right place.
- **Tests**: new planner unit tests (deterministic gold/skill math under all parent-state combinations); rule engine validator test for the new event; projection test that the civic record reflects the seed; replay/boot canonical-hash test that adds the new event type to the included set.
- **Existing data / replay**: backwards compatible. The new event type is additive; existing event logs replay identically (no synthetic backfill — old matured NPCs remain at zero, consistent with how they actually lived). No DB schema change.
- **AI dialog**: matured NPCs gain non-zero civic state, which already feeds into existing AI dialog context (no new injection needed).
- **Live deployment**: live world at tick ~340k has not yet observed a natural NPC death after maturation, so inherited gold from deceased parents will be the rare branch in production for some time. The alive-parent path is the common branch on day-one and produces visible behavior.

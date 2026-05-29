## Context

Greed Island simulation strictly separates **Commands** (intent), the **Rule Engine** (validator/compiler), and **Events** (deterministic, replayable facts). Projections rebuild WorldState from EventLog. The matured-child inheritance feature has to fit this triangle — there is no path where a planner directly mutates `lifeExpansion.npcCivicRecords`.

Current state at v0.87.2:
- `MaturationPlanner.planMaturation` returns `MaturationIntent[]`; runtime converts each into a single `NPC_MATURED` event.
- `BornNpcsProjection.project(NPC_MATURED)` synthesizes an `NpcProfile`.
- `NpcEngine.registerDynamicNpc(profile)` admits the profile into cognition runtime.
- `lifeExpansion.npcCivicRecords[npcId]` is created lazily by `cityLife.ts` on first productive action via `createNpcCivicRecord(npcId)` returning `{ gold: 0, skillXp: { ...all zeros }, lastProductiveTick: null }`. Matured NPCs hit this cold path.
- `HOUSEHOLD_INHERITANCE_ASSIGNED` substrate exists in `kernel/livingWorldCommands.ts`, `projections/householdEconomy.ts`, and `openspec/specs/household-shared-economy/spec.md`. Its payload requires `deceasedNpcId`, so it cannot model maturation with both parents alive without semantic abuse.
- Parents may be alive, both deceased, or mixed at maturation. `MaturationPlanner` now still matures children whose parents are both deceased because `NPC_CHILD_BORN` is already canonical EventLog state; inheritance planning should read last-known parent civic records when available and return `null` when no parent record exists.

## Goals / Non-Goals

**Goals:**
- Matured NPCs enter the world with non-zero `gold` and small `skillXp` head-starts derived deterministically from parents at maturation tick.
- Every state change goes through `Command → Rule Engine → Event → Projection`. No direct projection mutation.
- Replay-safe: the same EventLog produces the same `npcCivicRecords`. Canonical hash stable.
- Backwards compatible: existing matured NPCs (pre-deploy) stay at zero. No retro-active backfill.
- Chronicle (Layer 5 AI narration) can distinguish "child grew up and inherited from parents" vs "spouse died and partner inherited household pool".

**Non-Goals:**
- _Not_ reusing `HOUSEHOLD_INHERITANCE_ASSIGNED` — wrong shape (requires `deceasedNpcId`) and conflates two arcs.
- _Not_ reducing parent civic state. Parents do not "lose gold" when child matures; the inheritance is a deterministic seed computed from their state at that tick, not a transfer. (Real estate planning is not what this models — this models "what you learned from your parents".)
- _Not_ implementing economic inheritance on `NPC_DECEASED` — that is the separate spec deferred under `npc-lineage`. This change closes only the maturation moment.
- _Not_ inheriting relationship dimensions, memory, or alias state. Those layers stay fresh at maturation (the child has had no first-person experience yet).
- _Not_ introducing per-NPC inventory or goods inheritance. Out of scope; goods are settlement-level in v0.87.x.

## Decisions

### Decision 1 — New event type `NPC_INHERITANCE_GRANTED` instead of reusing `HOUSEHOLD_INHERITANCE_ASSIGNED`

Reasons:
- The existing event's validator requires `deceasedNpcId`; at maturation both parents may be alive. Forcing a synthetic deceased id would corrupt downstream consumers (chronicleRenderer, householdEconomy projection).
- Projection target differs: `HOUSEHOLD_INHERITANCE_ASSIGNED` updates `HouseholdEconomyProjection.inheritances` (household-pool view); `NPC_INHERITANCE_GRANTED` updates `lifeExpansion.npcCivicRecords` (per-NPC civic view).
- Chronicle arcs become distinct: spouse-death-inheritance vs growing-up-inheritance, two stories.

**Alternatives considered:**
- _Reuse with `deceasedNpcId = ''_`: rejected — breaks existing validator and every downstream consumer that assumes non-empty.
- _Sub-type field on the existing event_: rejected — adds polymorphism noise to a working event, and the projection consumers would still need to branch by sub-type.

### Decision 2 — Inheritance at maturation tick, not at parent-death tick

A child's seed is computed and emitted in the **same tick block** as their `NPC_MATURED`. This avoids a deferred-grant state that would have to live in some "pending inheritance" projection if we computed it earlier.

The alternative — "when a parent dies, grant inheritance to each currently-existing matured child" — was rejected because:
- Pre-maturation children are not runtime entities, so the moment of grant is naturally maturation.
- Deferred grants would need their own projection + boot hydration just to track unrealized inheritance.

### Decision 3 — Inheritance is a **seed**, not a **transfer**

Computed deterministically from parental civic state at maturation tick:

```
mean_gold      = mean(parent.gold for parent in parents_with_civic_record)
mean_skill[k]  = mean(parent.skillXp[k] for parent in parents_with_civic_record), per k
child.gold     = floor(mean_gold  * INHERITANCE_GOLD_FRACTION)   // 0.25
child.skillXp[k] = floor(mean_skill[k] * INHERITANCE_SKILL_FRACTION) // 0.10
```

If `parents_with_civic_record` is empty (both parents never had any productive event), planner emits no `NPC_INHERITANCE_GRANTED` — child starts at zero, consistent with today's behavior.

Parents are unaffected. This is "what your parents taught you / what you grew up with"; their accumulated state remains intact.

**Alternatives considered:**
- _Split parent gold among children_: rejected — household pool semantics already in `household-shared-economy`; conflating it here would double-bookkeep gold.
- _Inherit at maturation `INHERITANCE_GOLD_FRACTION = 1.0`_: rejected — kills the productive earning loop.

### Decision 4 — Constants live in `config/world.ts`, not magic numbers in the planner

Per CLAUDE.md global rule "Avoid magic numbers in implementation". Two named exports:

```typescript
export const INHERITANCE_GOLD_FRACTION = 0.25
export const INHERITANCE_SKILL_FRACTION = 0.10
```

The 0.25 / 0.10 values are first-iteration; PR description should call them out for live tuning.

### Decision 5 — Projection side-effect: extend `lifeExpansion.npcCivicRecords` seed path

`cityLife.ts` currently lazily creates `NpcCivicRecord` on first productive event. To absorb `NPC_INHERITANCE_GRANTED`:

- Add `seedNpcCivicRecord(state, { npcId, gold, skillXp, tick })` in `cityLife.ts` that returns a new `LifeExpansionState` with the seeded record. If a record already exists for `npcId`, throw — inheritance is one-shot at maturation, double-grant is a bug.
- Add `applyInheritanceGranted(state, event)` in `runtime.ts`'s event-projection block (alongside other `lifeExpansion` mutations) that pulls payload data and calls `seedNpcCivicRecord`.
- Add `NPC_INHERITANCE_GRANTED` to whichever boot-event-types list is used for `lifeExpansion` rebuild — discover at implementation time.

### Decision 6 — Tick-pair semantics: NPC_MATURED **before** NPC_INHERITANCE_GRANTED in same tick

The matured profile must exist in `BornNpcsProjection` and `NpcEngine` before any consumer reads inheritance, otherwise replay races. Runtime emits the pair in this strict order:

1. Build `MaturationIntent` from planner.
2. Build the `NPC_MATURED` event (sequence N).
3. Build the `NPC_INHERITANCE_GRANTED` event (sequence N+1) referencing the just-created npcId.
4. Both go through the rule engine in the same tick block.

A rule-engine guard MUST verify that `NPC_INHERITANCE_GRANTED.npcId` corresponds to an `NPC_MATURED` event at the same tick (cross-event correlation similar to `pendingCombatInitiates` used for combat_outcome arc). The simplest implementation: `BornNpcsProjection` exposes `wasMaturedAtTick(npcId, tick): boolean`, the validator calls it.

### Decision 7 — Admin visibility

Add `inheritedRecent: { npcId, parentNpcIds, gold, skillXpTotal, grantedAtTick }[]` (last 10, newest first) to `/api/admin/npc-stats` response. Admin matured panel surfaces it. This is the **only** way the GM verifies the loop visually before live combat/death produces deceased-parent inheritances.

## Risks / Trade-offs

- **[Risk]** Parent civic record may be zero/empty at maturation because parents themselves never had productive events. → Mitigation: planner returns null for that branch; chronicle has nothing to narrate; child starts at zero like before. No new failure mode.

- **[Risk]** Cross-event correlation `NPC_MATURED ↔ NPC_INHERITANCE_GRANTED` introduces a new ordering invariant that boot replay must respect. → Mitigation: write a replay test that constructs an event log with these two events at the same tick in correct order, rebuilds, and asserts the civic record matches. Add the new event types to the existing `BORN_NPC_BOOT_EVENT_TYPES` and `lifeExpansion` boot lists.

- **[Risk]** Tuning constants 0.25 / 0.10 may produce visibly imbalanced economies once enough matured NPCs exist. → Mitigation: values live in `config/world.ts`, hot-tunable in a follow-up patch. PR description and ROADMAP entry call out the live-tuning expectation.

- **[Risk]** `floor()` of small means can produce 0 for low-economy parents, making the feature invisible early. → Trade-off accepted: low-economy parents semantically produce low-economy descendants; that is the right story.

- **[Risk]** `mean(parent_state)` treats one-alive-one-deceased identically to two-alive. → Trade-off accepted: the deceased parent's last-known state is still part of the inheritance story. If this proves wrong at live observation, the planner is the single place to change the rule.

## Migration Plan

- No data migration. New event types are additive.
- Replay of existing event logs is identical to today (the new event types never appear in old logs).
- Deploy via the standard CI/CD path. Verification: hit `/api/admin/sim/advance { ticks: 50000 }` twice, then check `/api/admin/npc-stats.inheritedRecent` — should be non-empty if any households formed and matured during the advance window.
- Rollback: revert the commits; event log retains the inheritance events but no projection consumes them — `NpcCivicRecord` paths fall back to the lazy zero default. Acceptable degraded state.

## Open Questions

- _Should `NPC_INHERITANCE_GRANTED` also seed `npc_memory` with a "parent legacy" entry?_ Decision deferred: the change keeps the event narrow (civic record only). A follow-up memory-injection slice can subscribe to the same event later without re-emitting it.
- _Should the planner also fire for matured NPCs whose maturation pre-dates this deploy?_ Decision: no. Backfilling synthetic inheritance events on an old log violates the "EventLog is the only truth source" law. Pre-deploy matured NPCs remain at zero — their story is they grew up without a documented inheritance.

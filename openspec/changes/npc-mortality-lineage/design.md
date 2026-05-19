## Context

NPCs currently live forever. The world has a `HOUSEHOLD_INHERITANCE_ASSIGNED` command type and its payload/validator already exist in `livingWorldCommands.ts`, and `HouseholdEconomyProjection` already handles it — but no code ever emits it because there is no death trigger. This change wires the death → inheritance pipeline end-to-end.

**Tick rate:** 5s/tick → 12 ticks/min → 720/hr → 17,280/day. Current world is at ~tick 25,000+.

**Existing NPCs have no `bornAtTick`**: profiles are loaded from JSON files; none have this field. All must default to `bornAtTick: 0` at runtime. With a base lifespan of 120,960 ticks (1 real week ≈ 7 days), existing NPCs would be ≈21% through their lifespan at tick 25,000 — no immediate mass die-off.

## Goals / Non-Goals

**Goals:**
- `NPC_DECEASED` enters the canonical EventLog when an NPC's age exceeds their lifespan
- `HOUSEHOLD_INHERITANCE_ASSIGNED` is emitted in the same tick, transferring household assets to the oldest surviving household member (the heir)
- `NPC_HEIR_ASSIGNED` is emitted to record the heir's new role in the household
- `NpcMortalityProjection` tracks who is alive/dead so the planner skips already-deceased NPCs
- `NpcLineageProjection` tracks household membership and parent-child relationships for heir selection
- AI dialog grounding: `NPC_DECEASED` events flow into NPC memory so living NPCs can say "老漁夫曾教過我…" without hallucination
- Chronicle narration for both new event types

**Non-Goals:**
- Player-triggered NPC death from combat (Phase D)
- NPC reproduction / spawning new NPC profiles (profiles are static JSON; this release handles death of existing NPCs only)
- Grief/emotional NPC state changes
- UI changes (death events surface through existing chronicle; no new panel needed)

## Decisions

**D1: Age-based deterministic lifespan**

`lifespanTicks = NPC_BASE_LIFESPAN_TICKS + deterministicVariance(npcId)`

Where `deterministicVariance` uses `hashInt(npcId) % NPC_LIFESPAN_VARIANCE_TICKS` so each NPC has a fixed, replay-safe lifespan. No randomness.

Constants:
- `NPC_BASE_LIFESPAN_TICKS = 120_960` (1 real week)
- `NPC_LIFESPAN_VARIANCE_TICKS = 60_480` (±3.5 days variance)
- Effective range: 1 week → 2.5 weeks per NPC

**D2: bornAtTick in runtime state, not NPC profile JSON**

`NpcProfile` JSON files are static and checked in. Adding `bornAtTick` to profiles would require editing all JSON files. Instead, the mortality planner derives `bornAtTick` from `NpcMortalityProjection`: it defaults to `0` for NPCs that have no `NPC_BORN` event in the EventLog. Only newly-born NPCs (future reproduction feature) would have a real `bornAtTick`. This keeps profiles unchanged.

**D3: Mortality planner runs on MORTALITY_CADENCE_TICKS**

A new cadence constant (e.g. `MORTALITY_CADENCE_TICKS = TICKS_PER_HOUR`) prevents checking all NPCs every tick. At each cadence, iterate all living NPCs: if `currentTick - effectiveBornAtTick >= lifespanTicks(npcId)`, emit `NPC_DECEASED`.

**D4: Heir = oldest living household member**

Household membership comes from `NpcProfile.householdId` (new optional field, defaulting to `npcId` itself as a solo household). Heir selection: filter living NPCs with same `householdId`, sort by `effectiveBornAtTick` ascending (oldest first), pick first. If no heir exists, `HOUSEHOLD_INHERITANCE_ASSIGNED` is still emitted with `heirId = ''` (empty household dissolution case).

**D5: NpcMortalityProjection replays from EventLog**

Projects `NPC_DECEASED` events into `Map<npcId, deceasedAtTick>`. At boot, the large-log path uses selective read (add `NPC_DECEASED` to `MORTALITY_BOOT_EVENT_TYPES`). The planner skips any NPC in this map.

**D6: AI grounding via existing NPC memory consultsEventTypes**

`NpcProfile.memoryReferences.consultsEventTypes` already filters which event types flow into AI dialog context. Add `NPC_DECEASED` and `NPC_HEIR_ASSIGNED` to the global consults list in `aiSnapshot.ts` so surviving NPCs can reference deceased household members in grounded dialog.

## Risks / Trade-offs

**Risk: Mass die-off on first deploy**

If many NPCs hit their lifespan simultaneously on the first tick after deploy (e.g. all default to `bornAtTick: 0` and lifespan < currentTick), the rule engine would receive hundreds of `NPC_DECEASED` commands in one tick and likely hit the hard cap. Mitigation: base lifespan (120,960) >> current tick (~25,000), so no existing NPC dies immediately. The variance spreads future deaths across weeks.

**Risk: Deceased NPCs appearing in existing UI**

The snapshot still includes deceased NPC profiles in `npcs[]`. Post-death, their presence should change to `activity: 'deceased'` or they should be filtered out. Decision: add `deceased: true` flag to NPC state snapshot; frontend filters them from interactive lists but they remain visible in chronicle. Keeps replay clean.

**Trade-off: households default to solo**

NPCs without `householdId` in their profile default to a solo household (`householdId = npcId`). Inheritance has no heir → emits `HOUSEHOLD_INHERITANCE_ASSIGNED` with `amount: 0, heirId: ''`. This is benign — the projection handles it as a no-op. Proper multi-member households require explicit `householdId` in NPC JSON profiles, which can be added incrementally.

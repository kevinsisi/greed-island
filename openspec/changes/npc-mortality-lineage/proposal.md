## Why

NPCs are the soul of the simulation, yet they live forever — creating a static world where history never accumulates. The §43 acceptance criterion requires "當某個 NPC 死亡，後代會記得他" (when an NPC dies, descendants remember them). Without NPC mortality, no lineage can exist, no inheritance can transfer, and no NPC dialog can reference ancestors who shaped the world. This is the foundational civilization criteria that must land before the simulation can claim to be a living world.

## What Changes

- Add `NPC_DECEASED` event type: emitted when an NPC's simulated lifespan expires (tick-based age gate + optional combat mortality)
- Add `NpcMortalityProjection`: tracks per-NPC `bornAtTick`, `deceasedAtTick`, living/deceased status
- Add `NpcLineageProjection`: tracks parent-child NPC relationships, heir assignments per household
- Add mortality planner: deterministic per-NPC age check; emits `NPC_DECEASED` when `currentTick - bornAtTick ≥ lifespanTicks`
- Add heir selection: on `NPC_DECEASED`, emit `HOUSEHOLD_INHERITANCE_ASSIGNED` to the oldest living household member
- Extend `NpcProfile`: add optional `bornAtTick`, `parentNpcId`, `householdId` fields
- Add `NPC_HEIR_ASSIGNED` event type: records which NPC inherited a household role after a death
- Wire both projections into runtime boot hydration and fan-out
- Extend AI dialog grounding: `NPC_DECEASED` events appear in NPC memory so living NPCs can reference deceased ancestors
- Add chronicle narration for `NPC_DECEASED` and `NPC_HEIR_ASSIGNED`
- **BREAKING**: `NpcProfile` gains optional `bornAtTick` — existing profiles without it default to `bornAtTick: 0` (born at world start)

## Capabilities

### New Capabilities

- `npc-mortality`: NPC lifespan tracking, age-based death, deterministic mortality planner, `NPC_DECEASED` event pipeline
- `npc-lineage`: household lineage graph, `parentNpcId` relationships, heir selection, `HOUSEHOLD_INHERITANCE_ASSIGNED` emission, `NPC_HEIR_ASSIGNED` event

### Modified Capabilities

- `npc-humanity-ai-memory`: AI dialog grounding extended to include `NPC_DECEASED` events so NPCs can reference deceased ancestors without hallucinating

## Out of Scope

- Player-triggered NPC death (combat outcome killing an NPC is a Phase D combat feature)
- NPC reproduction / child NPC creation (separate feature; this release only handles death + inheritance of existing NPCs)
- Grief/emotional state changes in surviving NPCs (future Phase 3 extension)

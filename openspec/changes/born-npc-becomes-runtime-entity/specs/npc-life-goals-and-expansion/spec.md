# npc-life-goals-and-expansion Delta

## MODIFIED Requirements

### Requirement: Households are committed world facts

The system SHALL represent committed relationships, households, and children as
EventLog-backed facts. Children MAY start as household dependents and MUST be
promoted to full NPC actors after `NPC_MATURATION_TICKS` ticks via the
maturation pipeline defined in the `born-npc-maturation` capability.

#### Scenario: Stable relationship forms a household
- **GIVEN** two eligible NPCs have sufficient relationship stability, housing,
  food, and safety
- **WHEN** deterministic policy submits a household command
- **THEN** the Rule Engine MAY accept a household event
- **AND** replaying the EventLog MUST rebuild the same household facts

#### Scenario: Child starts as a dependent and matures into an actor
- **WHEN** a child-birth event is accepted
- **THEN** the child MUST appear as a household dependent immediately
- **AND** the child MUST NOT appear in `/api/world/state` `npcs[]` as a full actor before the maturation tick threshold
- **AND** once `currentTick - childBornAtTick ≥ NPC_MATURATION_TICKS` is satisfied on a cadence tick, an `NPC_MATURED` event MUST be emitted (subject to the `born-npc-maturation` planner's orphan guard)
- **AND** after `NPC_MATURED` is committed, the child MUST appear in `runtime.getNpcs()` as a full actor with a derived `NpcProfile`

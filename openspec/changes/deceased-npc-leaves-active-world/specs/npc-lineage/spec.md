## MODIFIED Requirements

### Requirement: On NPC_DECEASED, HOUSEHOLD_INHERITANCE_ASSIGNED SHALL be emitted
The heir selection planner MUST run immediately after the mortality planner emits `NPC_DECEASED`. It MUST find all living NPCs with the same `householdId`, sorted by `effectiveBornAtTick` ascending (oldest first). The first living member is the heir. If no living member exists, `heirId` is empty string. `HOUSEHOLD_INHERITANCE_ASSIGNED` MUST be emitted with `householdId`, `deceasedNpcId`, `heirId`, `amount: 0` (economic inheritance TBD in future goods integration).

Additionally, the deceased NPC MUST be removed from the active simulation on the same tick or subsequent tick:
- `NpcEngine.tick()` MUST skip the deceased NPC's decisioning starting from the tick following `NPC_DECEASED`.
- Public `/api/npcs` MUST stop returning the deceased NPC.
- Player interaction endpoints `/api/npc/:npcId/interact`, `/api/npc/:npcId/dialog-hold`, `/api/npc/intervene`, `/api/npc/:npcId/greet` MUST reject the deceased NPC with HTTP `410 Gone`.
- The deceased NPC remains observable through admin / lineage / chronicle paths so the "後代會記得他" guarantee is preserved.

#### Scenario: Oldest surviving household member becomes heir
- **GIVEN** household `'h_fisher'` has NPCs A (born tick 0) and B (born tick 1000), both living
- **WHEN** NPC A dies
- **THEN** `HOUSEHOLD_INHERITANCE_ASSIGNED` MUST be emitted with `heirId = B.id`

#### Scenario: No heir when household is empty
- **GIVEN** a solo-household NPC dies
- **WHEN** `NPC_DECEASED` is processed
- **THEN** `HOUSEHOLD_INHERITANCE_ASSIGNED` MUST be emitted with `heirId = ''`

#### Scenario: Deceased NPC stops being interactive on next tick
- **GIVEN** NPC A in household `'h_fisher'` is alive at tick `T`
- **WHEN** `NPC_DECEASED` for A is committed at tick `T`
- **THEN** at tick `T+1`, `runtime.getNpcs()` MUST NOT contain A
- **AND** `POST /api/npc/A/interact` MUST return HTTP `410`
- **AND** the lineage admin endpoint MUST still expose A as a household member with `deceased: true`

## MODIFIED Requirements

### Requirement: NPC AI dialog grounding SHALL include deceased NPC events
The `consultsEventTypes` list used in `aiSnapshot.ts` to build per-NPC dialog context MUST include `NPC_DECEASED`, `NPC_HEIR_ASSIGNED`, and `FACTION_NPC_LOYALTY_SHIFTED`. This allows living NPCs to reference deceased household members, community figures, and faction allegiance changes in grounded dialog without hallucinating names or loyalties.

#### Scenario: Living NPC can reference deceased ancestor in dialog
- **WHEN** `NPC_DECEASED` event for npcId `'npc_elder_1'` exists in the EventLog
- **AND** a living NPC with the same `householdId` is asked about their family
- **THEN** the AI dialog prompt MUST include the deceased event in the NPC's memory context so the response can reference `'npc_elder_1'` without invention

#### Scenario: Deceased events do not appear for unrelated NPCs
- **WHEN** building dialog context for an NPC in a different household
- **THEN** `NPC_DECEASED` events for NPCs outside that NPC's memory reference scope MUST NOT be included

#### Scenario: NPC can reference their faction loyalty shift in dialog
- **WHEN** `FACTION_NPC_LOYALTY_SHIFTED` event exists for npcId `'npc_trader_1'` with `fromFaction = 'tide_hunters'`, `toFaction = 'guild'`
- **AND** that NPC is asked about their allegiance
- **THEN** the AI dialog prompt MUST include the loyalty shift event in the NPC's memory context

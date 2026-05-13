## ADDED Requirements

### Requirement: NPC state SHALL be persisted as typed living-world events

The runtime SHALL persist authoritative NPC state snapshots as typed
`NPC_STATE_RECORDED` events rather than only as generic `FACT_SET` rows.

#### Scenario: Changed NPC state emits typed state event
- **WHEN** `NpcEngine.tick` produces a changed state for `npcId = X`
- **THEN** the runtime MUST commit an `NPC_STATE_RECORDED` event carrying `X` and
  the authoritative state snapshot for that tick

#### Scenario: Internal NPC state events do not appear as public narrative
- **WHEN** a `NPC_STATE_RECORDED` event is committed
- **THEN** it MUST remain available for typed projection rebuild
- **AND** it MUST NOT surface as a public recent-event / chronicle narrative item

### Requirement: NPC state projection SHALL rebuild engine state from typed events

The server SHALL provide a replayable `NpcStateProjection` rebuilt from
`NPC_STATE_RECORDED` events. Boot hydration SHALL prefer that projection over the
legacy `npc.state.<id>` FACT_SET path.

#### Scenario: Boot hydrate prefers typed projection
- **GIVEN** an EventLog containing `NPC_STATE_RECORDED` events for an NPC
- **WHEN** the runtime boots
- **THEN** `NpcEngine.hydrate(...)` MUST receive the latest typed state snapshot
- **AND** legacy `npc.state.<id>` FACT_SET values MUST be ignored for that NPC

#### Scenario: Legacy FACT_SET remains backward-compatible fallback
- **GIVEN** an older EventLog with no `NPC_STATE_RECORDED` events for an NPC
- **WHEN** the runtime boots
- **THEN** boot hydration MAY fall back to `npc.state.<id>` FACT_SET for that NPC

## ADDED Requirements

### Requirement: Internal projection events SHALL NOT reach public narrative surfaces

`AREA_STATE_RECORDED` and `NPC_STATE_RECORDED` MUST be emitted with `narration: null`. The web `isPublicNarrativeEvent` MUST additionally filter projection/snapshot event types (`AREA_STATE_RECORDED`, `NPC_STATE_RECORDED`, `NPC_INTENT_RESOLVED`) regardless of narration content, so historical events with leaked placeholder strings (e.g. "internal area state projection") never appear in the「世界正在發生」ticker or timeline.

#### Scenario: Leaked legacy narration stays hidden

- **GIVEN** a historical AREA_STATE_RECORDED event whose narration is "internal area state projection"
- **WHEN** the web ticker filters events
- **THEN** the event MUST NOT be shown

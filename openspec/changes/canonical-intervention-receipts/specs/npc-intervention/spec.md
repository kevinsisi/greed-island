## ADDED Requirements

### Requirement: Retry replies describe committed results
The canonical intervention endpoint SHALL return the original committed receipt
effects when an identical command retries, without repeating private-state writes.
It SHALL label the current persisted relation snapshot separately and SHALL return
an explicit unavailable original result for historical receipts without effect data.

#### Scenario: Duplicate within one tick
- WHEN the same canonical NPC pair and intervention intent retry within one tick
- THEN one fact and one set of private transcript/relation effects exist
- AND both replies identify the same original receipt result

#### Scenario: Another command changes trust
- WHEN a later committed command changes trust before the earlier intent retries
- THEN original receipt effects remain unchanged
- AND currentRelations reflects the later state without pretending it was the original result

### Requirement: Bounded duplicate comparison preserves authorization
Only validated server-derived PLAYER_INTERVENE effects MAY be ignored when comparing
an existing receipt with a proposed retry. All original typed intent/envelope fields
and other command types SHALL preserve conflict checks. Every retry SHALL require
live account/Origin authorization inside the EventLog transaction.

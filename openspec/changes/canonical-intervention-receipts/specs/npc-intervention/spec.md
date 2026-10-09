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
The endpoint SHALL limit ignored retry-comparison effects to validated server-derived
PLAYER_INTERVENE effects. All original typed intent/envelope fields
and other command types SHALL preserve conflict checks. Every retry SHALL require
live account/Origin authorization inside the EventLog transaction.

#### Scenario: A retry changes typed intent
- WHEN a proposed retry changes an original typed intent or envelope field
- THEN the endpoint SHALL preserve the command conflict check
- AND only validated server-derived PLAYER_INTERVENE effects MAY be excluded from comparison

#### Scenario: Retry authorization has expired
- WHEN an existing receipt is retried without live account or allowed Origin authorization
- THEN the EventLog transaction SHALL reject the retry without private-state writes

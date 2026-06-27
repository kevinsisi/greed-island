## ADDED Requirements

### Requirement: NPC dialog exposes relationship action context

The NPC dialog SHALL display current server-projected relationship action context when the active NPC has a relationship action.

#### Scenario: Dialog header renders action marker

- **GIVEN** the player opens a dialog with an NPC that has `relationshipAction`
- **WHEN** the dialog header is rendered
- **THEN** it includes the compact relationship action marker label
- **AND** it includes the marker detail using utterance-first/detail-fallback behavior.

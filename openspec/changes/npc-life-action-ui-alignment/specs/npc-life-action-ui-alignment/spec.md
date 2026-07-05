## ADDED Requirements

### Requirement: Life action UI matches committed freeform action kinds

Player-facing UI SHALL translate validated NPC freeform life action kinds into readable labels and badges instead of exposing raw ids or falling back to idle.

#### Scenario: Timeline translates new life action kinds

- **GIVEN** a committed `NPC_FREEFORM_ACTION_PROPOSED` event with resolved kind `buy_goods`, `learn`, or `invent`
- **WHEN** the Timeline renders event motivation
- **THEN** it SHALL display readable Chinese action labels for shopping/procurement, learning/apprenticeship, or invention/prototype work.

#### Scenario: Area NPC badges reflect recent freeform life actions

- **GIVEN** an NPC has a recent committed freeform action of kind `buy_goods`, `learn`, or `invent`
- **WHEN** the area NPC list renders behavior badges
- **THEN** the badge SHALL show matching shopping, learning, or invention behavior instead of generic idle/activity text.

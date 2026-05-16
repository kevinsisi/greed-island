# Spec delta — social-system (Authoritative Character Avatars)

## ADDED Requirements

### Requirement: Player avatar rendering SHALL distinguish social presence from simulation authority

Player avatar rendering MAY use authenticated social presence coordinates for showing nearby players, but those coordinates and any derived visual action are social/UI presence, not living-world simulation authority. Unless the server exposes an explicit action field, peer player avatars MUST be limited to safe visual states derived from presence position changes.

#### Scenario: Nearby player avatar uses presence coordinates

- **GIVEN** `/api/social/nearby` returns player `p1` with `x`, `y`, and `z`
- **WHEN** the Hub or Area scene renders peer player avatars
- **THEN** `p1` MAY be rendered at those coordinates
- **AND** missing coordinates MUST use an existing safe fallback placement, not a fabricated world action

#### Scenario: Peer player action is not overclaimed

- **GIVEN** `/api/social/nearby` does not include a player action field
- **WHEN** the frontend observes position deltas and renders a walking pose
- **THEN** that pose MUST be treated as visual interpolation only
- **AND** the UI MUST NOT claim the player is working, trading, patrolling, eating, or sleeping

#### Scenario: Controlled player animation does not mutate world state

- **GIVEN** the local player avatar plays idle or walk animation from keyboard/pointer input
- **WHEN** the frontend posts `/api/social/presence`
- **THEN** the request MAY include coordinates
- **AND** it MUST NOT mutate NPC state, settlement state, world facts, or combat state

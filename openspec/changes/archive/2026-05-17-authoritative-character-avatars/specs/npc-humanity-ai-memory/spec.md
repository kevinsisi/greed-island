# Spec delta — npc-humanity-ai-memory (Authoritative Character Avatars)

## ADDED Requirements

### Requirement: NPC avatar rendering SHALL preserve globally unique presence

Every visible NPC avatar MUST correspond to exactly one server-authoritative NPC presence tuple. Hub, Area, and Building avatar layers MUST use the same projection rules that prevent an NPC from appearing both indoors and outdoors or both travelling and local.

#### Scenario: Area avatar excludes travelling NPC

- **GIVEN** `/api/npcs` reports NPC `n1` with `activity = 'move'` and a non-null `travelRoute`
- **WHEN** an Area scene derives character avatars for `n1`'s current tile
- **THEN** no local Area avatar is rendered for `n1`
- **AND** Hub MAY render one travelling avatar for the route segment

#### Scenario: Building occupant is not duplicated outdoors

- **GIVEN** `/api/npcs` reports NPC `n2` with `buildingId = 'b1'`
- **WHEN** the Area and Building scenes derive character avatars
- **THEN** the Area scene MUST NOT render `n2` outdoors
- **AND** the Building scene for `b1` MAY render `n2` indoors

#### Scenario: Hub does not invent non-travelling NPC avatars

- **GIVEN** an NPC has `activity != 'move'` or lacks `travelRoute`
- **WHEN** the Hub scene derives NPC avatars
- **THEN** that NPC MUST NOT appear as a Hub pedestrian or decorative crowd member

# Spec delta — living-world (Authoritative Character Avatars)

## MODIFIED Requirements

### Requirement: 前端 sprite 必須呈現移動感與狀態

Frontend character rendering SHALL present NPCs and players as humanoid avatars where supported, but all NPC position and activity MUST derive from server-authoritative state. Renderer-only idle/pose animation MAY add breathing, limb motion, and posture changes, but MUST NOT create local wandering, change authoritative position, or invent activity.

#### Scenario: NPC avatar action derives from server activity

- **GIVEN** `/api/npcs` reports NPC `n1` with `activity = 'work'` and authoritative sub-position
- **WHEN** an Area or Building scene renders `n1`
- **THEN** the avatar MAY play a work pose/animation
- **AND** its position MUST derive from the server-provided presence tuple
- **AND** the frontend MUST NOT substitute another activity such as trade, patrol, or sleep

#### Scenario: Missing NPC activity falls back safely

- **GIVEN** a legacy NPC payload has no `activity`
- **WHEN** the avatar visual state is derived
- **THEN** the visual action MUST fall back to `idle`
- **AND** no random or AI-generated action is introduced

#### Scenario: Renderer animation does not create local wander

- **GIVEN** an NPC has not received a new authoritative position
- **WHEN** the avatar idle animation plays
- **THEN** the animation MAY move limbs or scale the body for breathing
- **AND** it MUST NOT drift the actor to a new map coordinate

#### Scenario: Player avatar walk is local presentation only

- **GIVEN** a logged-in player moves their local avatar with keyboard or pointer input
- **WHEN** the frontend renders a walking pose
- **THEN** that pose is a renderer-only presentation of local input
- **AND** it MUST NOT be treated as world simulation authority

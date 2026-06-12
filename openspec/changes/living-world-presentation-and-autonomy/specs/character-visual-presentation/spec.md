## ADDED Requirements

### Requirement: Procedural avatars SHALL render as layered 2.5D characters

`createProceduralHumanoidAvatar` MUST render: a ground shadow ellipse, legs/torso/arms with joint-anchored origins, a volumetric torso shade overlay, a seeded skin tone, hair color and hair style derived deterministically from the character id, and facing-aware eyes. The exported `ProceduralAvatar` record fields (`container`, `body`, `head`, `leftArm`, `rightArm`, `leftLeg`, `rightLeg`, `label`) and the `applyProceduralAvatarPose` signature MUST remain unchanged so AreaScene / MapScene / BuildingScene need no modification.

#### Scenario: Same character id renders identically across scenes

- **GIVEN** an NPC with id `dock.fisher` rendered in AreaScene and later in BuildingScene
- **WHEN** both avatars are created
- **THEN** skin tone, hair color, hair style, and pants color MUST be identical in both scenes (seeded by id hash)

#### Scenario: Scene recolor contract preserved

- **GIVEN** a scene calls `avatar.body.setFillStyle(color)` and `avatar.leftArm.setFillStyle(color)`
- **WHEN** the avatar re-renders
- **THEN** the outfit recolor MUST apply without errors and the shade overlay MUST remain readable on any color

### Requirement: Characters SHALL animate continuously by action

The avatar MUST register a scene-update handler that drives a continuous animation loop keyed by the character's current action: walk (leg/arm swing + body bob + shadow squash), patrol (reduced swing), work (hammer swing), eat (arm-to-mouth), trade (gesturing), sleep (lying pose), idle (breathing). The handler MUST be removed when the container is destroyed.

#### Scenario: Walking NPC swings limbs

- **GIVEN** an NPC whose visual state action is `walk`
- **WHEN** scene update ticks advance
- **THEN** leg and arm rotations MUST oscillate over time and the rig MUST bob vertically while the ground shadow stays at foot level

#### Scenario: Destroyed avatar unregisters its animator

- **GIVEN** an avatar whose container is destroyed (NPC left the area)
- **WHEN** subsequent scene updates fire
- **THEN** the avatar's update handler MUST no longer run

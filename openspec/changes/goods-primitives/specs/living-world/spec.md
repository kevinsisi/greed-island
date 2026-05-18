## ADDED Requirements

### Requirement: Productive-action fan-out emits GOODS_EXTRACTED for yield-producing actions

When the runtime commits a `NPC_PRODUCTIVE_ACTION_ACCEPTED` event whose `actionType` is `hunt`, `mine`, or `fish`, the runtime fan-out loop MUST enqueue a `GOODS_EXTRACTED` Command for the appropriate goods species. This fan-out MUST occur within the same world tick as the accepted productive action. The Command MUST pass through the standard `submitLivingWorldCommand → Rule Engine → Event → Projection` pipeline.

#### Scenario: Hunt action fan-out produces meat

- **WHEN** the runtime commits `NPC_PRODUCTIVE_ACTION_ACCEPTED { npcId, actionType: "hunt" }` at tick T
- **THEN** the runtime MUST call `submitLivingWorldCommand({ type: "GOODS_EXTRACTED", actorId: npcId, payload: { goodsSpeciesId: "meat", quantity: 1, ownerId: npcId, ownerType: "npc" } })` within tick T

#### Scenario: Mine action fan-out produces ore

- **WHEN** the runtime commits `NPC_PRODUCTIVE_ACTION_ACCEPTED { npcId, actionType: "mine" }` at tick T
- **THEN** the runtime MUST enqueue `GOODS_EXTRACTED { goodsSpeciesId: "ore", quantity: 1, ownerId: npcId, ownerType: "npc" }` within tick T

#### Scenario: Fish action fan-out produces fish

- **WHEN** the runtime commits `NPC_PRODUCTIVE_ACTION_ACCEPTED { npcId, actionType: "fish" }` at tick T
- **THEN** the runtime MUST enqueue `GOODS_EXTRACTED { goodsSpeciesId: "fish", quantity: 1, ownerId: npcId, ownerType: "npc" }` within tick T

#### Scenario: Other action types do not produce goods

- **WHEN** the runtime commits `NPC_PRODUCTIVE_ACTION_ACCEPTED { npcId, actionType: "craft" }` at tick T
- **THEN** the runtime MUST NOT enqueue any `GOODS_EXTRACTED` command for that event

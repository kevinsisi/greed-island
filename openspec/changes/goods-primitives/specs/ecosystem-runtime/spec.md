## ADDED Requirements

### Requirement: MEAT_HARVESTED and FISHERY_HARVESTED events SHALL promote to GOODS_EXTRACTED

When the runtime commits a `MEAT_HARVESTED` ecosystem event, it MUST enqueue a `GOODS_EXTRACTED { goodsSpeciesId: "meat", quantity: 1 }` Command keyed to the harvesting NPC. When the runtime commits a `FISHERY_HARVESTED` ecosystem event, it MUST enqueue `GOODS_EXTRACTED { goodsSpeciesId: "fish", quantity: 1 }`. These follow-on commands MUST be submitted within the same world tick. This requirement extends the ecosystem layer's output contract without changing any existing ecosystem event shapes.

#### Scenario: MEAT_HARVESTED follow-on is enqueued

- **WHEN** a `MEAT_HARVESTED` event with `actorId = "npc_hunter_7"` is committed at tick T
- **THEN** the runtime fan-out MUST call `submitLivingWorldCommand({ type: "GOODS_EXTRACTED", actorId: "npc_hunter_7", payload: { goodsSpeciesId: "meat", quantity: 1, ownerId: "npc_hunter_7", ownerType: "npc" } })` within tick T
- **AND** the resulting `GOODS_EXTRACTED` Event MUST appear in EventLog at tick T

#### Scenario: FISHERY_HARVESTED follow-on is enqueued

- **WHEN** a `FISHERY_HARVESTED` event with `actorId = "npc_fisher_3"` is committed at tick T
- **THEN** the runtime MUST enqueue `GOODS_EXTRACTED { goodsSpeciesId: "fish", quantity: 1, ownerId: "npc_fisher_3", ownerType: "npc" }` within tick T

#### Scenario: Non-harvest ecosystem events do not trigger goods extraction

- **WHEN** `ANIMAL_MIGRATED`, `ANIMAL_REPRODUCED`, or `ANIMAL_STARVED` events are committed
- **THEN** the runtime MUST NOT enqueue any `GOODS_EXTRACTED` command for those events

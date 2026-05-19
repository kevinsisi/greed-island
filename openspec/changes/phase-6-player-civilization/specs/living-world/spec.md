# living-world Delta Specification (phase-6-player-civilization)

## ADDED Requirements

### Requirement: LivingWorldCommandPayload SHALL include player goods interaction commands
The `LivingWorldCommandPayload` union MUST include:
- `PLAYER_PICKED_UP_GOODS` with payload `{ playerAccountId: string; tileId: string; goodsId: string; quantity: number; tick: number }`
- `PLAYER_TRADED_GOODS` with payload `{ playerAccountId: string; npcId: string; tileId: string; offeredGoods: Array<{ goodsId: string; quantity: number }>; requestedGoods: Array<{ goodsId: string; quantity: number }>; tick: number }`
- `PLAYER_HUNTED_ANIMAL` with payload `{ playerAccountId: string; tileId: string; animalId: string; speciesId: string; tick: number }`
- `PLAYER_FISHED` with payload `{ playerAccountId: string; tileId: string; quantity: number; tick: number }`
- `PLAYER_DOMESTICATED_ANIMAL` with payload `{ playerAccountId: string; tileId: string; animalId: string; speciesId: string; tick: number }`
- `PLAYER_PROTECTED_REGION` with payload `{ playerAccountId: string; tileId: string; tick: number }`

#### Scenario: PLAYER_TRADED_GOODS accepted with valid NPC and goods
- **WHEN** `PLAYER_TRADED_GOODS` is submitted with a valid `npcId`, `tileId`, non-empty goods arrays, and a valid `playerAccountId`
- **THEN** the Rule Engine MUST accept it and commit the event to EventLog

#### Scenario: PLAYER_HUNTED_ANIMAL accepted with valid animal reference
- **WHEN** `PLAYER_HUNTED_ANIMAL` is submitted with valid `animalId`, `speciesId`, and `tileId`
- **THEN** the Rule Engine MUST accept it and commit the event to EventLog

### Requirement: LivingWorldCommandPayload SHALL include player NPC interaction commands
The `LivingWorldCommandPayload` union MUST include:
- `PLAYER_HIRED_NPC` with payload `{ playerAccountId: string; npcId: string; tileId: string; tick: number }`
- `PLAYER_DISMISSED_NPC` with payload `{ playerAccountId: string; npcId: string; tick: number }`

#### Scenario: PLAYER_HIRED_NPC accepted with valid NPC
- **WHEN** `PLAYER_HIRED_NPC` is submitted with valid `npcId`, `tileId`, and `playerAccountId`
- **THEN** the Rule Engine MUST accept it and commit the event to EventLog

#### Scenario: PLAYER_DISMISSED_NPC accepted with valid NPC reference
- **WHEN** `PLAYER_DISMISSED_NPC` is submitted with valid `npcId` and `playerAccountId`
- **THEN** the Rule Engine MUST accept it and commit the event to EventLog

### Requirement: LivingWorldCommandPayload SHALL include player civilization building commands
The `LivingWorldCommandPayload` union MUST include:
- `PLAYER_SPONSORED_CONSTRUCTION` with payload `{ playerAccountId: string; tileId: string; buildingType: string; tick: number }`
- `PLAYER_FOUNDED_SETTLEMENT` with payload `{ playerAccountId: string; tileId: string; settlementName: string; tick: number }`
- `PLAYER_CLAIMED_TERRITORY` with payload `{ playerAccountId: string; tileId: string; tick: number }`

#### Scenario: PLAYER_CLAIMED_TERRITORY accepted with valid tile
- **WHEN** `PLAYER_CLAIMED_TERRITORY` is submitted with valid `tileId` and `playerAccountId`
- **THEN** the Rule Engine MUST accept it and commit the event to EventLog

### Requirement: LivingWorldCommandPayload SHALL include player faction commands
The `LivingWorldCommandPayload` union MUST include:
- `PLAYER_JOINED_FACTION` with payload `{ playerAccountId: string; factionId: string; tick: number }`
- `PLAYER_LEFT_FACTION` with payload `{ playerAccountId: string; factionId: string; tick: number }`
- `PLAYER_LED_FACTION` with payload `{ playerAccountId: string; factionId: string; tick: number }`

#### Scenario: PLAYER_JOINED_FACTION accepted with valid faction
- **WHEN** `PLAYER_JOINED_FACTION` is submitted with valid `factionId` and `playerAccountId`
- **THEN** the Rule Engine MUST accept it and commit the event to EventLog

### Requirement: LivingWorldCommandPayload SHALL include PLAYER_PLAYED_CARD for world-layer card use
The `LivingWorldCommandPayload` union MUST include `PLAYER_PLAYED_CARD` with payload `{ playerAccountId: string; cardId: string; targetTileId: string; targetNpcId?: string; tick: number }`.

#### Scenario: PLAYER_PLAYED_CARD accepted with valid card and tile
- **WHEN** `PLAYER_PLAYED_CARD` is submitted with valid `cardId`, `targetTileId`, and `playerAccountId`
- **THEN** the Rule Engine MUST accept it and commit the event to EventLog

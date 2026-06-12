## ADDED Requirements

### Requirement: Deceased NPC goods SHALL transfer to the heir

A pure planner `planInheritanceTransfers({ intents, goodsInventory })` MUST, for each mortality intent that has an heir, collect every `holderType='npc'` inventory row of the deceased with positive quantity and produce a transfer (`householdId`, `deceasedNpcId`, `heirNpcId`, `amount` = total quantity ≥ 1, `goods` line items). Intents without an heir or with an empty estate MUST produce no transfer. The runtime mortality cadence MUST emit one `HOUSEHOLD_INHERITANCE_ASSIGNED` command per transfer in the same tick block as the paired `NPC_DECEASED` / `NPC_HEIR_ASSIGNED`.

#### Scenario: Estate transfers on death with heir

- **GIVEN** a deceased NPC holding 5 fish and 3 hide with a living heir
- **WHEN** the mortality cadence runs
- **THEN** a HOUSEHOLD_INHERITANCE_ASSIGNED event MUST be emitted with `amount = 8` and both goods lines

#### Scenario: No heir means no transfer

- **GIVEN** a deceased NPC with goods but no living household member
- **WHEN** the mortality cadence runs
- **THEN** no HOUSEHOLD_INHERITANCE_ASSIGNED event is emitted for that NPC

### Requirement: GoodsInventoryProjection SHALL apply inheritance transfers

`HOUSEHOLD_INHERITANCE_ASSIGNED` payloads MAY carry an optional `goods: { goodsId, quantity, tileId }[]` list (validator-enforced shape). When present, `GoodsInventoryProjection` MUST subtract each line from `npc:<deceasedNpcId>` and add it to `npc:<heirId>`. Events without a `goods` list (legacy shape) MUST be a no-op for the inventory projection, preserving replay of older logs.

#### Scenario: Inventory moves from deceased to heir

- **GIVEN** an inheritance event with goods lines for fish ×7 and hide ×2
- **WHEN** the projection processes it
- **THEN** the deceased's rows MUST drop to 0 and the heir's rows MUST gain 7 fish and 2 hide

#### Scenario: Legacy event shape is inert

- **GIVEN** a HOUSEHOLD_INHERITANCE_ASSIGNED event without a `goods` field
- **WHEN** the projection processes it
- **THEN** no inventory row changes

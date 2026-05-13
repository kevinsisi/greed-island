# Spec — civilization-runtime capability (Goods Production Chains)

## ADDED Requirements

### Requirement: Production recipes SHALL be deterministic runtime data

The runtime MUST define production recipes as deterministic data, not AI
narration. Each recipe MUST include recipe id, input goods id and quantity,
output goods id and quantity, eligible holder/building or settlement context, and
tick metadata needed to replay production decisions.

#### Scenario: Salt recipe is available

- **WHEN** the production recipe catalog is read
- **THEN** it MUST include a deterministic recipe for `salt_marsh_brine` to
  `refined_salt`

### Requirement: Production chains SHALL process inventory through typed events

When an eligible production holder has enough input inventory, the runtime MUST
emit a `GOODS_PROCESSED` command through the Rule Engine. The resulting event
MUST subtract input goods and add output goods through `GoodsInventoryProjection`.

#### Scenario: Brine becomes refined salt

- **GIVEN** an eligible holder has enough `salt_marsh_brine` inventory
- **WHEN** production planning runs
- **THEN** the runtime MUST emit `GOODS_PROCESSED` for `refined_salt`
- **AND** the goods inventory projection MUST reduce `salt_marsh_brine` and
  increase `refined_salt`

### Requirement: Production SHALL not fabricate missing inputs


The runtime MUST NOT emit `GOODS_PROCESSED` when the selected holder lacks the
required input quantity. Missing inputs MUST leave inventory unchanged.

#### Scenario: No brine means no salt

- **GIVEN** an eligible holder has zero `salt_marsh_brine`
- **WHEN** production planning runs
- **THEN** no `GOODS_PROCESSED` event for `refined_salt` is emitted

### Requirement: Production facts SHALL be visible to GM observers

The web client MUST render production-chain facts in the GM/admin world observer
page and label them as production-chain state rather than market prices.

#### Scenario: GM views production state

- **GIVEN** an authenticated GM or admin opens the world observer page
- **WHEN** production-chain facts exist in `WorldSnapshot.facts`
- **THEN** the page MUST display recipe/output state without requiring raw JSON
  inspection

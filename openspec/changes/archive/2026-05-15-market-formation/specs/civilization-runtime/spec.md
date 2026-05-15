# Spec — civilization-runtime capability (Market Formation)

## ADDED Requirements

### Requirement: Market price discovery SHALL be a typed living-world event

The living-world command catalog MUST include `MARKET_PRICE_DISCOVERED`. Each
price event MUST include market id, settlement id, goods id, supply quantity,
demand quantity, discovered price in gold, tick metadata, and narration. Price
discovery MUST pass through the Rule Engine before it reaches any projection.

#### Scenario: Market price command validates

- **WHEN** a valid `MARKET_PRICE_DISCOVERED` command is evaluated by the Rule Engine
- **THEN** it MUST produce a typed `MARKET_PRICE_DISCOVERED` event

### Requirement: Market prices SHALL be derived from projected supply and demand

The runtime MUST calculate settlement goods prices from deterministic market
metadata and projected settlement inventory. The calculation MUST NOT use AI
narration, random numbers, or frontend state.

#### Scenario: Scarcity raises price

- **GIVEN** central settlement demand for `refined_salt` is greater than supply
- **WHEN** market pricing runs
- **THEN** the discovered `refined_salt` price MUST be higher than its base price

#### Scenario: Adequate supply lowers pressure

- **GIVEN** central settlement supply for a goods id meets or exceeds demand
- **WHEN** market pricing runs
- **THEN** the discovered price MUST be less than or equal to the scarcity price
  for the same goods id when supply is zero

### Requirement: Market price projection SHALL be replayable

The runtime MUST maintain `marketPrices` as a projection over
`MARKET_PRICE_DISCOVERED` events keyed by settlement id and goods id. Rebuilding
from the same EventLog MUST produce the same canonical hash.

#### Scenario: Latest price wins

- **GIVEN** two `MARKET_PRICE_DISCOVERED` events exist for the same settlement
  and goods id
- **WHEN** the projection rebuilds
- **THEN** it MUST report the latest event's price and tick

### Requirement: Market prices SHALL be visible to GM observers

The web client MUST render `WorldSnapshot.facts.marketPrices` in the GM/admin
world observer page and label them as price projection state rather than NPC
purchase transactions.

#### Scenario: GM views market prices

- **GIVEN** an authenticated GM or admin opens the world observer page
- **WHEN** `facts.marketPrices` contains rows
- **THEN** the page MUST display settlement id, goods id, supply, demand, price,
  and updated tick without requiring raw JSON inspection

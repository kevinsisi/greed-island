# Spec — civilization-runtime capability (Goods Logistics)

## ADDED Requirements

### Requirement: Logistics command primitives SHALL be typed living-world events

The living-world command catalog MUST include typed commands for opening and
closing trade routes and for goods transport start, arrival, and loss. Transport
start commands MUST include route id, goods id, positive quantity, source holder,
destination holder, source/destination tile, carrier NPC id, and tick metadata.
Transport resolution commands MUST include enough route, goods, quantity, carrier,
tile, reason/status, and tick metadata to project arrival or loss deterministically.

#### Scenario: Transport command validates

- **WHEN** a valid `GOODS_TRANSPORT_STARTED` command is evaluated by the Rule Engine
- **THEN** it MUST produce a typed `GOODS_TRANSPORT_STARTED` event

### Requirement: Logistics projections SHALL be replayable

The runtime MUST maintain logistics projections over typed logistics events,
including open trade routes and goods transport rows. Rebuilding from the same
EventLog MUST produce the same canonical hash.

#### Scenario: Transport arrives

- **GIVEN** a `GOODS_TRANSPORT_STARTED` event exists
- **WHEN** a matching `GOODS_TRANSPORT_ARRIVED` event is projected
- **THEN** the transport row MUST report status `arrived`

### Requirement: Source goods SHALL move through logistics before settlement storage

The runtime SHALL move ecosystem-sourced goods through logistics when they are
stored on an NPC outside `t_central`. It MUST plan an abstract logistics chain:
route opened if needed, source
inventory consumed for loading, transport started, transport arrived, and goods
stored on the central settlement holder.

#### Scenario: Fish moves from fisher to central settlement

- **GIVEN** an NPC on `t_dock` stores 12 fish goods
- **WHEN** runtime side effects are planned
- **THEN** it MUST emit transport events and a central settlement `GOODS_STORED`
  event for 12 fish

### Requirement: Storms SHALL be able to destroy in-transit goods

The runtime SHALL allow active storm world events to destroy in-transit goods.
If an active `weather.storm` world event is present while an abstract goods
transport is planned, it MUST emit `GOODS_TRANSPORT_LOST` instead of
`GOODS_TRANSPORT_ARRIVED` and MUST NOT store the transported goods at the
destination. Storms MUST NOT damage buildings or cities in this slice.

#### Scenario: Storm destroys shipment

- **GIVEN** an active `weather.storm` world event
- **WHEN** a fisher NPC attempts to move 12 fish goods to the central settlement
- **THEN** the runtime MUST emit `GOODS_TRANSPORT_LOST` with reason `storm`
- **AND** no destination `GOODS_STORED` event is emitted for that shipment

### Requirement: Logistics SHALL be visible to GM observers

The web client MUST render `WorldSnapshot.facts.logistics` in the GM/admin world
observer page, including route id, source/destination tiles, goods id, carrier,
quantity, status, and updated tick.

#### Scenario: GM views logistics

- **GIVEN** an authenticated GM or admin opens the world observer page
- **WHEN** `facts.logistics` contains routes or transports
- **THEN** the page MUST display those rows without requiring raw JSON inspection

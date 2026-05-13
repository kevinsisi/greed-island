## ADDED Requirements

### Requirement: Runtime layers are formally defined

The architecture documentation SHALL define six runtime layers: Simulation Kernel,
Living World Runtime, Ecosystem Runtime, Civilization Runtime, Combat Runtime,
and Perception Runtime. Each layer MUST declare its authority boundary and MUST
preserve Command → Rule Engine → Event → Projection as the only path for world
state mutation.

#### Scenario: Layer definitions guide review
- **WHEN** a new OpenSpec change modifies world simulation behavior
- **THEN** the change MUST name which runtime layer owns the behavior
- **AND** it MUST explain how state changes cross into other layers through
  committed Events and projections rather than direct mutation

#### Scenario: AI remains perception-only
- **WHEN** a feature uses AI for narration, dialog, or interpretation
- **THEN** the AI output MUST remain in the Perception Runtime
- **AND** it MUST NOT author Commands, mutate WorldState, choose deterministic
  outcomes, or bypass the Rule Engine

### Requirement: Layer dependencies constrain development order

The architecture documentation SHALL record the dependency rules from
`docs/WORLD_CAPABILITIES.md`: budget enforcement precedes simulation growth,
ecosystem foundation precedes goods/logistics/market, combat outcomes feed
civilization/ecosystem/history projections, and player actions are ordinary
Commands without deterministic privilege.

#### Scenario: Goods cannot predate ecosystem substrate
- **GIVEN** a proposed feature adds goods, logistics, production, or market prices
- **WHEN** the ecosystem substrate for the raw goods does not exist
- **THEN** the proposal MUST be rejected or explicitly scoped as placeholder-only
- **AND** it MUST NOT claim honest civilization metabolism

#### Scenario: Combat cannot remain detached
- **GIVEN** a proposed combat feature resolves damage or victory
- **WHEN** the feature claims persistent world consequences
- **THEN** those consequences MUST be represented as committed Events feeding
  civilization, ecosystem, NPC memory, and history projections

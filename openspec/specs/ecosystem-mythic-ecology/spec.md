# ecosystem-mythic-ecology Specification

## Purpose
Defines the mythic ecology layer: legendary apex species with singleton spawn constraints, world event projection tracking, hunt arc detection via NPC clustering, faction ideology-driven ecology commands, and admin UI visibility. Added by change ecosystem-mythic-ecology.

## Requirements

### Requirement: Legendary species SHALL have rarity marker and singleton spawn constraint
The species catalog SHALL include at least two legendary apex species: `white_marsh_leviathan` (salt_marsh) and `iron_hound` (mountain). Each legendary species MUST carry `rarity: 'legendary'` and the spawn planner MUST enforce a singleton constraint: at most one living individual of each legendary species across all tiles at any time.

#### Scenario: Singleton constraint blocks second legendary spawn
- **WHEN** a `white_marsh_leviathan` already exists in the animal population
- **THEN** `legendarySpawnPlanner` MUST NOT emit a second `ANIMAL_SPAWNED` for `white_marsh_leviathan` regardless of tick or tile conditions

#### Scenario: Legendary species spawned after previous one dies
- **WHEN** the previous `white_marsh_leviathan` is removed via `ANIMAL_KILLED` or `ANIMAL_STARVED`
- **THEN** `legendarySpawnPlanner` MAY spawn a new `white_marsh_leviathan` on the next eligible cadence tick

### Requirement: Legendary spawn planner SHALL gate on probability and ecosystem health
`legendarySpawnPlanner` SHALL run every `LEGENDARY_SPAWN_CADENCE_TICKS` ticks. It MUST only emit a spawn when: (1) singleton constraint passes, (2) prey population on the target tile meets a minimum threshold, (3) ecosystem pressure on the tile does not exceed `LEGENDARY_MAX_PRESSURE`, and (4) a deterministic probability check `hash(tick + speciesId) % 1000 < LEGENDARY_SPAWN_PROBABILITY` passes.

#### Scenario: Low-pressure healthy tile may spawn legendary
- **WHEN** no existing legendary of that species exists, prey population is sufficient, pressure is below max, and the hash check passes
- **THEN** `legendarySpawnPlanner` MUST emit `ANIMAL_SPAWNED` for the legendary species

#### Scenario: High-pressure tile suppresses legendary spawn
- **WHEN** ecosystem pressure on the only eligible tile exceeds `LEGENDARY_MAX_PRESSURE`
- **THEN** `legendarySpawnPlanner` MUST NOT emit `ANIMAL_SPAWNED` regardless of probability roll

#### Scenario: Spawn probability is deterministic
- **WHEN** the same tick and speciesId are evaluated on two independent runtime instances
- **THEN** both MUST produce identical pass/fail results for the probability check

### Requirement: WorldEventProjection SHALL track active legendary-creature events
`WorldEventProjection` MUST maintain a map from `linkedAnimalId` to an active `WorldEventRow` containing `eventKind`, `tileId`, `severity`, `linkedAnimalId`, `speciesId`, `spawnedAtTick`, and `huntStartedEmitted` flag. It MUST be rebuilt from `WORLD_EVENT_SPAWNED` and `WORLD_EVENT_RESOLVED` events in the EventLog.

#### Scenario: World event appears after legendary spawn
- **WHEN** a legendary animal triggers `WORLD_EVENT_SPAWNED` in the EventLog
- **THEN** `WorldEventProjection.getActiveByTile(tileId)` MUST return a row for that animal

#### Scenario: World event clears on animal death
- **WHEN** `WORLD_EVENT_RESOLVED` is committed for a legendary animal
- **THEN** `WorldEventProjection.getActiveByTile(tileId)` MUST NOT include that animal's row

#### Scenario: Projection rebuilds from EventLog on boot
- **GIVEN** an EventLog containing both `WORLD_EVENT_SPAWNED` and `WORLD_EVENT_RESOLVED` pairs
- **WHEN** the runtime boots and `WorldEventProjection` hydrates
- **THEN** only events without a matching resolve MUST appear as active

### Requirement: Active world events SHALL reduce areaSafety for affected tiles
The runtime SHALL subtract the world event's severity from the tile's `areaSafety` score before passing it to `npcEngine.tick()`. This MUST use the existing `NpcTickContext.areaSafety` map without modifying `NpcEngine` internals.

#### Scenario: Legendary creature lowers tile safety
- **WHEN** an active world event targets tile `t_salt_marsh_1` with severity `30`
- **THEN** the `areaSafety` value passed to `npcEngine.tick()` for that tile MUST be reduced by `30` compared to its base value
- **AND** hunter and guard NPCs on that tile MAY exhibit flee/hunt behavior via existing personality nudge logic

#### Scenario: Safety never goes below zero
- **WHEN** base areaSafety is `10` and a world event subtracts `30`
- **THEN** the passed areaSafety MUST be clamped to `0`, not a negative value

### Requirement: Legendary hunt arc SHALL be detected via hunter NPC clustering
`legendaryHuntPlanner` SHALL run each tick over active world events. When ≥ `LEGENDARY_HUNT_MIN_HUNTERS` hunter-role NPCs are on the same tile as the legendary creature for ≥ `LEGENDARY_HUNT_THRESHOLD_TICKS` consecutive ticks, the runtime MUST emit `LEGENDARY_HUNT_STARTED` once per event. When the legendary creature dies and its world event resolves, the runtime MUST emit `LEGENDARY_HUNT_CONCLUDED`.

#### Scenario: Hunt started after sustained hunter clustering
- **WHEN** 3 or more hunter-role NPCs remain on the legendary creature's tile for 5 consecutive minutes of ticks
- **THEN** `LEGENDARY_HUNT_STARTED` MUST be emitted exactly once for that world event

#### Scenario: Hunt started not re-emitted on restart
- **WHEN** `WorldEventProjection` reports `huntStartedEmitted = true` for an active event
- **THEN** the runtime MUST NOT emit a second `LEGENDARY_HUNT_STARTED` for that event

#### Scenario: Hunt concluded when legendary creature dies
- **WHEN** `ANIMAL_KILLED` or `ANIMAL_STARVED` resolves a legendary creature's world event
- **AND** `huntStartedEmitted` is `true` for that event
- **THEN** the runtime MUST emit `LEGENDARY_HUNT_CONCLUDED`

### Requirement: Faction ecology planner SHALL emit ideology-driven commands
`factionEcologyPlanner` SHALL run every `FACTION_ECOLOGY_CADENCE_TICKS` ticks. For each faction, it MUST check the faction's `ecologyStance` and ecosystem state, then emit the matching faction ecology command when gating conditions are met: `guild` → `FOREST_CLEARCUT_ORDERED` (forest pressure ≥ threshold), `tide_hunters` → `FISHING_QUOTA_ENFORCED` (fishery density ≤ threshold), `free_runners` → `INDUSTRIAL_SITE_SABOTAGED` (livestock count ≥ threshold), `hidden_overseer` → `RITUAL_ECOSYSTEM_MANIPULATION` (unconditional).

#### Scenario: Guild emits clearcut when forest pressure is high
- **WHEN** any forest tile has ecosystem pressure ≥ the guild faction's clearcut threshold
- **THEN** `FOREST_CLEARCUT_ORDERED` MUST be emitted for that faction and tile

#### Scenario: Tide hunters enforce quota when fishery is depleted
- **WHEN** any salt_marsh tile has fishery density ≤ the quota enforcement threshold
- **THEN** `FISHING_QUOTA_ENFORCED` MUST be emitted for that faction and tile

#### Scenario: Hidden overseer emits ritual unconditionally
- **WHEN** `FACTION_ECOLOGY_CADENCE_TICKS` ticks have elapsed since last hidden overseer ritual
- **THEN** `RITUAL_ECOSYSTEM_MANIPULATION` MUST be emitted regardless of ecosystem state

#### Scenario: Faction ecology commands produce chronicle narration only in this phase
- **WHEN** any faction ecology command is committed to EventLog
- **THEN** it MUST produce a chronicle narration entry in Chinese
- **AND** it MUST NOT alter any simulation state (goods, animals, buildings) in this phase

### Requirement: Admin UI SHALL display Mythic Ecology section
The admin world observer page SHALL include a "神話生態 Mythic Ecology" section that displays active world events (kind, tile, severity, linked animal, spawn tick) and faction ecology stances (faction id, ecologyStance, last command type, last command tick).

#### Scenario: Active world events visible in admin UI
- **WHEN** a legendary creature is alive and its world event is active
- **THEN** the "神話生態" section MUST display the event kind, tile, and severity

#### Scenario: No active events shows empty state
- **WHEN** no legendary creatures are alive
- **THEN** the section MUST display a placeholder indicating no active mythic events

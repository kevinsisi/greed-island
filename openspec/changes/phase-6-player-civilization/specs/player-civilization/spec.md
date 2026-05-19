# player-civilization Specification

## ADDED Requirements

### Requirement: Player civilization commands SHALL be submitted via a dedicated HTTP endpoint
The server SHALL expose `POST /api/world/player-action` accepting `{ type: string; payload: object }`. The endpoint MUST require a valid JWT. It MUST extract `accountId` from the JWT and set it as `actorId` on the command before calling `runtime.submitCommand()`. It MUST return `{ accepted: true, tick }` on success or `{ accepted: false, reason: string }` on Rule Engine rejection.

#### Scenario: Valid player action accepted
- **WHEN** an authenticated player submits `PLAYER_TRADED_GOODS` with a valid npcId, tileId, and goods list
- **THEN** the endpoint MUST return `{ accepted: true }` and the event MUST appear in the EventLog

#### Scenario: Invalid player action rejected
- **WHEN** an authenticated player submits a command with a missing required field
- **THEN** the endpoint MUST return `{ accepted: false, reason: "<field> required" }` and nothing is written to EventLog

#### Scenario: Unauthenticated request rejected
- **WHEN** a request is made to `/api/world/player-action` without a valid JWT
- **THEN** the endpoint MUST return HTTP 401

### Requirement: Player civilization state SHALL be queryable via a dedicated endpoint
The server SHALL expose `GET /api/world/player-state` requiring a valid JWT. It MUST return the authenticated player's `PlayerCivilizationSnapshot`: wallet balance, hired NPC ids, faction memberships, and claimed tile ids.

#### Scenario: Player state returned for authenticated user
- **WHEN** an authenticated player calls `GET /api/world/player-state`
- **THEN** the response MUST include `wallet`, `hiredNpcIds`, `factionIds`, and `claimedTileIds` fields

#### Scenario: New player returns zero-state snapshot
- **WHEN** a player has issued no civilization commands yet
- **THEN** `GET /api/world/player-state` MUST return `{ wallet: 0, hiredNpcIds: [], factionIds: [], claimedTileIds: [] }`

### Requirement: PlayerCivilizationProjection SHALL track per-account civilization state
`PlayerCivilizationProjection` MUST maintain a map from `accountId` to a `PlayerCivilizationRow` containing:
- `wallet: number` — updated by `PLAYER_TRADED_GOODS` (decrements or increments by goods value)
- `hiredNpcIds: string[]` — updated by `PLAYER_HIRED_NPC` (add) / `PLAYER_DISMISSED_NPC` (remove)
- `factionIds: string[]` — updated by `PLAYER_JOINED_FACTION` (add) / `PLAYER_LEFT_FACTION` (remove)
- `claimedTileIds: string[]` — updated by `PLAYER_CLAIMED_TERRITORY` (add)

It MUST implement `project(event)`, `rebuildFromEvents(events)`, `getByAccount(accountId)`, `snapshot(accountId)`.

#### Scenario: Hired NPC appears in player state
- **WHEN** `PLAYER_HIRED_NPC` event is committed for accountId `"acc-1"` with npcId `"npc_guard_1"`
- **THEN** `projection.getByAccount("acc-1").hiredNpcIds` MUST include `"npc_guard_1"`

#### Scenario: Dismissed NPC removed from player state
- **WHEN** `PLAYER_DISMISSED_NPC` event follows `PLAYER_HIRED_NPC` for the same npcId
- **THEN** `projection.getByAccount("acc-1").hiredNpcIds` MUST NOT include that npcId

#### Scenario: Faction join recorded
- **WHEN** `PLAYER_JOINED_FACTION` event is committed for accountId `"acc-1"` with factionId `"guild"`
- **THEN** `projection.getByAccount("acc-1").factionIds` MUST include `"guild"`

#### Scenario: Territory claim recorded
- **WHEN** `PLAYER_CLAIMED_TERRITORY` event is committed for accountId `"acc-1"` with tileId `"t_salt_marsh"`
- **THEN** `projection.getByAccount("acc-1").claimedTileIds` MUST include `"t_salt_marsh"`

#### Scenario: Boot hydration restores player state
- **GIVEN** an EventLog containing `PLAYER_HIRED_NPC` and `PLAYER_DISMISSED_NPC` events for accountId `"acc-1"`
- **WHEN** `PlayerCivilizationProjection.rebuildFromEvents(events)` is called
- **THEN** `getByAccount("acc-1")` MUST reflect only the net result (dismissed NPC not in list)

### Requirement: PlayerCivilizationProjection SHALL be wired into runtime boot hydration and fan-out
`PlayerCivilizationProjection` MUST be instantiated in `SimulationRuntime`, wired into both the large-log else-branch and the per-event fan-out loop, following the same pattern as `LivestockRegistryProjection`.

#### Scenario: PlayerCivilizationProjection hydrates on boot
- **GIVEN** an EventLog containing player civilization events
- **WHEN** the runtime boots
- **THEN** `GET /api/world/player-state` MUST reflect the correct hydrated state for that account

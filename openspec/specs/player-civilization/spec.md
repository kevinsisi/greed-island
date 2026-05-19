# player-civilization Specification

## Purpose
TBD - created by syncing delta specs from change phase-6-player-civilization. Update Purpose after implementation is complete.

## Requirements

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

### Requirement: Frontend SHALL expose player civilization state via a collapsible panel in HubPage
The web client SHALL provide a `PlayerCivilizationPanel` component mounted in `HubPage`. The panel SHALL display the authenticated player's `wallet`, `hiredNpcIds`, `factionIds`, and `claimedTileIds`. The panel SHALL be toggled by a button in the game shell toolbar.

#### Scenario: Panel shows player state on open
- **WHEN** the authenticated player opens the civilization panel in HubPage
- **THEN** the panel MUST display wallet balance, count of hired NPCs, list of faction memberships, and count of claimed tiles fetched from `GET /api/world/player-state`

#### Scenario: Panel shows zero-state for new player
- **WHEN** a player with no civilization events opens the panel
- **THEN** wallet MUST show 0, hired NPCs MUST show empty, factions MUST show empty, claimed tiles MUST show 0

### Requirement: Frontend SHALL provide `api.playerState(token)` and `api.playerAction(token, type, payload)` client methods
`api.playerState(token)` SHALL call `GET /api/world/player-state` with the JWT and return `PlayerCivilizationSnapshot`. `api.playerAction(token, type, payload)` SHALL call `POST /api/world/player-action` with `{ type, payload }` and return `{ accepted: boolean; tick?: number; reason?: string }`.

#### Scenario: playerState returns snapshot
- **WHEN** `api.playerState(token)` is called with a valid JWT
- **THEN** it MUST return an object with `wallet`, `hiredNpcIds`, `factionIds`, `claimedTileIds`

#### Scenario: playerAction returns accepted result
- **WHEN** `api.playerAction(token, 'PLAYER_CLAIMED_TERRITORY', { tileId: 't_salt_marsh' })` is called with a valid JWT
- **THEN** it MUST return `{ accepted: true, tick: <number> }`

#### Scenario: playerAction surfaces rejection
- **WHEN** `api.playerAction(token, 'PLAYER_CLAIMED_TERRITORY', {})` is called with missing tileId
- **THEN** it MUST return `{ accepted: false, reason: <string> }`

### Requirement: Panel SHALL support PLAYER_CLAIMED_TERRITORY action from current player tile
The panel SHALL display a "Claim This Tile" button. The button SHALL be enabled only when `map.playerTileId` is defined and the tile is not already in `claimedTileIds`. Clicking SHALL submit `PLAYER_CLAIMED_TERRITORY` with `{ tileId: currentTileId }`. On success the panel SHALL refresh player state and show a confirmation. On rejection it SHALL show the reason inline.

#### Scenario: Claim tile accepted
- **WHEN** the player clicks "Claim This Tile" while standing on an unclaimed tile
- **THEN** `PLAYER_CLAIMED_TERRITORY` MUST be submitted with the current `tileId`, state MUST refresh, and the tile MUST appear in `claimedTileIds`

#### Scenario: Claim tile button disabled when tile already claimed
- **WHEN** the player's current tile is already in `claimedTileIds`
- **THEN** the "Claim This Tile" button MUST be disabled

#### Scenario: Claim tile button disabled when player position unknown
- **WHEN** `map.playerTileId` is not yet populated
- **THEN** the "Claim This Tile" button MUST be disabled

### Requirement: Panel SHALL support PLAYER_HIRED_NPC from NPCs in current tile
The panel SHALL show a dropdown of NPCs in the player's current tile (filtered from `WorldStateContext.npcs`) excluding already-hired NPCs. Selecting an NPC and clicking "Hire" SHALL submit `PLAYER_HIRED_NPC` with `{ npcId, tileId }`. State SHALL refresh on success.

#### Scenario: Hire NPC accepted
- **WHEN** the player selects an NPC from the dropdown and clicks "Hire"
- **THEN** `PLAYER_HIRED_NPC` MUST be submitted, player state MUST refresh, and the npcId MUST appear in `hiredNpcIds`

#### Scenario: Hired NPCs excluded from dropdown
- **WHEN** an NPC is already in `hiredNpcIds`
- **THEN** that NPC MUST NOT appear in the hire dropdown

### Requirement: Panel SHALL support PLAYER_JOINED_FACTION and PLAYER_LEFT_FACTION
The panel SHALL derive available faction ids from `world.facts.factionDominance`. For factions the player has not joined, a "Join" button SHALL submit `PLAYER_JOINED_FACTION`. For factions already in `factionIds`, a "Leave" button SHALL submit `PLAYER_LEFT_FACTION`. State SHALL refresh on success.

#### Scenario: Join faction accepted
- **WHEN** the player clicks "Join" for a faction not yet in `factionIds`
- **THEN** `PLAYER_JOINED_FACTION` MUST be submitted with `{ factionId }`, and the faction MUST appear in `factionIds` after refresh

#### Scenario: Leave faction accepted
- **WHEN** the player clicks "Leave" for a faction in `factionIds`
- **THEN** `PLAYER_LEFT_FACTION` MUST be submitted with `{ factionId }`, and the faction MUST NOT appear in `factionIds` after refresh

### Requirement: Panel SHALL support PLAYER_PLAYED_CARD from held cards
The panel SHALL show a dropdown of held cards (from `api.cardsHeld(token)`). Selecting a card and clicking "Play Card" SHALL submit `PLAYER_PLAYED_CARD` with `{ cardId, tileId: currentTileId }`. State SHALL refresh on success.

#### Scenario: Play card accepted
- **WHEN** the player selects a held card and clicks "Play Card"
- **THEN** `PLAYER_PLAYED_CARD` MUST be submitted with `{ cardId, tileId }` and the card MUST no longer appear in held cards after refresh

#### Scenario: Play Card button disabled when no cards held
- **WHEN** the player holds no cards
- **THEN** the Play Card button MUST be disabled

### Requirement: Panel SHALL display inline rejection and error messages
When a `playerAction` call returns `{ accepted: false, reason }`, the panel SHALL display the reason string adjacent to the action that was attempted. When the HTTP call fails, the panel SHALL display a generic error message. Both SHALL auto-clear after 5 seconds or on the next submit attempt.

#### Scenario: Rejection reason shown inline
- **WHEN** an action is rejected with `{ accepted: false, reason: "tileId required" }`
- **THEN** the panel MUST display "tileId required" near the action button that was pressed

#### Scenario: Error clears on next submit
- **WHEN** an error is displayed and the player submits another action
- **THEN** the error MUST clear before the new request completes

# Spec — gm-npc-dashboard capability

GM-or-admin-gated observability over NPC origin, births, households, and explicitly-unimplemented death surface.

## ADDED Requirements

### Requirement: NPC stats endpoint SHALL aggregate origin + lifecycle counts

The server SHALL expose `GET /api/admin/npc-stats` returning a JSON response describing total NPC count, origin breakdown (manual vs autonomously-born), event-driven birth and household counts, and an explicit deaths placeholder.

#### Scenario: Response shape

- **WHEN** an authorised GM or admin requests `GET /api/admin/npc-stats`
- **THEN** the response body MUST contain the keys `totalNpcs`, `byOrigin`, `births`, `households`, `deaths`, `generatedAtTick`
- **AND** `byOrigin` MUST contain `manual` and `born`
- **AND** `births` MUST contain `totalEventCount` and `recent`
- **AND** `households` MUST contain `totalEventCount` and `recent`
- **AND** `deaths` MUST contain `available`, `reason`, and `plannedAt`

#### Scenario: Manual-vs-born classification reflects profile loader

- **GIVEN** the runtime was bootstrapped from N NPC profile JSON files
- **AND** every NPC currently in `runtime.getNpcs()` carries an ID present in those profiles
- **WHEN** the endpoint is called
- **THEN** `byOrigin.manual` MUST equal `totalNpcs`
- **AND** `byOrigin.born` MUST equal `0`

### Requirement: NPC stats endpoint SHALL require GM or admin role

The endpoint MUST reject requests that do not present an authenticated session with role `gm` or `admin`.

#### Scenario: Anonymous request rejected

- **WHEN** a request to `/api/admin/npc-stats` arrives with no auth claims
- **THEN** the server MUST respond `401 UNAUTHORIZED`

#### Scenario: Player role rejected

- **WHEN** an authenticated user with role `player` requests the endpoint
- **THEN** the server MUST respond `403 FORBIDDEN`

#### Scenario: GM and admin roles accepted

- **WHEN** an authenticated user with role `gm` requests the endpoint
- **THEN** the server MUST respond `200 OK` with the documented body
- **AND** the same MUST hold for role `admin`

### Requirement: Deaths surface SHALL be present but explicitly unavailable

The endpoint MUST always include a `deaths` key whose `available` field is `false` until the `NPC_DECEASED` command is implemented. The field is informational so a GM client can render a placeholder rather than appearing broken.

#### Scenario: Deaths placeholder is honest

- **WHEN** the endpoint is called
- **THEN** `deaths.available` MUST be `false`
- **AND** `deaths.reason` MUST be a non-empty human-readable string naming the missing command
- **AND** `deaths.plannedAt` MUST reference the WORLD_CAPABILITIES.md phase that introduces it

### Requirement: Birth and household feeds SHALL list recent events in descending tick order

The endpoint MUST return up to 20 recent `NPC_CHILD_BORN` events and up to 20 recent `NPC_HOUSEHOLD_FORMED` events, ordered newest-first.

#### Scenario: Empty log

- **GIVEN** the EventLog contains zero `NPC_CHILD_BORN` events
- **WHEN** the endpoint is called
- **THEN** `births.totalEventCount` MUST be `0`
- **AND** `births.recent` MUST be an empty array

#### Scenario: Populated log

- **GIVEN** the EventLog contains five `NPC_CHILD_BORN` events at ticks T1 < T2 < T3 < T4 < T5
- **WHEN** the endpoint is called
- **THEN** `births.totalEventCount` MUST equal `5`
- **AND** `births.recent[0].tick` MUST equal `T5`
- **AND** the array MUST be ordered descending by tick

### Requirement: Endpoint SHALL be a read-only projection

The endpoint MUST NOT mutate any simulation state, MUST NOT append events to the EventLog, MUST NOT submit Commands to the Rule Engine, and MUST execute its read queries off the tick path.

#### Scenario: Calling the endpoint does not advance the simulation

- **GIVEN** the current simulation tick is T
- **WHEN** the endpoint is called any number of times
- **THEN** the simulation tick MUST remain T (no `WORLD_TICK` events are emitted by this code path)
- **AND** the EventLog row count MUST be unchanged

### Requirement: Frontend page SHALL render the endpoint payload

The web application MUST register a route `/admin/npcs` that renders the endpoint response.

#### Scenario: Authorised user sees stats

- **WHEN** an authenticated GM or admin navigates to `/admin/npcs`
- **THEN** the page MUST render stat cards for Total / Manual / Born / Births / Households / Deaths placeholder
- **AND** the page MUST render two tables for recent births and recent households

#### Scenario: Unauthorised user blocked

- **WHEN** a player-role or unauthenticated user navigates to `/admin/npcs`
- **THEN** the page MUST render an access-denied panel rather than the dashboard

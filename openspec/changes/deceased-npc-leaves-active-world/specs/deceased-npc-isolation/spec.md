## ADDED Requirements

### Requirement: NpcEngine tick SHALL skip deceased NPCs

`NpcEngine.tick(currentTick, context)` MUST accept an optional `deceasedNpcIds: ReadonlySet<string>` field inside `NpcTickContext`. The main per-profile decisioning loop MUST `continue` to the next profile when `deceasedNpcIds.has(profile.id)` is true. The deceased NPC's `NpcRuntimeState` entry MUST remain in the engine's internal `state` map (frozen at the last value written before death), but MUST NOT be mutated, projected to events, or marked dirty.

#### Scenario: Deceased NPC state stays frozen across many ticks

- **GIVEN** an `NpcEngine` with profiles `['alive_1', 'dead_1']` and an initial state for both
- **AND** `deceasedNpcIds = new Set(['dead_1'])` passed in every tick context
- **WHEN** the engine is ticked 100 times
- **THEN** `engine.getState('dead_1')` MUST return the same `NpcRuntimeState` reference (by value) as it was before tick 0
- **AND** no `NpcDecisionEvent` referencing `dead_1` MUST be emitted across those 100 ticks
- **AND** `engine.getState('alive_1')` MUST have advanced through its normal decisioning

#### Scenario: Empty deceasedNpcIds preserves legacy behavior

- **GIVEN** an `NpcEngine.tick` call with no `deceasedNpcIds` in context (or empty set)
- **WHEN** the engine ticks
- **THEN** every profile MUST be decisioned as before this change

### Requirement: SimulationRuntime SHALL pass deceased ids to NpcEngine on every tick

`SimulationRuntime` MUST, on every `tick()`, build a `deceasedNpcIds` set from `npcMortalityProjection` and include it in the `NpcTickContext` passed into `npcEngine.tick(...)`. Construction of this set MUST be O(deaths) per tick (no full profile scan).

#### Scenario: Newly deceased NPC frozen on next tick

- **GIVEN** a running runtime with one alive NPC `'n1'`
- **WHEN** an `NPC_DECEASED` event for `'n1'` is committed at tick `T`
- **AND** the runtime ticks once more (to tick `T+1`)
- **THEN** the NPC engine MUST NOT advance `'n1'` state on tick `T+1`

### Requirement: runtime.getNpcs() SHALL exclude deceased NPCs by default

`runtime.getNpcs()` MUST filter out NPCs where `npcMortalityProjection.isDeceased(profile.id) === true`. A separate method `runtime.getNpcsIncludingDeceased()` MUST be provided for callers (admin / lineage / chronicle) that need the full set. Existing fields on `SimNpcState` are unchanged; the `deceased: boolean` field MUST remain on the type and be `true` only when accessed via `getNpcsIncludingDeceased()`.

#### Scenario: Living-world client sees only living NPCs

- **GIVEN** a runtime with NPCs `['a', 'b', 'c']` where `'b'` is deceased
- **WHEN** `runtime.getNpcs()` is called
- **THEN** the result MUST contain only entries for `'a'` and `'c'`
- **AND** none of the entries MUST have `deceased: true`

#### Scenario: Admin path explicitly retrieves all NPCs

- **GIVEN** the same runtime as above
- **WHEN** `runtime.getNpcsIncludingDeceased()` is called
- **THEN** the result MUST contain entries for `'a'`, `'b'`, and `'c'`
- **AND** the entry for `'b'` MUST have `deceased: true`

### Requirement: Public /api/npcs SHALL serve only living NPCs

`GET /api/npcs` (router `world.ts`) MUST use `runtime.getNpcs()` (post-filter) and MUST NOT return deceased NPCs. Admin routes (`/api/admin/lineage`, `/api/admin/npc-stats`) MUST use `runtime.getNpcsIncludingDeceased()` when they need to display deceased members.

#### Scenario: Live world endpoint hides deceased

- **GIVEN** the EventLog contains an `NPC_DECEASED` event for `npc.fisher.1`
- **WHEN** `GET /api/npcs` returns
- **THEN** the response array MUST NOT contain an entry with id `'npc.fisher.1'`

#### Scenario: Admin lineage still shows deceased

- **GIVEN** the same EventLog as above
- **WHEN** `GET /api/admin/lineage` returns
- **THEN** any household whose membership includes `'npc.fisher.1'` MUST list that member with `deceased: true`

### Requirement: NPC interaction endpoints SHALL reject deceased NPCs with 410 Gone

The following endpoints MUST, immediately after `findProfile(npcId)` returns a non-null profile, check `npcMortalityProjection.isDeceased(npcId)` and short-circuit with HTTP `410 Gone` + body `{ error: 'NPC_DECEASED', message: '這位 NPC 已經不在世上。' }` when true:

- `POST /api/npc/:npcId/interact`
- `POST /api/npc/:npcId/dialog-hold`
- `GET /api/npc/:npcId/greet`
- `POST /api/npc/intervene` — MUST check **both** `npcA` AND `npcB`; either being deceased returns 410

The following endpoint MUST NOT block on deceased status (read-only memory access is preserved):

- `GET /api/npc/:npcId/history` — returns historical personal events regardless of NPC death state

#### Scenario: Interact with deceased NPC returns 410

- **GIVEN** an `NPC_DECEASED` event for `'npc.x'` is in the EventLog
- **WHEN** the player sends `POST /api/npc/npc.x/interact { message: '...' }`
- **THEN** the response status MUST be `410`
- **AND** the body MUST be `{ error: 'NPC_DECEASED', message: '這位 NPC 已經不在世上。' }`
- **AND** no `personal_event` row MUST be appended
- **AND** no AI / fallback dialog MUST be invoked

#### Scenario: Intervene with one deceased NPC returns 410

- **GIVEN** `npcA = 'alive_1'` and `npcB = 'dead_1'` where only `'dead_1'` is deceased
- **WHEN** `POST /api/npc/intervene { npcA, npcB, mode: 'mediate' }` is called
- **THEN** the response status MUST be `410`
- **AND** the body MUST cite `error: 'NPC_DECEASED'`
- **AND** no `PLAYER_INTERVENE` command MUST be submitted

#### Scenario: History remains accessible after death

- **GIVEN** the player had 5 dialog turns with `'npc.x'` before `'npc.x'` died
- **WHEN** the player sends `GET /api/npc/npc.x/history`
- **THEN** the response status MUST be `200`
- **AND** the response MUST include those 5 historical events

### Requirement: Frontend NPC types SHALL carry the deceased flag

The web-side `ServerNpc` type (in `packages/web/src/api/client.ts`) and `NpcSummary` type (in `packages/web/src/state/types.ts`) MUST both declare a `deceased: boolean` field. The function `toNpcSummary(serverNpc, locale)` MUST copy `serverNpc.deceased` onto the resulting `NpcSummary`. The default value when an older server omits the field MUST be `false` (i.e., back-compat with server versions predating this change).

#### Scenario: toNpcSummary copies deceased

- **GIVEN** a `ServerNpc` with `deceased: true`
- **WHEN** `toNpcSummary(...)` runs
- **THEN** the returned `NpcSummary` MUST have `deceased: true`

#### Scenario: toNpcSummary defaults deceased to false on missing field

- **GIVEN** a `ServerNpc` from a legacy server omitting `deceased`
- **WHEN** `toNpcSummary(...)` runs
- **THEN** the returned `NpcSummary` MUST have `deceased: false`

### Requirement: AreaPage and NpcDialog SHALL refuse to open dialog with a deceased NPC

When a player clicks (or otherwise interacts with) an NPC whose `deceased === true`, the UI MUST NOT open the dialog drawer. A toast / message MUST display `「這位 NPC 已經不在了。」`. If an in-flight `/api/npc/:id/interact` call returns `410 NPC_DECEASED`, the dialog MUST close and the same toast MUST appear.

#### Scenario: Click on dead NPC shows toast

- **GIVEN** a `NpcSummary` rendered in `AreaPage` with `deceased: true`
- **WHEN** the player taps the sprite
- **THEN** the dialog drawer MUST NOT open
- **AND** a toast `「這位 NPC 已經不在了。」` MUST appear

#### Scenario: 410 response from interact closes dialog

- **GIVEN** the dialog is open with `'npc.x'` (UI state was stale; server already knows of death)
- **WHEN** `POST /api/npc/npc.x/interact` returns `410`
- **THEN** the dialog MUST close
- **AND** the `「這位 NPC 已經不在了。」` toast MUST appear


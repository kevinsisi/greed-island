## 1. Living World Commands

- [x] 1.1 Add `PLAYER_PICKED_UP_GOODS`, `PLAYER_TRADED_GOODS`, `PLAYER_HUNTED_ANIMAL`, `PLAYER_FISHED`, `PLAYER_DOMESTICATED_ANIMAL`, `PLAYER_PROTECTED_REGION` to `LIVING_WORLD_COMMAND_TYPES` in `livingWorldCommands.ts`
- [x] 1.2 Add payload types `PlayerPickedUpGoodsCmd`, `PlayerTradedGoodsCmd`, `PlayerHuntedAnimalCmd`, `PlayerFishedCmd`, `PlayerDomesticatedAnimalCmd`, `PlayerProtectedRegionCmd` and add all to `LivingWorldCommandPayload` union
- [x] 1.3 Add `PLAYER_HIRED_NPC`, `PLAYER_DISMISSED_NPC` to `LIVING_WORLD_COMMAND_TYPES`; add payload types `PlayerHiredNpcCmd`, `PlayerDismissedNpcCmd`; add to union
- [x] 1.4 Add `PLAYER_SPONSORED_CONSTRUCTION`, `PLAYER_FOUNDED_SETTLEMENT`, `PLAYER_CLAIMED_TERRITORY` to `LIVING_WORLD_COMMAND_TYPES`; add payload types; add to union
- [x] 1.5 Add `PLAYER_JOINED_FACTION`, `PLAYER_LEFT_FACTION`, `PLAYER_LED_FACTION` to `LIVING_WORLD_COMMAND_TYPES`; add payload types; add to union
- [x] 1.6 Add `PLAYER_PLAYED_CARD` (world-layer) to `LIVING_WORLD_COMMAND_TYPES`; add payload type `PlayerPlayedCardCmd`; add to union
- [x] 1.7 Add validators for all 14 new command types in `VALIDATORS` map — each must validate `playerAccountId` non-empty plus required fields

## 2. PlayerCivilizationProjection

- [x] 2.1 Create `packages/server/src/projections/playerCivilization.ts` — `PlayerCivilizationRow` type (`wallet`, `hiredNpcIds`, `factionIds`, `claimedTileIds`) + `PlayerCivilizationProjection` class
- [x] 2.2 Implement `project(event)` in `PlayerCivilizationProjection`: handle `PLAYER_HIRED_NPC` (push npcId), `PLAYER_DISMISSED_NPC` (filter out), `PLAYER_JOINED_FACTION` (push factionId), `PLAYER_LEFT_FACTION` (filter), `PLAYER_LED_FACTION` (mark), `PLAYER_CLAIMED_TERRITORY` (push tileId)
- [x] 2.3 Implement `rebuildFromEvents(events)`, `getByAccount(accountId)`, `snapshot(accountId)` methods
- [x] 2.4 Write `packages/server/src/projections/playerCivilization.test.ts` — hire → in list, dismiss → removed, join faction → in list, territory claim → in list, boot hydration via rebuildFromEvents

## 3. Runtime Wiring

- [x] 3.1 Instantiate `PlayerCivilizationProjection` as `private readonly playerCivilizationProjection` in `runtime.ts`
- [x] 3.2 Add `this.playerCivilizationProjection.project(ev)` to the per-event fan-out loop in `runtime.ts`
- [x] 3.3 Add `this.playerCivilizationProjection.rebuildFromEvents(...)` to both boot hydration branches (large-log else-branch + full rebuild branch) in `runtime.ts`
- [x] 3.4 Expose `getPlayerCivilizationSnapshot(accountId: string)` method on `SimulationRuntime`

## 4. HTTP API

- [x] 4.1 Create `packages/server/src/http/playerCivilizationRouter.ts` — `POST /api/world/player-action` route: validate JWT, extract accountId, call `runtime.submitCommand({ type, payload: { ...payload, playerAccountId: accountId }, actor: 'player', actorId: accountId })`, return `{ accepted, tick }` or `{ accepted: false, reason }`
- [x] 4.2 Add `GET /api/world/player-state` route to `playerCivilizationRouter.ts`: require JWT, return `runtime.getPlayerCivilizationSnapshot(accountId)`
- [x] 4.3 Write `packages/server/src/http/playerCivilizationRouter.test.ts` — unauthenticated 401, valid PLAYER_HIRED_NPC accepted, missing field rejected, GET player-state returns snapshot
- [x] 4.4 Register `playerCivilizationRouter` in `server.ts`

## 5. Chronicle Pass-through

- [x] 5.1 In `eventToChronicleEvent` in `chronicleRenderer.ts`, ensure all 14 player civilization event types return a `ChronicleEvent` (not null) so they reach the Gemini AI pipeline — the `narration` fallback field MUST be a machine-readable English summary (`"[EVENT_TYPE] actor=X tile=Y"`) used only when Gemini is unavailable; no hardcoded Chinese strings

## 6. Chronicle Hardcoded Chinese Cleanup

- [x] 6.1 In `chronicleRenderer.ts`, replace all 12 existing hardcoded Chinese `narration` strings with machine-readable English fallbacks of the form `"[EVENT_TYPE] key1=val1 key2=val2"`:
  - `LIVESTOCK_SLAUGHTERED` → `"[LIVESTOCK_SLAUGHTERED] settlement={settlementId} species={speciesId}"`
  - `MOUNT_ASSIGNED` → `"[MOUNT_ASSIGNED] npc={npcId}"`
  - `SPECIES_EXTINCT` → `"[SPECIES_EXTINCT] species={speciesId}"`
  - `SPECIES_RECOVERED` → `"[SPECIES_RECOVERED] species={speciesId}"`
  - `LEGENDARY_WORLD_EVENT_SPAWNED` → `"[LEGENDARY_WORLD_EVENT_SPAWNED] species={speciesId} tile={tileId}"`
  - `LEGENDARY_WORLD_EVENT_RESOLVED` → `"[LEGENDARY_WORLD_EVENT_RESOLVED] species={speciesId}"`
  - `LEGENDARY_HUNT_STARTED` → `"[LEGENDARY_HUNT_STARTED] animal={linkedAnimalId} tile={tileId}"`
  - `LEGENDARY_HUNT_CONCLUDED` → `"[LEGENDARY_HUNT_CONCLUDED] animal={linkedAnimalId} outcome={outcome}"`
  - `FOREST_CLEARCUT_ORDERED` → `"[FOREST_CLEARCUT_ORDERED] faction={factionId} tile={tileId}"`
  - `FISHING_QUOTA_ENFORCED` → `"[FISHING_QUOTA_ENFORCED] faction={factionId} tile={tileId}"`
  - `INDUSTRIAL_SITE_SABOTAGED` → `"[INDUSTRIAL_SITE_SABOTAGED] faction={factionId} tile={tileId}"`
  - `RITUAL_ECOSYSTEM_MANIPULATION` → `"[RITUAL_ECOSYSTEM_MANIPULATION] faction={factionId}"`

## 7. Verification

- [x] 7.1 Run `npm run build` (root) — confirm zero TypeScript errors
- [x] 7.2 Run `npm test --workspace=packages/server` — all tests pass including new playerCivilization projection + router tests
- [x] 7.3 Docker smoke test: rebuild local stack, call `POST /api/world/player-action` with `PLAYER_CLAIMED_TERRITORY`, confirm `GET /api/world/player-state` returns the claimed tile
- [x] 7.4 Update `PROGRESS.md` with v0.30.0 handoff evidence
- [x] 7.5 Update `ROADMAP.md` with v0.30.0 entry

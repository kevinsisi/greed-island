## Why

Phase 6 (v0.30.0) shipped `POST /api/world/player-action` and `GET /api/world/player-state` backend APIs, but no frontend panel exposes them. Players cannot currently perform any civilization actions — claim territory, hire NPCs, join factions, or play world-layer cards — from the game UI, making the entire Phase 6 backend invisible to players.

## What Changes

- New `api/client.ts` methods: `playerAction(token, type, payload)` and `playerState(token)`
- New `PlayerCivilizationPanel` component: shows wallet, hired NPCs, faction memberships, claimed tiles; exposes action buttons for the 4 highest-value player actions
- Panel added to `HubPage` as a collapsible side-panel (toggled by a button in the existing game shell toolbar)
- Panel auto-refreshes player state after each accepted action
- Error and rejection states surfaced inline (no silent failures)

Supported player actions in this change:
- `PLAYER_CLAIMED_TERRITORY` — claim a tile the player is currently standing on
- `PLAYER_HIRED_NPC` — hire an NPC visible in the current tile
- `PLAYER_JOINED_FACTION` / `PLAYER_LEFT_FACTION` — join or leave a faction
- `PLAYER_PLAYED_CARD` — play a held card as a world-layer operator (passes cardId + tileId)

Actions not exposed in this change (complex parameter collection deferred): `PLAYER_TRADED_GOODS`, `PLAYER_HUNTED_ANIMAL`, `PLAYER_FISHED`, `PLAYER_DOMESTICATED_ANIMAL`, `PLAYER_PROTECTED_REGION`, `PLAYER_SPONSORED_CONSTRUCTION`, `PLAYER_DISMISSED_NPC`, `PLAYER_FOUNDED_SETTLEMENT`, `PLAYER_LED_FACTION`.

## Capabilities

### New Capabilities
- `player-civilization-ui`: Frontend panel for viewing player civilization state and submitting core civilization actions via `POST /api/world/player-action`.

### Modified Capabilities

## Impact

- `packages/web/src/api/client.ts` — 2 new methods + 2 new response types
- `packages/web/src/components/game/PlayerCivilizationPanel.tsx` — new component (~150 lines)
- `packages/web/src/pages/HubPage.tsx` — panel toggle button + panel mount
- `packages/web/src/i18n/index.tsx` — ~8 new translation keys (en + zh)
- No backend changes; no new API routes; no schema migrations

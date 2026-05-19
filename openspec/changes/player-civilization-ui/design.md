## Context

Phase 6 shipped two backend endpoints (`POST /api/world/player-action`, `GET /api/world/player-state`) and a `PlayerCivilizationProjection` that tracks wallet, hired NPCs, faction memberships, and claimed tiles per account. The frontend (`HubPage`, `AreaPage`) has no awareness of these APIs. The existing `api/client.ts` already handles JWT-authenticated requests, and `useAuth()` supplies the token.

HubPage is the player's primary map view. It already hosts `NpcDialog`, `SinceLastVisitPanel`, `CardDropPanel`, and `PhaserGame`. The layout is: Phaser canvas at top, toolbar + nav below.

## Goals / Non-Goals

**Goals:**
- Expose `playerState` readable in HubPage (wallet, hired NPCs, factions, claimed tiles)
- Let the player submit the 4 core civilization actions from the panel
- Surface accepted / rejected / error feedback inline
- State auto-refreshes after each accepted submit

**Non-Goals:**
- Complex parameter-collection flows (trade, hunt, fish, found settlement) — deferred
- AreaPage integration — HubPage only for now
- Animated transitions or Phaser canvas overlay

## Decisions

**D1 — Panel placement: collapsible side-panel in HubPage, not a new route.**
A dedicated `/player-state` route would require navigation away from the map. A panel keeps the spatial context (player sees the map + their state simultaneously). Existing panels (`SinceLastVisitPanel`, `NpcDialog`) confirm this pattern works.

**D2 — State ownership: local `useState` + `useEffect` poll in the panel, not `WorldStateContext`.**
`WorldStateContext` aggregates world SSE data (NPCs, map, events). Player civilization state is per-account, not world-broadcast. Mixing them would couple the context to auth state. The panel fetches independently via `api.playerState(token)`, refreshing on mount and after each successful action. Poll interval: none (on-demand only — player state changes only on explicit action).

**D3 — Action parameters sourced from current game context, not freeform inputs.**
- `PLAYER_CLAIMED_TERRITORY`: `tileId` = current player position tileId (from `WorldStateContext.map`)
- `PLAYER_HIRED_NPC`: shows a dropdown of NPCs currently visible in the player's tile (from `WorldStateContext.npcs`, filtered by tileId)
- `PLAYER_JOINED_FACTION` / `PLAYER_LEFT_FACTION`: faction ids derived from `world.facts.factionDominance` (already in WorldStateContext)
- `PLAYER_PLAYED_CARD`: shows held cards dropdown (from existing `api.cardsHeld(token)`)

This avoids freeform string inputs that could generate bad payloads.

**D4 — Rejection message displayed inline, no toast/modal.**
The backend returns `{ accepted: false, reason: string }`. Display the reason below the action button that was pressed. Auto-clear after 5 seconds or on next submit.

**D5 — New i18n keys added to `i18n/index.tsx` under `playerCiv.*` namespace.**
Follows existing key pattern (`npcDialog.*`, `cardDrop.*`).

## Risks / Trade-offs

- **Risk: Player position tileId may be undefined on first load** → Mitigation: disable `PLAYER_CLAIMED_TERRITORY` button until `map.playerTileId` is populated.
- **Risk: NPC list in tile may include NPCs already hired** → Mitigation: filter out npcIds already in `playerState.hiredNpcIds`.
- **Risk: `world.facts.factionDominance` shape may not expose all faction ids** → Mitigation: derive faction id list from `Object.keys(world.facts.factionDominance ?? {})`.

## Migration Plan

No backend changes. Frontend-only addition. No migration required. Deploy via standard Docker rebuild.

## Open Questions

None — all parameters derivable from existing context sources.

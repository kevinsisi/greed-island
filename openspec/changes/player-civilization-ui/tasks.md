## 1. API Client

- [x] 1.1 Add `PlayerCivilizationSnapshot` type to `packages/web/src/api/client.ts` (`wallet`, `hiredNpcIds`, `factionIds`, `claimedTileIds`)
- [x] 1.2 Add `PlayerActionResult` type to `api/client.ts` (`accepted`, `tick?`, `reason?`)
- [x] 1.3 Add `api.playerState(token)` method calling `GET /api/world/player-state`
- [x] 1.4 Add `api.playerAction(token, type, payload)` method calling `POST /api/world/player-action`

## 2. i18n Keys

- [x] 2.1 Add `playerCiv.panel_title`, `playerCiv.wallet`, `playerCiv.hired_npcs`, `playerCiv.factions`, `playerCiv.claimed_tiles` translation keys (zh + en) to `packages/web/src/i18n/index.tsx`
- [x] 2.2 Add `playerCiv.claim_tile`, `playerCiv.hire_npc`, `playerCiv.join_faction`, `playerCiv.leave_faction`, `playerCiv.play_card` action label keys (zh + en)

## 3. PlayerCivilizationPanel Component

- [x] 3.1 Create `packages/web/src/components/game/PlayerCivilizationPanel.tsx` with props `{ tileId: string | null; onClose: () => void }`
- [x] 3.2 Implement `usePlayerCivState` hook inside the component: fetches `api.playerState(token)` on mount; exposes `state`, `loading`, `error`, and `refresh()`
- [x] 3.3 Render player state summary section: wallet balance, hired NPC count, faction list, claimed tile count
- [x] 3.4 Implement "Claim This Tile" button: disabled when `tileId` is null or already claimed; submits `PLAYER_CLAIMED_TERRITORY`; calls `refresh()` on accepted; shows rejection reason inline
- [x] 3.5 Implement "Hire NPC" section: dropdown of NPCs in current tile (from `WorldStateContext.npcs` filtered by `tileId`, excluding already-hired); "Hire" button submits `PLAYER_HIRED_NPC`; refreshes on accepted
- [x] 3.6 Implement faction section: list each faction from `world.facts.factionDominance` keys; "Join" for unjoined factions, "Leave" for joined; submits `PLAYER_JOINED/LEFT_FACTION`; refreshes on accepted
- [x] 3.7 Implement "Play Card" section: dropdown from `api.cardsHeld(token)`; "Play Card" submits `PLAYER_PLAYED_CARD` with `{ cardId, tileId }`; button disabled when no held cards; refreshes on accepted
- [x] 3.8 Implement inline error/rejection display: show reason near the action button; auto-clear after 5 seconds or on next submit

## 4. HubPage Integration

- [x] 4.1 Add civilization panel toggle state (`showCivPanel`) to `HubPage`
- [x] 4.2 Add a toggle button in the HubPage toolbar (below map, alongside existing nav elements) that opens/closes the panel
- [x] 4.3 Conditionally render `<PlayerCivilizationPanel>` in HubPage, passing current `tileId` from player position and `onClose` callback

## 5. Verification

- [x] 5.1 `npm run build` — zero TypeScript errors in both packages
- [ ] 5.2 Smoke-test in browser: open HubPage → toggle civ panel → panel shows player state
- [ ] 5.3 Smoke-test: click "Claim This Tile" → `{ accepted: true }` → tile appears in claimed tiles list
- [ ] 5.4 Smoke-test: hire an NPC from dropdown → NPC appears in hired list
- [ ] 5.5 Smoke-test: join and leave a faction → faction appears / disappears from list
- [x] 5.6 Update `PROGRESS.md` with v0.31.0 handoff entry
- [x] 5.7 Update `ROADMAP.md` with v0.31.0 entry

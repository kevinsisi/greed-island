# Tasks — Authoritative Character Avatars

> Purpose: replace square/pixel character markers with humanoid avatars without introducing fake life or frontend authority.

## 0. Planning

- [x] 0.1 Inspect current Hub/Area/Building rendering paths for NPC and player markers.
- [x] 0.2 Confirm available authoritative NPC state and player presence fields.
- [x] 0.3 Confirm no committed humanoid sprite/atlas assets exist, so first slice should be procedural.
- [x] 0.4 Create OpenSpec change `authoritative-character-avatars`.

## 1. Slice 1 — Pure visual projection and renderer foundation

- [x] 1.1 Add `CharacterVisualState` and pure mapping helpers for NPC, local player, and peer player render states.
- [x] 1.2 Map NPC `activity` to visual action without inventing activity; missing/unknown activity falls back to `idle`.
- [x] 1.3 Mark player visual actions with source (`local-input` or `server-player-presence`) so they are not confused with simulation authority.
- [x] 1.4 Add tests for NPC activity mapping, player walk/idle derivation, and source labeling.
- [x] 1.5 Add a reusable procedural humanoid avatar factory for Phaser scenes without changing existing scene behavior yet.

## 2. Slice 2 — Area scene avatars

- [x] 2.1 Replace Area NPC square textures with humanoid avatars driven by `AreaMapNpc.activity`, `color`, `mood`, and `health`.
- [x] 2.2 Replace Area local player square with the same humanoid system using local input-derived `walk/idle` only.
- [x] 2.3 Replace Area peer player rectangles with humanoid avatars using server presence coordinates and position-delta `walk/idle` only.
- [x] 2.4 Preserve interaction radius, click handling, labels, health hints, open-water hints, and no-outdoor-duplicate behavior.
- [x] 2.5 Tests/build: existing `npcProjection` tests remain green; add focused visual-state tests for Area inputs.

## 3. Slice 3 — Building scene avatars

- [x] 3.1 Replace Building local player square with humanoid avatar.
- [x] 3.2 Replace Building occupant NPC square textures with humanoid avatars driven by occupant activity and color.
- [x] 3.3 Preserve owner outline/owner affordance, interaction, exit handling, and labels.
- [x] 3.4 Tests/build: focused Building scene typecheck/build remains green.

## 4. Slice 4 — Hub scene avatars without fake crowds

- [x] 4.1 Replace Hub local player square with humanoid avatar.
- [x] 4.2 Replace Hub peer player rectangles with humanoid avatars using social presence coordinates only.
- [x] 4.3 Replace routed travelling NPC square sprites with humanoid walk avatars driven only by `activity=move` + `travelRoute`.
- [x] 4.4 Confirm Hub still does not render local-area NPCs, building occupants, fake people, fake crowds, or decorative activity actors.
- [x] 4.5 Tests/build: `hubMapNpcs` tests remain green and no fake actor paths are added.

## 5. Slice 5 — Verification, docs, release follow-through

- [x] 5.1 `npx openspec validate --all --strict` passes.
- [x] 5.2 Full `npm test` passes.
- [x] 5.3 `npm run build` passes; known Vite chunk warning is acceptable.
- [x] 5.4 Update `PROGRESS.md` with implementation status, verification evidence, CI/CD/deploy state, and remaining blockers.
- [x] 5.5 Commit, push, wait for CI/CD, and live-smoke before reporting runtime success.

## Current Progress

- Planning/inspection complete.
- Slice 1 implementation complete: pure `CharacterVisualState` helpers, source-labelled player visual derivation, focused tests, and an unwired procedural Phaser avatar factory.
- Slice 2 implementation complete: Area NPC, local player, and peer player visuals now use humanoid avatars while retaining existing authoritative positions and interaction rules.
- Slice 3 implementation complete: Building local player and occupant NPC visuals now use humanoid avatars while retaining owner affordance, interaction, exit handling, and labels.
- Slice 4 implementation complete: Hub local player, peer players, and routed travelling NPC visuals now use humanoid avatars without adding fake crowds, fake pedestrians, decorative activity actors, or frontend-invented NPC action.
- Release follow-through complete: commit pushed, CI/CD passed, deploy completed, and live smoke confirmed `0.24.18`, tick advancement, clean recent logs, and Hub/Area/Building humanoid avatar rendering.

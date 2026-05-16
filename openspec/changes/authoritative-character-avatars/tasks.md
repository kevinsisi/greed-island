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

- [ ] 3.1 Replace Building local player square with humanoid avatar.
- [ ] 3.2 Replace Building occupant NPC square textures with humanoid avatars driven by occupant activity and color.
- [ ] 3.3 Preserve owner outline/owner affordance, interaction, exit handling, and labels.
- [ ] 3.4 Tests/build: focused Building scene typecheck/build remains green.

## 4. Slice 4 — Hub scene avatars without fake crowds

- [ ] 4.1 Replace Hub local player square with humanoid avatar.
- [ ] 4.2 Replace Hub peer player rectangles with humanoid avatars using social presence coordinates only.
- [ ] 4.3 Replace routed travelling NPC square sprites with humanoid walk avatars driven only by `activity=move` + `travelRoute`.
- [ ] 4.4 Confirm Hub still does not render local-area NPCs, building occupants, fake people, fake crowds, or decorative activity actors.
- [ ] 4.5 Tests/build: `hubMapNpcs` tests remain green and no fake actor paths are added.

## 5. Slice 5 — Verification, docs, release follow-through

- [ ] 5.1 `npx openspec validate --all --strict` passes.
- [ ] 5.2 Full `npm test` passes.
- [ ] 5.3 `npm run build` passes; known Vite chunk warning is acceptable.
- [ ] 5.4 Update `PROGRESS.md` with implementation status, verification evidence, CI/CD/deploy state, and remaining blockers.
- [ ] 5.5 Commit, push, wait for CI/CD, and live-smoke before reporting runtime success.

## Current Progress

- Planning/inspection complete.
- Slice 1 implementation complete: pure `CharacterVisualState` helpers, source-labelled player visual derivation, focused tests, and an unwired procedural Phaser avatar factory.
- Slice 2 implementation complete: Area NPC, local player, and peer player visuals now use humanoid avatars while retaining existing authoritative positions and interaction rules.
- Next actionable slice: `3.1` replace Building scene local player square with the humanoid avatar system.

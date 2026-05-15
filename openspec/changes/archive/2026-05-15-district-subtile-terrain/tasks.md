# Tasks — District Sub-tile Terrain (Sprint 4)

## 1. Terrain mask module

- [x] 1.1 Create `packages/web/src/game/terrainMask.ts` exporting
  `SubcellTerrain` union, `terrainMaskForDistrict(districtId)`,
  `isWalkableTerrain(terrain)`, and the per-district hand-authored
  mask blueprints.
- [x] 1.2 Define COLOR_FOR_TERRAIN table mapping terrain → 24-bit RGB.
- [x] 1.3 Defensive runtime check: malformed mask falls back to
  "full land".
- [x] 1.4 Unit tests:
  - `terrainMaskForDistrict('t_central')` returns `null`.
  - `terrainMaskForDistrict('t_dock')` returns a 10×15 array.
  - `isWalkableTerrain` returns false only for `'open_water'`.
  - Defensive fallback for malformed rows.

## 2. AreaScene background

- [x] 2.1 In `AreaScene.drawBackground()`, when a mask exists for the
  current `tileId`, paint each sub-cell using its mask color instead
  of the single district color. Land districts unchanged.
- [x] 2.2 Keep the existing grid texture (alternating shade pattern)
  but layer it under the per-cell color so the "tile feel" stays.

## 3. Walkability gate

- [x] 3.1 Add `AreaScene.isAreaWalkable(x, y): boolean` that looks up
  the mask at `(col, row)` derived from pixel coords.
- [x] 3.2 Wire the gate into player physics: in `update()`, after
  computing the next intended position, if `isAreaWalkable(nextX,
  nextY)` is false, zero out the velocity on the offending axis.
- [x] 3.3 Pointer target: when the player taps a pixel, reject the
  target if it is not walkable (no quiet drift).

## 4. NPC sprite hint

- [x] 4.1 After spawning each NPC sprite in AreaScene, if the NPC's
  sub-cell falls on `open_water`, set the sprite alpha to 0.85 and
  attach a small `⛵` text-glyph above its name label.

## 5. Documentation + version

- [x] 5.1 Bump versions to `0.23.0`.
- [x] 5.2 Update `ROADMAP.md` and `PROGRESS.md`.

## 6. Verification gate

- [x] 6.1 `npm run build:server` clean.
- [x] 6.2 `npm run build:web` clean.
- [x] 6.3 `npm test` (server + web) passes; new terrainMask tests
  added.
- [x] 6.4 `npx openspec validate district-subtile-terrain --strict` passes.
- [x] 6.5 `npx openspec validate --all --strict` passes.

## 7. Commit / push / CI / archive

- [x] 7.1 Commit `feat(visibility): Sprint 4 — district sub-tile
  terrain mask (water-biome districts)`.
- [x] 7.2 Push; watch CI + Deploy Dev to success.
- [x] 7.3 Sync delta into main capability spec; archive the change.

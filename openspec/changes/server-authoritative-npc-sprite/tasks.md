## 1. Backend — sub-tile in NpcRuntimeState

- [x] 1.1 Extend `NpcRuntimeState` with `subCol` / `subRow` and update
  the `npc.state.<id>` JSON dump shape comment.
- [x] 1.2 Add deterministic helpers in `npcEngine.ts`:
  `initialSubTile`, `entrySubTile`, `subAnchor`, `stepToward`,
  `hashStr`, `clampInt`. All purely functions of
  `(npcId, tile, activity, tick)`.
- [x] 1.3 Update `decideNextState` to step at most one sub-cell per
  tick toward the active anchor, or reset to an edge cell on tile
  arrival.
- [x] 1.4 Update `hydrate` to gracefully default missing
  `subCol/subRow` to deterministic values.
- [x] 1.5 Include `subCol/subRow` in `statesEqual` so genuine
  movement triggers a FactSet write.
- [x] 1.6 Tests: deterministic init, ≤1 sub-cell per tick, dirty-set
  emission while drifting toward an anchor.

## 2. Backend — runtime / API surface

- [x] 2.1 Extend `SimNpcState` with `subCol`, `subRow`, `color`.
- [x] 2.2 Implement `deriveNpcColor(npcId, faction)` using a
  faction-keyed HSL palette + per-id hue/lightness jitter; convert
  to 24-bit RGB.
- [x] 2.3 Update `runtime.getNpcs()` to populate the new fields.

## 3. Frontend — types

- [x] 3.1 Add optional `subCol`, `subRow`, `color` to
  `ServerNpc` (`api/client.ts`) and `NpcSummary`
  (`state/types.ts`).
- [x] 3.2 Map them through `WorldStateContext.toNpcSummary`.

## 4. Frontend — AreaScene rendering

- [x] 4.1 Add `AreaNpcActivity` enum to `AreaScene` and extend
  `AreaMapNpc` with `subCol`, `subRow`, `color`, `activity`.
- [x] 4.2 Rewrite `refreshNpcSprites` to position from
  `(subCol, subRow)`, drop the wander tween, smooth-move via a
  single ≈4.5 s tween between authoritative positions.
- [x] 4.3 Per-NPC `makeNpcTexture(id, color)` cache + auto-recoloured
  badge text via `textColorForBg`.
- [x] 4.4 Activity-icon emoji overlay (`activityGlyphFor`) pinned to
  the sprite's upper-right corner.
- [x] 4.5 Drop `npcTextureKey` and the unused `NPC_BADGE_COLOR /
  NPC_BADGE_TEXT` imports.
- [x] 4.6 `AreaPage.mapNpcs` passes the new fields with sane
  fallbacks for older payloads.

## 5. Architecture + memory

- [x] 5.1 Update `ARCHITECTURE.md` §3 — declare area sub-tile is
  server-authoritative, list the rendering attributes derived from
  server state, forbid frontend wander tweens.
- [x] 5.2 Update auto-memory `project_deploy_state.md` with the new
  rendering contract.

## 6. Verification + deploy

- [x] 6.1 `npm run build` clean (server tsc + web vite).
- [x] 6.2 `npm test` — all 80 server tests green, including the 3
  new `npcEngine` cases.
- [ ] 6.3 Commit on `claude/eager-shamir-ac61ee`, fast-forward merge
  to `main`, push.
- [ ] 6.4 Rebuild docker image on the desktop host so the Tailscale
  endpoint serves the new payload.

## 7. SSE projection freshness

- [x] 7.1 Emit a world `snapshot` on `/events/stream` after every simulation
  tick so authoritative projection changes do not depend on narrative events.
- [x] 7.2 Refresh the authenticated `/npcs` projection from the frontend when
  an SSE snapshot arrives, keeping NPC positions/building state on tick cadence.
- [x] 7.3 Keep polling as a slower fallback rather than the primary NPC
  movement delivery path.
- [x] 7.4 Guard living-world projection bootstrap with table-level row counts
  so deploy restarts do not rebuild NPC projections on every boot.
- [x] 7.5 Hydrate runtime state from latest FACT_SET rows and recent events
  instead of reducing the full event log synchronously during production boot.
- [x] 7.6 Prefer HTTP availability on large production event logs by skipping
  expensive boot hydration and allowing new ticks to continue from metadata.

# Tasks — GM NPC Dashboard

## 1. EventStore extension

- [ ] 1.1 Add `countEventsByKind(kind: string): number` to `SqliteEventStore`; SELECT COUNT(*) bound to existing `idx_event_log_type` index.
- [ ] 1.2 Add focused unit test in `kernel.test.ts` (or eventStore-specific test if it exists) covering: empty log → 0; mixed kinds → correct per-kind count.

## 2. Runtime extension

- [ ] 2.1 Add `getManualNpcIds(): readonly string[]` to `SimulationRuntime`; returns `this.profiles.map(p => p.id)` (frozen array).
- [ ] 2.2 Add focused unit test asserting the result count matches loaded profile count and contains expected sample IDs.

## 3. Backend endpoint

- [ ] 3.1 Create `packages/server/src/http/adminNpcsRouter.ts` exporting `createAdminNpcsRouter({ runtime, eventStore, accounts, authConfig })`.
- [ ] 3.2 Implement `GET /api/admin/npc-stats` using `requireRole(authConfig, accounts, 'gm', 'admin')`.
- [ ] 3.3 Aggregate response:
  - `totalNpcs = runtime.getNpcs().length`
  - `manualNpcIds = new Set(runtime.getManualNpcIds())`
  - `manual = npcs.filter(n => manualNpcIds.has(n.id)).length`
  - `born = totalNpcs - manual`
  - `births.totalEventCount = eventStore.countEventsByKind('NPC_CHILD_BORN')`
  - `births.recent` = last 20 events of that kind (descending by tick)
  - `households.totalEventCount = eventStore.countEventsByKind('NPC_HOUSEHOLD_FORMED')`
  - `households.recent` = last 20 events of that kind
  - `deaths = { available: false, reason: 'NPC_DECEASED command not yet implemented', plannedAt: 'WORLD_CAPABILITIES.md §35.2 Phase 5' }`
  - `generatedAtTick = runtime.getSnapshot().tick`
- [ ] 3.4 Wire into `createHttpApp` in `packages/server/src/http/server.ts`.
- [ ] 3.5 Add focused router test covering: 401 anonymous, 403 player role, 200 GM role, 200 admin role, shape assertion.

## 4. Frontend page

- [ ] 4.1 Add API client method `api.adminNpcStats(token)` in `packages/web/src/api/client.ts` plus typed response.
- [ ] 4.2 Create `packages/web/src/pages/AdminNpcsPage.tsx` rendering:
  - Stats cards (Total / Manual / Born / Births event count / Households event count / Deaths placeholder).
  - Births table: tick / NPC ID / parent IDs / tile.
  - Households table: tick / household ID / member IDs / tile.
  - "Deaths" panel: greyed out, with `deaths.reason` + `deaths.plannedAt` shown explicitly.
  - 403 fallback for non-GM/admin users.
- [ ] 4.3 Register `/admin/npcs` route in `App.tsx`.
- [ ] 4.4 Add nav link on existing `AdminPage.tsx`.
- [ ] 4.5 Add i18n keys for the new page (zh + en).

## 5. Verification

- [ ] 5.1 `npm test` passes (server + web).
- [ ] 5.2 `npm run build:server` and `npm run build:web` pass.
- [ ] 5.3 `npx openspec validate gm-npc-dashboard --strict` passes.
- [ ] 5.4 Update `PROGRESS.md` with this slice (version bump optional — pure additive observability).
- [ ] 5.5 Update `ROADMAP.md` with the new release entry.
- [ ] 5.6 Commit + push.
- [ ] 5.7 Verify CI + Deploy Dev success.
- [ ] 5.8 Live smoke: `curl -H "Authorization: Bearer <token>" https://hunter.sisihome.org/api/admin/npc-stats` returns expected shape; browse `/admin/npcs` and confirm stats render.

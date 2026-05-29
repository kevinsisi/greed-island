## 1. Audit current runtime.getNpcs() callers

- [x] 1.1 Grep all `runtime.getNpcs()` and `.getNpcs()` usages across `packages/server/src` — for each, decide whether it needs only living NPCs or the full set including deceased
- [x] 1.2 List internal callers that need the full set (anticipated: `combat`, AI dialog `allProfiles`, household-related queries, chronicle, admin routers) — write them down in a comment block at the top of `runtime.ts` near `getNpcs()`

## 2. Runtime — split getNpcs vs getNpcsIncludingDeceased

- [x] 2.1 In `packages/server/src/sim/runtime.ts`: rename current `getNpcs()` body to `getNpcsIncludingDeceased()`; make `getNpcs()` filter out deceased via `npcMortalityProjection.isDeceased`
- [x] 2.2 Update internal callers identified in 1.1 — admin lineage / npc-stats / chronicle / combat must use `getNpcsIncludingDeceased`; public world / player dialog grounding must use `getNpcs`
- [x] 2.3 Add unit test in `runtime.test.ts` or new `runtimeDeceasedFilter.test.ts`: build runtime with one alive + one deceased NPC, assert `getNpcs()` excludes the deceased and `getNpcsIncludingDeceased()` includes it with `deceased: true`

## 3. NpcEngine — skip deceased in tick loop

- [x] 3.1 In `packages/server/src/sim/npcEngine.ts`: extend `NpcTickContext` with `deceasedNpcIds?: ReadonlySet<string>`
- [x] 3.2 In `NpcEngine.tick`, main `for (const profile of this.profiles)` loop: first line `if (context?.deceasedNpcIds?.has(profile.id)) continue`
- [x] 3.3 In `runtime.tick()` (or wherever `npcEngine.tick(currentTick, context)` is called): build `deceasedNpcIds` from the mortality projection and include in context
- [x] 3.4 Write `npcEngine.test.ts` cases: "deceased NPC state stays frozen across many ticks", "empty deceasedNpcIds preserves legacy behavior"

## 4. HTTP — npc.ts interaction endpoints

- [x] 4.1 In `packages/server/src/http/npc.ts`: add helper `requireLivingNpc(runtime, npcId, res): NpcProfile | null` that returns the profile if alive, else writes `410 Gone { error: 'NPC_DECEASED', message: '這位 NPC 已經不在世上。' }` and returns null
- [x] 4.2 Refactor `POST /npc/:npcId/interact` to use `requireLivingNpc`
- [x] 4.3 Refactor `POST /npc/:npcId/dialog-hold` to use `requireLivingNpc`
- [x] 4.4 Refactor `GET /npc/:npcId/greet` to use `requireLivingNpc`
- [x] 4.5 Refactor `POST /npc/intervene` to call `requireLivingNpc` for **both** `npcA` and `npcB`; return `410` if either is deceased
- [x] 4.6 Leave `GET /npc/:npcId/history` unchanged (read-only memory remains accessible)
- [x] 4.7 Write integration tests in `npc.test.ts` (or new `npcDeceasedGate.test.ts`): each endpoint returns 410 for deceased NPC, history endpoint still returns 200

## 5. Frontend — type propagation

- [x] 5.1 `packages/web/src/api/client.ts`: add `deceased: boolean` to `ServerNpc` type (default false on type-level missing)
- [x] 5.2 `packages/web/src/state/types.ts`: add `deceased: boolean` to `NpcSummary`
- [x] 5.3 `packages/web/src/state/WorldStateContext.tsx`: in `toNpcSummary` copy `deceased: npc.deceased ?? false`
- [x] 5.4 `packages/web/src/state/fixtures.ts`: add `deceased: false` to every fixture NPC entry

## 6. Frontend — render filter + dialog gate

- [x] 6.1 `WorldStateContext.tsx` `npcs` derivation: optionally `.filter((n) => !n.deceased)` for the live world view (or document why both server filtering + client filtering coexist as defense-in-depth)
- [x] 6.2 `packages/web/src/pages/AreaPage.tsx`: clicking a sprite whose `deceased === true` (race window) MUST show toast `「這位 NPC 已經不在了。」` and NOT open the dialog
- [x] 6.3 `packages/web/src/components/game/NpcDialog.tsx`: on `ApiError` with status `410` and body `error === 'NPC_DECEASED'`, close dialog and show the same toast
- [x] 6.4 Write a small Vitest UI test for `toNpcSummary` carrying `deceased`

## 7. Replay / canonical-hash safety

- [x] 7.1 Add `runtimeDeceasedHashStability.test.ts`: build an EventLog with an `NPC_DECEASED` event mid-stream; rebuild from log; assert the canonical hash of `lifeExpansion`, `npcStateProjection`, `bornNpcsProjection` are stable
- [x] 7.2 Confirm `NPC_DECEASED` is already in mortality projection's boot event types (no change expected — just verify)

## 8. Documentation + Memory

- [x] 8.1 Update `PROGRESS.md` with v0.87.3 handoff snapshot covering: what was broken (player could chat with dead NPCs), what was fixed (7 surfaces gated), verification evidence
- [x] 8.2 Update `ROADMAP.md` with the v0.87.3 hotfix entry
- [x] 8.3 Add `CLAUDE.md` rule (or extend existing NPC-as-person section) — "Death must propagate end-to-end: sim tick gate + getNpcs filter + interaction 410 + UI render filter. Any new NPC consumer MUST pick its semantics (alive-only vs all)."
- [x] 8.4 Save auto-memory `project_deceased_npc_isolation_v0873.md` + index in `MEMORY.md`

## 9. Verification + Ship

- [x] 9.1 `npm --workspace packages/server exec vitest run` — all server tests pass; new tests included
- [x] 9.2 `npm --workspace packages/web exec vitest run` — all web tests pass
- [x] 9.3 `npm run build` — server + web build clean
- [x] 9.4 `npx openspec validate --all --strict` — pass
- [x] 9.5 Local smoke: trigger an NPC death via admin sim advance / mortality test fixture; confirm `/api/npcs` no longer contains them, `/api/npc/:id/interact` returns 410, UI shows toast on click
- [x] 9.6 Bump version to `0.87.3`; commit each task group; push the final version-bump when verification is green

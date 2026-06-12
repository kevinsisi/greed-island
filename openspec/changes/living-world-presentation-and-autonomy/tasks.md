## 1. Character Visual Presentation (web)

- [x] 1.1 Rewrite `packages/web/src/game/characterAvatar.ts`: shadow + rig + seeded skin/hair/pants + eyes + joint origins, keeping `ProceduralAvatar` / `applyProceduralAvatarPose` contracts
- [x] 1.2 Continuous action animator on scene UPDATE with per-id phase offset; unregister on container destroy
- [x] 1.3 Verify all three scenes compile unchanged (`npm --workspace packages/web run build`)

## 2. Card Art Fallback (web)

- [x] 2.1 Create `packages/web/src/components/game/cardArt.tsx` (mulberry32-seeded SVG, 10 category motifs, rank frames)
- [x] 2.2 `CardImage` fallback chain: imageUrl → CardArt(cardId) → rank square
- [x] 2.3 Wire `cardId` through CodexPage (grid + detail), CardDropPanel (drops + held), AdminCardsPage

## 3. NPC Life Goal Grounding (server)

- [x] 3.1 `projections/lifeGoals.ts`: LifeGoalsProjection + formatLifeGoalContext + LIFE_GOALS_BOOT_EVENT_TYPES
- [x] 3.2 Runtime wiring: live `project(ev)` + small-log rebuild（大 log 依 v0.87.13 OOM 政策刻意不深度補水，靠 live-derive fallback）
- [x] 3.3 `getFormattedLifeGoalContext` (committed → live-derive fallback) + `computeLifeGoalIntentBoost`
- [x] 3.4 `intentPlanner.computeIntentStack` optional `lifeGoalBoost` param
- [x] 3.5 Dialog injection: `AiDialogContext.lifeGoalContext` + `buildLifeGoalBlock` + http/npc.ts wiring
- [x] 3.6 Tests: lifeGoals projection/format, intentPlanner boost, aiDialog block

## 4. NPC Estate Inheritance (server)

- [x] 4.1 `sim/inheritancePlanner.ts`: planInheritanceTransfers pure function + tests
- [x] 4.2 `HouseholdInheritanceAssignedCmd` optional `goods` + validator rules
- [x] 4.3 `GoodsInventoryProjection` HOUSEHOLD_INHERITANCE_ASSIGNED branch (legacy shape = no-op) + tests
- [x] 4.4 Runtime mortality cadence emits the transfer command

## 5. Verification

- [x] 5.1 `npm --workspace packages/server exec vitest run` — full suite pass
- [x] 5.2 `npm run build` — server + web clean
- [x] 5.3 Local Docker rebuild + healthz smoke

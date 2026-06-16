## Context

The NPC system currently has three independent layers that do not cross-check each other:
1. **Activity assignment**: `npcEngine.ts` pattern-matches schedule slot labels to 7 coarse activity types; `work` absorbs >80% of all white-collar, craft, spiritual, and intellectual roles
2. **Building placement**: `ScheduleSlot` only has `location` (tile); the NPC's `buildingId` is set by direct proximity rules, not by schedule intent
3. **Narration/intentLine**: generated from static profile text or AI belief context; neither layer reads `buildingId` or validates against actual activity type

Result: a librarian shows a hammer-swing animation while standing outdoors with `buildingId: null`.

## Goals / Non-Goals

**Goals:**
- Expand `NpcActivity` to include semantically distinct types: `read`, `perform`, `craft`, `study`, `pray`, `write`, `guard`
- Add `buildingId?` to `ScheduleSlot` so schedule resolution places the NPC inside the right building
- Add `b_central_library` to t_central; audit all `*librarian*` / `*clerk*` / `*priest*` NPC profiles for missing building references
- Give each new activity type a distinct character animation pose and emoji glyph
- Ensure `intentLine` injected into AI dialog context includes the resolved `buildingId` name

**Non-Goals:**
- Real-time building capacity queue mechanics (排隊 is deferred)
- Cross-tile building travel animation (NPC already moves tile-by-tile; entering a building is instantaneous at sub-tile level)
- Retroactive EventLog replay (activity and buildingId are runtime projections, not event-sourced facts)

## Decisions

**D1: Extend NpcActivity as a union type, not an enum**
Current `NpcActivity = 'idle' | 'move' | ...` is a string union. Adding new values is non-breaking: existing consumers that don't handle the new values fall through to their default case. Alternative (separate sub-activity field) was rejected because it doubles the serialization surface without benefit.

**D2: Schedule slot buildingId is optional and advisory**
If `buildingId` is set but the building is full or absent, the NPC falls back to tile-level placement (current behavior). This prevents hard failures when world state diverges. Strictness can increase later.

**D3: Building catalog is the authority for what buildings exist in each tile**
NPC profiles reference `buildingId` strings; the catalog defines them. If a profile references a non-existent building, the engine logs a warning and ignores the reference (no crash). This keeps data and logic loosely coupled.

**D4: New animations use the existing CharacterVisualAction extension point**
`characterVisualState.ts` maps `NpcActivity → CharacterVisualAction`. Adding new activity→action entries does not touch the render loop. Animation poses are defined in `characterAvatar.ts` using the existing keyframe interpolation pattern.

**D5: intentLine context enrichment is additive**
The AI dialog prompt builder (`aiDialog.ts`) currently injects belief + intent + reflection. Adding a `buildingContext` line ("NPC is inside [建築名稱]") is a one-line addition to `formatDialogContext`. No schema change required.

## Risks / Trade-offs

- [Risk] NPC profile JSON files reference `buildingId` strings that may not match catalog IDs → Mitigation: startup validation logs mismatches; engine ignores bad refs (D3)
- [Risk] Adding 7 new activity types increases the animation surface; some may look nearly identical → Mitigation: `read`/`study`/`write` share the same "seated scroll" base pose; `craft` reuses `work` swing; distinct enough for players to notice context difference
- [Risk] `b_central_library` is added without a corresponding NPC owner → Mitigation: `ownerNpcId: null` is valid; building is public; `central.librarian.lin_pei_rou` is its primary occupant via schedule

## Migration Plan

1. Add new activity type values to server `NpcActivity` union and client mirror in `types.ts`
2. Extend `LABEL_WORK_PATTERN` with refined sub-patterns that catch `library|shelving|catalogue|inscription` → `read`, `busking|gig|rehearsal|performing` → `perform`, etc.
3. Add `buildingId?` to `ScheduleSlot` interface; update `resolveScheduleSlot` to set NPC `buildingId` when slot specifies one
4. Add `b_central_library` to catalog; update `central.librarian.lin_pei_rou` profile schedule slot with `buildingId: 'b_central_library'`
5. Add new `CharacterVisualAction` entries and animation keyframes in client
6. Update `npcVisuals.ts` glyph map
7. Update `aiDialog.ts` context builder to include building name when `buildingId` is set

No rollback needed: all changes are additive. Old activity values continue to work.

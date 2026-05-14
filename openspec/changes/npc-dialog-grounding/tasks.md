## 1. Runtime Accessors

- [ ] 1.1 Add `getAnimalPopulationOnTile(tileId: string): Array<{ speciesId: string; count: number }>` to `SimulationRuntime` — delegates to `AnimalPopulationProjection`, returns empty array when no rows match
- [ ] 1.2 Add `getFisheryDensityOnTile(tileId: string): { speciesId: string; density: string } | null` to `SimulationRuntime` — delegates to `FisheryDensityProjection`, returns null when no row matches

## 2. Dialog Context Types + Builder Functions

- [ ] 2.1 Add `knownPersonNames?: readonly string[]` to `AiDialogContext` in `aiDialog.ts`
- [ ] 2.2 Add `ecologyContext?: readonly { speciesId: string; count: number }[]` and `fisheryContext?: { speciesId: string; density: string } | null` to `AiDialogContext`
- [ ] 2.3 Add `recentLocalEvents?: readonly string[]` to `AiDialogContext`
- [ ] 2.4 Export `buildKnownPersonBlock(names: readonly string[] | undefined): string[]` — returns formatted block or `[]` when empty
- [ ] 2.5 Export `buildAntiHallucinationBlock(knownNames: readonly string[], knownSpecies: readonly string[]): string[]` — returns hard constraint section listing allowed names/species; omits species constraint when list is empty
- [ ] 2.6 Export `buildEcologyBlock(ecology: readonly { speciesId: string; count: number }[] | undefined, fishery: { speciesId: string; density: string } | null | undefined): string[]` — returns formatted ecology summary or `[]` when both empty
- [ ] 2.7 Export `buildRecentEventsBlock(events: readonly string[] | undefined): string[]` — returns formatted recent-events section or `[]` when empty
- [ ] 2.8 Wire all four new blocks into `buildSystemPrompt()` — known-person and anti-hallucination before history, ecology and recent-events after rumors; each block only appended when non-empty

## 3. HTTP Handler Integration

- [ ] 3.1 In `npc.ts`: query `npcMemoryStore.getMemories(npcId)`, filter `memoryType === 'interact'`, extract up to 10 unique `otherNpcId` values, resolve display names from `profiles`, pass as `knownPersonNames`
- [ ] 3.2 In `npc.ts`: call `runtime.getAnimalPopulationOnTile(npc.location)` and `runtime.getFisheryDensityOnTile(npc.location)`, pass as `ecologyContext` / `fisheryContext` (use spread pattern for optional fields to satisfy `exactOptionalPropertyTypes`)
- [ ] 3.3 In `npc.ts`: call `runtime.getRecentEvents(20)`, filter events where `(ev.payload as any)?.data?.tileId === npc.location`, take first 5, format each as `"[tick ${ev.tick}] ${ev.eventType}"`, pass as `recentLocalEvents`

## 4. Tests

- [ ] 4.1 In `aiDialog.test.ts`: `buildKnownPersonBlock` — returns `[]` on undefined/empty; returns block with name when given names
- [ ] 4.2 In `aiDialog.test.ts`: `buildAntiHallucinationBlock` — contains known names in output; contains species when provided; omits species line when species list is empty
- [ ] 4.3 In `aiDialog.test.ts`: `buildEcologyBlock` — returns `[]` on undefined/null inputs; returns ecology lines when data present; fishery density appears in output
- [ ] 4.4 In `aiDialog.test.ts`: `buildRecentEventsBlock` — returns `[]` on undefined/empty; returns event lines when given strings
- [ ] 4.5 In `aiDialog.test.ts`: full `buildSystemPrompt` with all context fields populated — verify anti-hallucination block precedes history block; verify ecology block present

## 5. Verification

- [ ] 5.1 Run focused tests: `npm run test -w @greed-island/server -- npcs/aiDialog`
- [ ] 5.2 Run `npm run build:server` and `npm run build:web`
- [ ] 5.3 Run full `npm test` and confirm counts
- [ ] 5.4 Run `npx openspec validate npc-dialog-grounding --strict`
- [ ] 5.5 Run `npx openspec validate --all --strict`
- [ ] 5.6 Update `PROGRESS.md` with implementation summary and verification evidence
- [ ] 5.7 Update `ROADMAP.md` with Phase 3 Slice 37.1 entry
- [ ] 5.8 Commit and push; confirm CI and Deploy Dev pass; verify live `/healthz`

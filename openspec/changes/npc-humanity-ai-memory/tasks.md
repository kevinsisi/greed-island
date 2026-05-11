## 1. Unique NPC Presence

- [x] 1.1 Define the current authoritative NPC presence tuple and document it.
- [x] 1.2 Make building occupant views derive from `runtime.getNpcs()` / NPC
  presence rather than an independently hydrated occupant projection.
- [x] 1.3 Ensure AreaPage and BuildingPage cannot render the same NPC in two
  places from divergent projections.
- [x] 1.4 Add regression coverage for an NPC inside a building not appearing as
  an outdoor area NPC.
- [x] 1.5 Verify live `/api/npcs` and `/api/buildings` consistency after deploy.
- [x] 1.6 Add `travelRoute` to moving NPC presence so Hub renders a route segment,
  not a duplicate area occupant.
- [x] 1.7 Exclude `activity=move` NPCs from Area/outdoor projections and cover it
  with regression tests.
- [x] 1.8 Add frontend projection tests for Hub route sprites and Area outdoor
  de-duplication.

## 2. Duty-Weighted Free Exploration

- [x] 2.1 Replace permanent role-locking with duty weights and duty windows.
- [x] 2.2 Allow merchants, craftsmen, guards, priests, and civic NPCs to cross
  districts for errands, food, rest, social visits, patrols, and events.
- [x] 2.3 Preserve special-duty anchoring only as a strong weight, not a hard
  lock, unless a future explicit story rule says otherwise.
- [x] 2.4 Add tests proving formerly role-locked NPCs can leave home outside
  duty-biased windows.
- [x] 2.5 Interpret daily-life routine labels into visible non-idle activities
  (`work`, `trade`, `patrol`, `eat`) so NPCs do not collapse into idle props.
- [x] 2.6 Shape injected off-duty errands by NPC role/archetype instead of making
  every errand an idle slot.
- [x] 2.7 Expose a deterministic localized `intentLine` for each NPC's current
  runtime-agent task so the UI can show what the NPC is doing.
- [x] 2.8 Increase local area waypoint refresh cadence to keep outdoor NPC motion
  visibly active without changing the authoritative presence tuple.

## 3. Memory-Backed AI Chronicle

- [x] 3.1 Persist player↔NPC and NPC↔NPC interaction facts required for future
  memory-grounded behavior.
- [x] 3.2 Add AI chronicle rendering from committed events and memory snippets;
  AI must not create world facts or emit Commands directly.
- [x] 3.3 Use key-pool robustness: per-item timeout, retry/backoff for
  transient failures, JSON MIME when structured output is needed, and observable
  fallback metadata.
- [ ] 3.4 Add anti-hallucination grounding so AI chronicle text may only name
  NPCs, buildings, and locations present in the event snapshot.
- [x] 3.5 Expose deterministic NPC agent state: profile id, permissions, active
  task, and last decision metadata derived from schedule/nudge/movement/social
  interaction state.
- [x] 3.6 Add bounded player-dialog hold so an NPC does not leave due to schedule
  movement while an authenticated player is actively talking to them.

## 4. Completion

- [x] 4.1 Bump product version for each shipped implementation slice.
- [x] 4.2 Update `PROGRESS.md`, `ROADMAP.md`, and architecture/spec docs.
- [x] 4.3 Run concrete build/test/diff-check commands.
- [x] 4.4 Complete reviewer gate, commit, push, CI, CD, and live health checks.
- [x] 4.5 Ship v0.15.12 worldline route slice and record deploy evidence.
- [x] 4.6 Ship v0.15.13 tick recovery fix and record CI/CD plus live tick
  progression evidence.

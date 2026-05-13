# World Agenda Directives — Design Document

## Context

Event motivation previously explained local NPC actions after the fact using
generic template strings. The world felt like a pool of canned NPC reasons
instead of a city shaped by government, factions, and hidden island pressure.

This change adds a deterministic `WorldAgendaDirective` derivation layer that
routes NPC life-goal, productive-action, and construction motivation through a
top-down causal chain: sponsor → directive → role interpretation → personal need.

## Goals / Non-Goals

### Goals
- Every productive/construction NPC motivation cites a deterministic directive
  that references an institutional sponsor (faction, resource council, world
  event).
- `civilian` faction majority does not read as a faction command; it falls back
  to resource/council governance unless a non-civilian faction or world event
  is driving.
- Active world events outrank local faction/resource directives so hidden-overseer
  pressure can surface.
- Replay determinism: same `(tick, EventLog, WorldConfig, rulesetVersion)` produces
  the same directive output.

### Non-Goals
- No new writable state or AI authoring of world intent.
- No persistent directive log (directives are projections, not committed events).
- No player-visible `/api/world` directive field yet (deferred to later slice).

## Design Decisions

### 1. Deterministic derivation only

`deriveWorldAgendaDirectives(worldState)` is a pure function that reads
`areaState`, `factionControl`, and `activeWorldEvents` from `WorldState(t-1)`.
It returns a `WorldAgendaDirective[]` — one per tile. AI never authors or
mutates directives.

### 2. Sponsor precedence (civilian dominance fix)

The directive sponsor is chosen by first-applicable priority:

1. **Non-civilian faction** controlling the tile (if any civilian faction is
   present, it is ignored unless no other faction has a directive).
2. **Active world event** applying to the tile or the whole world (gets higher
   pressureScore to outrank local directives).
3. **Resource/economy pressure** (the tile's resource scores read as "council"
   or "governance" motivation).
4. **Civilian majority** → resource governance, not a faction name. The
   directive reads as resource/council pressure, not a `平民地方支部` command.

This means ordinary civilian districts read as "民生配給會" (resource governance)
rather than a generic civilian faction name.

### 3. pressureScore determines motivation selection

| Source | Base pressureScore |
|---|---|
| World event directive | 120 |
| Dominant faction directive | 100 |
| Resource deficiency directive | 75 |

The runtime selects the directive with the highest `pressureScore` for each
tile and routes it into NPC motivation strings.

### 4. Derived directive shape

```typescript
interface WorldAgendaDirective {
  sponsor: string;          // e.g. "民生配給會", "島嶼主宰的暗流"
  scopeTileId: string;      // the tile this directive governs
  pressureKind: string;     // "resource_crisis" | "faction_agenda" | "world_event"
  pressureScore: number;    // for ranking (higher = more urgent)
  rationale: string;        // deterministic description of why
  directiveText: string;    // e.g. "穩定糧食供給" | "擴張暗流勢力"
}
```

## Runtime Flow

1. `runtime.ts` calls `deriveWorldAgendaDirectives(worldState)` at the start
   of each tick (after reduction, before NPC policy).
2. NPC policies (`lifeGoal`, `productiveAction`, `construction`) receive the
   active directive for their tile.
3. The NPC motivation builder formats the final string as:
   `{sponsor}: {directiveText} → {role} → {personalNeed}`.
4. The motivation is attached to the emitted command's `motivation` payload.

## Determinism

- `deriveWorldAgendaDirectives` reads only `WorldState(t-1)` — no randomness,
  no AI, no wall-clock.
- Same tick + EventLog + config = same directive output.
- No new events, no persistent directive state.

## Risks

- If a non-civilian faction controls many tiles, those tiles all emit the same
  faction sponsor. This is intentional — it makes faction reach visible.
- The pressureScore values (75/100/120) are tuned for the current live
  simulation. If world events become too frequent or aggressive, the
  world-event directive may drown out faction/resource texture. Revisit
  pressureScore if the world starts to feel homogeneous.

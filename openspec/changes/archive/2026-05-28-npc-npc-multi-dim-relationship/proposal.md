## Why

WORLD_CAPABILITIES.md §12.5.12 explicitly defines NPC relationships as **multi-dimensional**:

```
Relationship {
  trust
  fear
  respect
  attraction
  loyalty
  resentment
  dependency
  familiarity
}
```

The shipped implementation (`SqliteNpcRelationshipsStore`) stores a single `trust` scalar (0..100) plus a tri-state `relationshipType` ∈ {`neutral`, `friend`, `rival`}. Trust drifts +1 on chat and −2 on argue. **None of the other seven dimensions exist.** Household pair-bonding (the closest thing to "attraction") is decided purely by tile co-location + resource thresholds + `lifeGoal.kind === 'form_family'`; there is no notion that two NPCs are romantically drawn to each other or that one fears the other.

Knock-on effects:

- §43.1's social criteria cannot be reasoned about cleanly: a "rival" is just "trust < 25" without any reason or affect dimension.
- NPC dialog grounding (`formatRelationshipContext`) reports only friend/rival/trust, so AI responses describing complex feelings ("she resents him for the famine year", "he fears the guildmaster") have no factual ground.
- Pair-bonding for `NPC_HOUSEHOLD_FORMED` is mechanically forced — there is no attraction signal to distinguish "obvious match" from "loveless marriage of convenience".
- Combat consequences cannot raise fear toward an aggressor — `COMBAT_RESOLVE` doesn't tug a fear dial because no fear dial exists.

This change makes the relationship runtime match §12.5.12 by adding the seven missing dimensions, the events that mutate them, and the dialog-grounding plumbing that surfaces them to AI without changing trust's existing 0..100 semantics.

## What Changes

- Replace `RelationshipRow` (single `trust` number) with `RelationshipRow.dimensions: { trust, fear, respect, attraction, loyalty, resentment, dependency, familiarity }` — all 0..100 scalars, all defaulting to 50 except `familiarity` (0)
- Keep `trust` as one dimension for backward compatibility; existing 0..100 trust values from old EventLog data migrate 1:1
- Add `NPC_RELATIONSHIP_DIMENSION_ADJUSTED` event for explicit one-dimension mutations from external systems (combat, faction conflict, mortality grief)
- Extend `NPC_INTERACT` projection logic: chat now drifts `trust +1, familiarity +1`; argue drifts `trust −2, resentment +2, familiarity +1`
- New event sources for non-trust dimensions:
  - `NPC_DECEASED` of a familiar NPC → grief: `+resentment` if combat-killed by a known aggressor; `+respect, −fear` if non-violent death of a respected elder
  - `FACTION_TILE_SEIZED` against an NPC's faction → `+fear` toward the seizing faction's known members; `+respect` if seizer is your own faction
  - `COMBAT_RESOLVE` with `player_victory` → `+fear` toward winner (per witness)
  - `NPC_MENTORSHIP_COMPLETED` → `+respect, +loyalty` (apprentice→mentor) and `+attraction` (mentor→apprentice, capped — non-romantic interpretation: "fond of")
  - `NPC_HOUSEHOLD_FORMED` → `+attraction, +dependency` (mutual)
  - Recurring same-tile co-presence → `+familiarity` (cadence-gated, slow drift)
- Add `RelationshipType` derivation: replace single trust-threshold transition with multi-dim logic — friend = trust ≥ 70 AND respect ≥ 50; rival = resentment ≥ 60 OR fear ≥ 70; lover = attraction ≥ 70 AND trust ≥ 60; mentor/apprentice via lineage edges; default neutral
- Extend pair-bond planner (`planHouseholdCommands`): pairing candidates now require minimum `attraction ≥ 50` between the two NPCs (drops the purely mechanical "any two unmarried co-located NPCs"); when no candidates meet the bar, household formation simply doesn't happen this cadence
- Extend AI dialog grounding (`formatRelationshipContext`): inject dominant non-trust dimensions as hedge-language directives ("you fear them", "you resent them", "you are drawn to them") so AI's tone matches the model
- **BREAKING**: `RelationshipRow.trust` becomes a derived view of `dimensions.trust`; consumers that read the field directly continue to work; consumers that wrote to `trust` directly (none in tree) would fail at compile time
- **BREAKING**: `RelationshipType` no longer includes `rival` as trust-only — the rival definition expands; existing rows that were rivals purely on low trust may reclassify

## Capabilities

### New Capabilities

- `npc-relationship-dimensions`: eight-axis NPC relationship vector (trust/fear/respect/attraction/loyalty/resentment/dependency/familiarity); event-driven mutations from interactions, combat, mortality, faction shift, mentorship, household formation, co-presence; deterministic delta tables; canonical-hash projection
- `relationship-type-derivation`: multi-dim composite logic that resolves `RelationshipType` ∈ {`neutral`, `friend`, `rival`, `lover`, `mentor`, `apprentice`, `feared`} from the eight-axis vector

### Modified Capabilities

- `ai-npc-dialog`: dialog context's relationship block surfaces dominant non-trust dimensions and applies hedge-language directives so AI tone reflects fear / resentment / attraction without hallucinating those feelings
- `npc-life-goals-and-expansion`: pair-bond planner gates household formation on `attraction ≥ 50` between candidates; lifegoal `form_family` no longer guarantees mechanical pairing

## Impact

**Affected runtime modules:**
- `packages/server/src/kernel/npcRelationships.ts` — schema migration; multi-dim project logic
- `packages/server/src/kernel/livingWorldCommands.ts` — `NPC_RELATIONSHIP_DIMENSION_ADJUSTED` registration
- `packages/server/src/sim/runtime.ts` — new event handlers for fear/respect/resentment fan-in from `NPC_DECEASED`, `FACTION_TILE_SEIZED`, `COMBAT_RESOLVE`, `NPC_MENTORSHIP_COMPLETED`, `NPC_HOUSEHOLD_FORMED`; pair-bond planner attraction gate
- `packages/server/src/kernel/emotionalSimulation.ts` — extend mood/trust math to weight the new dimensions
- `packages/server/src/ai/relationshipContext.ts` (new or extension of existing) — dominant-dimension dialog directives

**Affected APIs:**
- `GET /api/world/npc-relationships` — response gains `dimensions` object per row
- AI prompt to Gemini — relationship section grows by ~7 lines per known NPC

**Database migration:**
- `npc_relationships` table gains seven new INT columns; existing rows back-fill from `trust` value (trust unchanged) and default-50 the rest (familiarity defaults 0)
- One-way migration; rollback is to drop the new columns and revert reads to `trust` only

**Affected docs:**
- WORLD_CAPABILITIES.md §19 — table row gains "multi-dim" annotation
- WORLD_CAPABILITIES.md §43.1 — relationship-grounded scenarios more verifiable

**Non-goals:**
- Real romantic systems with infidelity, jealousy arcs — too rich for this change; would build on attraction once it exists
- AI inferring dimension values from natural language — AI is read-only; dimensions are server-computed
- Visibility of dimension scalars to player UI — keep server-side only for v1

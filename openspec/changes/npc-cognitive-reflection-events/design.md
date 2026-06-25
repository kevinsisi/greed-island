## Architecture

`NPC_REFLECTION_COMMITTED` follows the project law:

```text
reflection proposal → validator → Command → Rule Engine → EventLog → NpcCognitiveProjection
```

The event payload intentionally stores only bounded, evidence-backed deltas:

- `npcId`
- `committedAtTick`
- `sourceProposalTick`
- `source`
- `evidenceMemoryFragments`
- `personalityDeltas`
- `lifeGoal`
- `relationshipDeltas`
- `summaryZh` / `summaryEn`
- `narration`

The projection is rebuild-only and deterministic. It does not call AI, does not read live memory tables, and does not mutate NPC base definitions.

## Boundaries

- AI output remains proposal data until validated.
- Personality deltas are capped to `[-0.25, 0.25]` per event.
- Relationship deltas are capped to `[-15, 15]` per event.
- Reflection commits require at least one memory evidence fragment.
- Public API hot paths should consume materialized/projection summaries, not full memory scans.

## Follow-up slices

- Feed `NpcCognitiveProjection` deltas back into planner cognitive input.
- Route relationship reflection deltas through relationship projections or command emission.
- Add materialized memory consolidation summaries for `/api/npcs`.

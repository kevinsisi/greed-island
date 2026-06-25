# NPC Long-Term Cognitive Evolution Design

## Pipeline

```text
committed projections + current cognitive profile
→ reflection proposal
→ validator
→ committed cognitive update
→ public NPC snapshot summary
```

The proposal may come from deterministic code or a future AI reflection. The validator is the boundary: no proposal becomes committed unless it has memory evidence, bounded personality deltas, allowed life-goal kinds, known relationship targets, and small relationship deltas.

## Validator Rules

- `npcId` must match the current NPC context.
- At least one memory/reflection evidence fragment is required.
- Personality deltas are limited to known numeric knobs and `-0.25..0.25`.
- Life goal kind must be one of existing life-goal kinds and pressure must be `0..100`.
- Relationship deltas must target known related NPCs and stay in `-15..15`.
- Empty summaries/reasons are rejected.

## Public Surface

`ServerNpc.cognitiveEvolution` is additive and contains:

- `reflectionCount`
- `currentThoughtZh`
- `lastReflectionZh`
- `personalityTraceZh`
- `lifeGoalTraceZh`
- `relationshipTraceZh`

The first v0.96 slice derives a bounded committed update from current context for snapshot/UI visibility. Future slices may persist these committed updates as EventLog commands once cadence and replay rules are formalized.

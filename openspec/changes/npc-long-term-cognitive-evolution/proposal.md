## Why

v0.95 made NPCs visibly think from personality, memory, beliefs, needs, and life goals, but the user wants each NPC to feel more like a small Hermes: long-term learning, reflection, self-correction, personality growth, self-authored life goals, deeper relationship rewrites, and an observable memory/reflection UI.

## What Changes

- Add a bounded NPC cognitive evolution layer for reflection proposals.
- Validate AI/deterministic reflection proposals before any committed personality/life-goal/relationship update exists.
- Commit only small, evidence-backed personality deltas and bounded relationship/life-goal changes.
- Expose a fine-grained `cognitiveEvolution` NPC summary to the frontend.
- Keep state mutation bounded: reflection output is proposal data until validated and converted into typed committed update data.

## Non-goals

- Do not let an LLM directly mutate EventLog, relationships, life goals, personality, inventory, map, or health.
- Do not run per-NPC network AI calls every tick.
- Do not make frontend invent NPC memory or relationship state.

## Impact

- **Server**: new `npcCognitiveEvolution` validator/committer and NPC snapshot summary.
- **Web**: additive `cognitiveEvolution` type and Area NPC summary line.
- **Tests**: proposal rejection, committed update shaping, UI summary formatting.

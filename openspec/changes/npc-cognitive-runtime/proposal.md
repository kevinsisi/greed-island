## Why

NPCs currently have deterministic needs, schedules, beliefs, memory, and a first autonomous planner slice, but their public behavior still feels shallow: most NPCs react like stat machines instead of people who remember, reflect, and let personality shape the next decision. The user wants every NPC to feel like a bounded mini-Hermes: self-observing, memory-aware, learning from experience, and distinct by personality, while preserving Greed Island world law.

## What Changes

- Introduce an NPC Cognitive Runtime layer that converts committed memories, beliefs, life goals, and personality into a deterministic cognitive profile.
- Feed that cognitive profile into `NPC_AGENT_DECISION` planning so different NPCs choose different priorities from the same world pressure.
- Add a public cognitive line explaining what the NPC is currently thinking and why, without making AI narration authoritative.
- Keep all state-changing output bounded: cognitive runtime emits intent only through existing `NPC_AGENT_DECISION` commands and Rule Engine validation.
- Use optional AI/freeform reflection only as an additive proposal path; the deterministic cognitive profile remains the authoritative planning input.

## Non-goals

- Do not run an LLM for every NPC every tick.
- Do not let NPC AI directly mutate EventLog, WorldState, hp, inventory, relationships, or map state.
- Do not give NPCs omniscient access to hidden world facts.

## Impact

- **Server simulation**: new cognitive profile derivation and planner weighting.
- **NPC API/frontend**: additive `cognitiveLine` surface.
- **Tests**: deterministic personality divergence, memory/belief influence, API/UI type compatibility.
- **OpenSpec**: new `npc-cognitive-runtime` capability.

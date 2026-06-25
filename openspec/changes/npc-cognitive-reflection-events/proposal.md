## Why

v0.96 added bounded NPC cognitive evolution summaries, but those updates are still shaped as snapshot data rather than durable world facts. If the server restarts and rebuilds from EventLog, an NPC's reflection count, personality deltas, life-goal override, and relationship reflection trace must be reconstructable from committed events.

## What Changes

- Add a replayable `NPC_REFLECTION_COMMITTED` command/event to the living-world command catalog.
- Validate reflection commits with the same safety boundaries as the cognitive evolution layer: memory evidence required, personality deltas capped, life-goal kinds whitelisted, relationship deltas bounded.
- Add an `NpcCognitiveProjection` that rebuilds per-NPC reflection state from EventLog events.
- Keep AI read-only: AI/deterministic reflection can propose data, but only Rule Engine-accepted events become world facts.

## Non-goals

- Do not run one Hermes/LLM process per NPC.
- Do not let AI directly mutate personality, relationships, life goals, inventory, map, or health.
- Do not scan the full NPC memory table in public NPC list endpoints.

## Impact

- **Kernel**: additive command/event type and validator.
- **Server simulation**: new projection helper for durable NPC cognitive state.
- **Tests**: Rule Engine acceptance/rejection and EventLog rebuild behavior.
- **Docs**: mark this as the first event-sourced cognitive reflection slice toward Hermes-like NPCs.

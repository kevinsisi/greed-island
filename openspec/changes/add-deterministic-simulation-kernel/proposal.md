## Why

Greed Island-like must be a deterministic multiplayer simulation system, not a chatbot-driven story engine. The first foundation is a closed simulation kernel where player input is only intent, events are the only truth, and every derived state can be replayed from the event log.

## What Changes

- Define the core separation between Command, RuleResult, Event, EventLog, WorldState, Reducer, and AI renderer.
- Introduce Command and RuleResult contracts where commands are validated and either compiled into events or rejected.
- Introduce an immutable append-only Event contract and Event Store as the only source of truth.
- Require deterministic global event ordering with sequence-first ordering.
- Require WorldState to be derived only by pure reduction of EventLog.
- Define command rejection behavior so rejected commands never affect WorldState.
- Define the AI read-only boundary so AI consumes event snapshots and outputs narration only.
- Add replay and determinism validation requirements for the full kernel pipeline.

## Capabilities

### New Capabilities
- `simulation-kernel`: Deterministic command-to-event kernel, append-only event truth, pure world projection, rejection behavior, and AI read-only boundary.

### Modified Capabilities
- None.

## Impact

- Affects future backend domain contracts, event persistence, reducer implementation, rule-engine entry points, and deterministic replay tests.
- Does not define gameplay cards, multiplayer UX, horizontal scaling, distributed sequencing, WebSocket topology, or advanced Gemini prompt hardening.
- Establishes the implementation prerequisite for future living-world runtime, NPC, and autonomous world evolution changes.

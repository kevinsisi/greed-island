## Context

The project is currently a template repository with no product runtime. The target product direction is a Greed Island-like deterministic multiplayer simulation, where player input is intent, events are facts, world state is a projection, and AI is a read-only renderer.

The kernel must be established before gameplay cards, NPC autonomy, WebSocket sync, or deployment. Without this boundary, the project risks becoming a non-replayable chatbot story system instead of a deterministic artificial world.

## Goals / Non-Goals

**Goals:**
- Establish the simulation-kernel contracts for Command, RuleResult, Event, EventLog, WorldState, Reducer, and AI snapshot input.
- Make the EventLog the only source of truth.
- Ensure accepted commands produce immutable events and rejected commands produce no world events.
- Ensure identical EventLog input produces identical WorldState and identical AI snapshot input.
- Keep the first implementation small enough to prove replay determinism before adding living-world runtime behavior.

**Non-Goals:**
- No full card system or Greed Island gameplay mechanics.
- No tick engine, autonomous NPC runtime, or world self-evolution in this change.
- No multiplayer UI/UX or WebSocket topology.
- No distributed sequencer or horizontal scaling.
- No advanced Gemini prompt hardening beyond the read-only AI boundary.

## Decisions

### Decision: Model commands as intent, not facts

Commands represent requests from players, NPCs, or future system actors. They are not part of WorldState and do not become true unless the Rule Engine compiles them into events.

Alternative considered: append every command to the main event log. This was rejected because rejected commands would pollute the truth source and could accidentally influence reduction.

### Decision: Use RuleResult as the only command outcome

The Rule Engine returns either accepted events or a rejection. Rejections may be stored in an audit log, but the audit log is explicitly outside WorldState reduction.

Alternative considered: throw exceptions for invalid commands. This was rejected because validation failure is normal domain behavior and must be testable as a deterministic contract.

### Decision: Sequence is the authoritative event order

Events are reduced by deterministic sequence order. Wall-clock timestamp fields may exist for audit or display, but reducers and rule decisions must not depend on them.

Alternative considered: order by timestamp plus deterministic hash. This was rejected for the first kernel because client/server timestamps are not reliable enough under concurrency.

### Decision: Use append-only EventLog as truth and snapshots as cache only

WorldState may later be cached as a projection snapshot for performance, but it must be deletable and rebuildable from EventLog. Snapshot contents must never become truth.

Alternative considered: persist mutable WorldState directly as canonical state. This was rejected because it would break replay, auditability, and deterministic verification.

### Decision: Keep AI outside simulation authority

AI consumes event snapshots and emits narrative text only. AI output must not generate events, modify state, or influence rule decisions.

Alternative considered: allow AI to act as a game master. This was rejected because it would make simulation results non-deterministic and non-replayable.

### Decision: Reserve simulation metadata without requiring living-world runtime

The Event contract should be compatible with future tick-based runtime metadata such as `tick` and `rulesetVersion`, but this change does not implement tick orchestration.

Alternative considered: wait to define tick metadata until runtime implementation. This was rejected because event schema churn would be likely immediately after the kernel lands.

## Risks / Trade-offs

- Event-sourced replay can become slow as the log grows → allow derived snapshots as cache only, tied to last processed sequence.
- Single sequence ordering is simpler but not horizontally scalable → keep distributed sequencing explicitly out of scope until the kernel is proven.
- AI narration may vary for identical input → only AI input snapshot is deterministic; AI output is non-authoritative and must not affect simulation.
- Deterministic constraints reduce design flexibility → this is intentional because fairness, replay, and debugging are core product requirements.

## Migration Plan

No existing product data needs migration. The first implementation should create new kernel modules and persistence tables from an empty state.

## Open Questions

- Which exact initial backend framework will be selected: Express or Fastify?
- Should rejected command audit logging be implemented in the first kernel slice or left as an interface only?
- Should deterministic keys use SHA-256 over canonical JSON from the first implementation, or be introduced after core replay tests pass?

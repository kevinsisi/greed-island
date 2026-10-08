# Canonical player world contract

- A verified Principal supplies one numeric AccountId. Client payloads cannot select actors, coordinates, geometry, ticks, currency, or rewards.
- Player entry, each accepted movement step, and each accepted adjacent-region crossing compile through a pure player rule engine and the typed LivingWorldRuleEngine catalog into the existing EventLog.
- EventLog-backed idempotency scopes client command IDs to the authenticated account. Identical retries return the original committed event; changed content rejects.
- A batch appends all accepted events atomically and publishes only after commit. Any invalid member rolls back the whole batch.
- Server-owned monotonically increasing movement sub-steps permit at most one move or transition per account per step. Each movement event carries the resulting position and sub-step for deterministic replay and restart.
- Boundaries and building collision data are server-owned. Transitions require a nearby server-defined portal, an available canonical graph edge, and supported destination geometry. Unsupported or locked regions fail closed.
- Snapshots show same-region players and living outdoor NPCs from the canonical runtime. Indoor, deceased, and traveling NPCs are excluded from local outdoor presence. NPC sub-grid coordinates remain canonical; presentation transforms confer no interaction authority.
- Known locked/ungenerated regions and edges are exposed separately from currently available adjacency. Dynamic unlocks and generation are derived from canonical events.
- Startup hydration reads the latest complete position event per actor through an indexed EventLog query, on both small- and large-log boot paths. No mutable position database is a source of truth.
- Existing progress is retained without invented quest, currency, or fixture-resource mappings. Production import and cutover require backup/review and separate authorization.

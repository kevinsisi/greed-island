# Canonical player world

Serve the user's single multiplayer world from SimulationRuntime's existing EventLog, map graph, and living NPC projections. This is a branch-only integration candidate, not a production cutover or complete nine-region release.

This implements WORLD_CAPABILITIES Part I §2.1 Event Reality, §2.2 Determinism, and §2.4 Actor/Command boundaries, within the existing player-world integration work. All 8 existing base regions plus 1 unlock-gated Salt Marsh have geometry derived from the existing harbor or authored terrain/building grid. Temple/Salt Marsh water literals are exact sourced promotions with parity tests. Three known generated frontiers have no authored terrain and fail closed. Full authored 3D scenery, dynamic construction collision and complete gameplay integration remain separate gates.

Every accepted server-computed movement and transition is a typed canonical Event immediately. No five-second durability checkpoint is introduced. Numeric AccountId comes from the shared identity service. Existing account progress, inventory, currency, survival, NPC relationships, and personal events remain unchanged. No legacy fixture import is inferred or run.

No startup routes, auth files, secrets, live databases, deployment configuration, or production migrations are changed here.

## Context

The existing game server has a canonical SimulationRuntime and SQLite EventLog, while the multiplayer room has a separate runtime and session flow. This change adds the canonical player-world service as a server-owned projection and transport boundary. The player-world module receives the existing account identity and EventLog through the composition root.

## Goals and non-goals

Goals:
- Use one canonical numeric account principal for world entry, movement, transitions, chat, and presence.
- Persist accepted position and public chat facts in the existing append-only EventLog.
- Bound online admission, queued commands, SSE streams, and slow-client buffering.
- Preserve unsupported regions as unavailable until their geometry exists.

Non-goals:
- Importing room databases, fixture accounts, or old beacon/reward progress.
- Replacing startup routes, the web app, legacy gameplay APIs, or deployment configuration in this delta.
- Claiming 50-browser acceptance, sustained production capacity, or latency results from in-process tests.

## Decisions

### D1: EventLog remains the position source of truth

The service stores complete position events with an account-scoped command ID and content digest. Restart hydration reads the newest position event per actor. Accepted moves and transitions are compiled through the existing LivingWorldRuleEngine and committed atomically.

### D2: Admission counts distinct accounts

A live account owns a set of connection tokens so multiple tabs count as one online player. The service caps unique online accounts at 50; the HTTP adapter separately caps streams per account and globally. A disconnected account cannot commit a queued gameplay intent.

### D3: Movement and crossing use server-owned geometry

Clients submit movement direction or an adjacent region target. The service supplies position, time step, map graph, geometry, collision checks, portal distance, and arrival coordinates. Unsupported or locked regions reject entry and crossing.

### D4: Chat is one public world channel

Chat is stored as a typed EventLog fact in the same service. Account, tile, and public display name are derived server-side. Snapshots show the newest 100 world messages; private NPC dialogue is not part of the public projection.

## Risks and trade-offs

The tests prove bounded service behavior and file-backed durability in CI; they do not prove network performance with 50 browsers. Movement and chat facts remain append-only, so sustained L390 load should measure storage growth and event-loop latency before setting a production capacity claim.

## Rollout

This delta is a source and CI checkpoint. It does not mount the new router into the active production server or change the live database. Startup, browser/UI preservation, migration, and L390 acceptance are tracked separately.
## Why

The active multiplayer branch still has a separate room flow. It needs a canonical world service that binds each player's location and public chat to the same authenticated account and durable world history.

## What Changes

- Add server-owned player positions, bounded ground movement, and graph-gated region transitions to the existing SimulationRuntime and EventLog.
- Enforce a 50-account online admission cap, per-account connection refcounts, and bounded world command/SSE queues.
- Add one public world chat channel with server-derived identity and region, bounded message history, and restart-safe idempotency.
- Keep unsupported map frontiers fail-closed and leave existing account progress and legacy fixture records untouched.

## Capabilities

### New Capabilities
- canonical-player-world: One authenticated, event-sourced multiplayer world with bounded admission, movement, and public chat.

### Modified Capabilities
- _None._

## Impact

This adds server domain, projection, transport, tests, and documentation. Full startup/UI composition, legacy-feature adapters, data import, L390 deployment, and live capacity measurement remain separate gates.
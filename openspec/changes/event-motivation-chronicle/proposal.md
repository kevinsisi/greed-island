## Why

Chronicle rows explain what happened, but not always why it happened. A human
world should expose motivation, pressure, purpose, or triggering conditions for
public events instead of reading like canned activity logs.

## What Changes

- Add deterministic event motivation context for public chronicle events.
- Use authoritative committed payload data when available, including explicit
  construction motivation for new construction/expansion events.
- Add deterministic Timeline fallbacks for older events and event types whose
  motivation can be derived from existing payloads.
- Keep raw payload disclosure for debugging, but make motivation visible without
  requiring players to inspect JSON.

## Non-Goals

- No AI-authored event motivation.
- No change to event acceptance rules beyond carrying extra deterministic context.
- No full planner rewrite for every NPC decision in this slice.

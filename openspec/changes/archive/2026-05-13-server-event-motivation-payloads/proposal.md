## Why

v0.15.33 made motivations visible in the Timeline, but many non-construction
events still rely on deterministic client-side fallback. New events should carry
their motivation as committed server payload data whenever the runtime has the
context.

## What Changes

- Add a generic event motivation payload shape for living-world events.
- Attach server-authored deterministic motivation to common public runtime events.
- Keep existing client fallback for older events and edge cases.

## Non-Goals

- No AI-authored motivation.
- No full NPC planner rewrite in this slice.
- No change to event acceptance decisions beyond validating optional motivation.

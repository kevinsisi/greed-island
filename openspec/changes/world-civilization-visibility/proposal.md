## Why

World civilization goals and technologies now exist as durable EventLog facts, but players could not see them in the normal Hub flow. That made the living-world north star invisible unless a developer inspected `/api/world` manually.

## What Changes

- Expose `worldCivilization` on `WorldSnapshot` as an explicit API field, while keeping the same projection in `facts` for backward-compatible generic consumers.
- Add frontend API/state types for goals and technologies.
- Render a Hub panel showing active goals, completed goals, discovered technologies, goal progress, and evidence counts.
- Add a pure web projection helper so display ordering remains deterministic and testable.

## Impact

- `/api/world`, dashboard world snapshots, and SSE snapshots include `worldCivilization`.
- Hub users can immediately see that the island is forming goals and technologies from autonomous activity.
- Older clients that only read `facts` continue to work.

# Canonical spatial read facades

Additive delta on world/chat commit `334659a86b6154d638cf4e1e4eea83199be4a904`.

- `geometry.canonicalWorldPointToGrid(point, geometry)` returns `{subCol, subRow, subZ: 0}` or `null`. Canonical-area-grid coordinates pass through. Harbor coordinates invert `projectNpcPoint` using the same radius-padded bounds and 15 × 10 canonical grid dimensions. Nonfinite, out-of-bounds, blocked, or unsupported poses fail closed.
- `PlayerWorldService.getGridPose(AccountId)` and `SimulationRuntime.getPlayerWorldGridPose(AccountId)` derive this pose only from the existing durable position and injected server geometry. No client coordinate/floor or social-presence table enters this path.
- Ground height zero is the existing exterior NPC convention. These APIs do not model interior/floor transitions.
- `PlayerWorldService.getAdmittedActors()` and `SimulationRuntime.getAdmittedPlayerWorldActors()` return defensive position copies of admitted online accounts across regions, sorted by numeric account ID. Multiple tabs contribute one account, final disconnect removes only online presence, and persisted positions remain. A cookie/session or offline EventLog entry alone does not count as online.
- No new EventLog event, profile truth, clock, or presence store is created.

Local Node24/Vitest4: 4 new tests plus existing service/rules suites, 50/50 passed. They cover exact dock inverse/extrema, all nine authored exterior geometries, blocked cells, unsupported geometry, cross-region roster, defensive copies, refcounts, and reconnect. Full server `tsc` remains blocked on existing missing identity/auth/native-snapshot dependencies and baseline tests; no diagnostics occur in the authored helper files. Exact combined Node22/native CI remains required.

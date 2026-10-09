# Canonical catalog interior admission

This source-only extension is based on reviewed dependency snapshot9a6899b,
including beacon6de6279, validationc3b3b39, c1 spatial facades and staging045ee9b.
It adds no account store, room, position projection or runtime.

- Explicit `enter-building` intent accepts only `{buildingId}`. Explicit
  `exit-building` accepts only `{}`. Both retain existing command IDs, expected
  cookie account context, admitted live connection, server sub-step, transactional
  reauthorization, deterministic receipts, replay and rollback semantics.
- The existing AreaMapSvg policy is Chebyshev≤1.5 from authored building placement.
  Entry additionally requires actual server walkable exterior pose, same available
  tile, unlocked enterable authored catalog building, and operational building state.
  Tests enumerate reachable real entry poses for every visible enterable authored
  building. This is the existing entry vicinity rule, not an invented doorway direction.
- `PlayerWorldPosition.interior={buildingId,returnPose:{x,z}}` is persisted through
  complete `PLAYER_BUILDING_ENTERED` facts. There is one catalog layout and no floor
  or indoor player coordinates. Existing x/z retain the precise exterior return pose.
- Indoor movement/region crossing/nested entry and outdoor beacon contribution
  fail closed. Exit emits `PLAYER_BUILDING_EXITED`, with fromBuildingId and unchanged
  saved return pose. If it is blocked by later geometry, `BUILDING_EXIT_BLOCKED`
  requires a future explicit recovery policy; this implementation never teleports.
- Exterior grid-pose facade returns null while indoors. Snapshot supplies catalog
  layout and bounded basic occupant identities, no fabricated indoor positions;
  peer projection includes only the same building or the same exterior.
- Opening a route/view does not admit or exit a building.
- Events reuse numeric accountId and decimal actorId, both covered by the existing
  read-only historical allocator-reference scanner. No account-reference schema
  or allocator write is added.

Verification here is source/pure fixture verification. Native better-sqlite3 is
missing in this execution environment. Real SQLite reopen/native CI, normal-UI
browser E2E and deployed live behavior remain unverified.

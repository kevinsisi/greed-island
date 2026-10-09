## Sole-cookie existing-view preservation — 2026-10-08

- Superseded reduced wildcard with explicit `/game/*` views and exact historical bookmark aliases, preserving all existing account/gameplay/admin route surfaces without OriginalApp/JWT fallback.
- Replaced AuthContext/legacy API bearer transport with the sole cookie numeric-profile/player stream, nullable email, expected-ID mutation assertions, stale private-cache remount and typed auth/admission invalidation.
- Restored canonical public world chat; adapted profile/password/admin operations; detailed area/hub markers use canonical snapshots and bounded same-client intents. Removed active local position storage/publication without deleting stored data. Unavailable world data is explicit, with no fixture substitution or fake dashboard values.
- Passed 435 frontend tests across49files, strict pure API/client/projection TypeScript, whitespace and9 actual chat/geometry DTO compatibility tests. Broad TSX compile remains blocked on Babylon/Phaser/Leaflet dependency types; actual pinned build/browser not passed here.
- Normal-UI browser gate prepared separately. Final independent review, all same-cookie backend family adapters, canonical building/indoor proximity policy, preserved progress/migration, exact build and browser CI remain merge/release gates. Branch remains incomplete.

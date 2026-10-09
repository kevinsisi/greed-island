# Existing-view preservation checkpoint

Supersedes the reduced wildcard route in the first client checkpoint. Source baseline is the connector-hydrated frontend at verified `544630a132cad727bcb071239566c652b5d354f4`; subsequent publisher work changed the legacy harness/server, not these owned view files. The final Vite/harness delta is separately based on exact published `ae064652892b0bbf1390cf3b0b1b89d476911305`.

## Preserved route surface

One `/game` entry and one cookie provider. Original profile/codex/timeline/social/ecology/market/properties/settings/admin/area/building URLs map to their matching `/game/*` view. Preview/multiplayer/account aliases converge on the single game. Password recovery remains the approved manual utility at `/reset-password`. Unknown routes are explicit rather than swallowing a historical feature.

The original JWT/localStorage AuthContext is replaced. The sole provider derives the old UI's `id` label from canonical `accountId`; it does not create another stored identity. API wrappers send the displayed numeric context and include cookies, never bearer credentials. Email is nullable. Profile nickname/avatar/language/password UI remains; successful password rotation clears the sole client session. Admin user listing, roles/status and manual proof issuance use the same canonical service, protected last-admin/current-role/context rules.

Subordinate views remount on account changes; old private caches cannot carry over. Auth/context failures invalidate the sole client, while admission loss reconnects with the valid profile retained.

## World/presence/input safety

Old views use real same-runtime read models. Initial unavailable world/NPC/event/card/map families gate the view with a visible error/loading state; no illustrative fixtures are substituted. Personal dashboard data is nullable until fetched, never invented as zero.

Current region/player markers come from the canonical player snapshot. Hub selection browses a region without moving the player. Detailed area clicks plan a route through canonical geometry and send bounded direction impulses on the same admitted client. New clicks, changed region/geometry, disconnection, focus/visibility loss and unmount cancel it. No active map reads/writes localStorage positions or publishes client coordinates; historical saved data is not deleted. Legacy `/social/presence` wrapper sends no coordinates, actor or tile assertion.

One public world chat channel is restored through the canonical chat intent/ACK/snapshot. It is bounded, escaped, labeled with server sender region and includes no private NPC histories. Previous room chat remains preserved pending the reviewed import/archive plan.

## Verification and remaining gates

- All 49 available frontend test files passed: 435 tests.
- Strict pure API/client/route/area projection TypeScript and whitespace passed.
- Nine additional local compatibility tests passed against the actual frozen chat/admission snapshot constructor and all eight base regions plus unlocked salt marsh. These adjacent-candidate tests are local evidence, not portable published tests.
- Broad TSX compile was attempted. It stops on absent Babylon/Phaser/Leaflet dependency types and their cascades; after concrete fixes, no other source errors appeared. Reused cached tooling differs from repository-pinned versions. This is not a full build/typecheck pass.
- The normal-UI browser gate is prepared separately and statically typechecked, but not executed yet.
- Independent review, exact pinned build/CI and mounted/reviewed backend families remain required. The startup worker is adapting existing handlers to same AuthService/current-role numeric authorization, reviewed public/self-only DTOs and canonical spatial authority; these families are not all mounted yet.
- Indoor NPC/building interaction semantics need a reviewed canonical door/proximity rule or typed interior entry. Canonical player position has no building/interior field today; no client interior position is silently promoted into authority.
- Legacy resource/event/history migration remains a distinct preserved-data gate. No live read/import/account/proof/deployment occurred here, and this checkpoint is not all-functions-complete or ready for main merge.

# Client contract

## Requirements
- One entrypoint, login form and cookie session for the canonical game.
- World commands and logout assert the displayed numeric identity in a server-validated header; mismatches invalidate the stale client. Token-free BroadcastChannel notices coordinate tabs without browser credentials/state stores.
- Validate profile, versioned PlayerWorldSnapshot and individual command ACK before using them.
- Only explicit WORLD_ENTRY_REQUIRED permits an enter intent; concurrent ALREADY_IN_WORLD resumes a fresh snapshot.
- Stream snapshots, not acknowledgements, update authoritative position/NPC/map state.
- Same-account tabs do not create duplicate players. Same-region peers and living outdoor NPCs are rendered from the server snapshot only.
- Region geometry changes cancel stale navigation and rebuild the scene.
- Transition actions are server-validated; no teleport, client coordinates, actor or resource fields are sent.
- Disconnect, expired identity, malformed state, blur, typing and canceled navigation stop movement.
- Known unavailable/unsupported regions and unavailable progress are explicit. Supplies/rewards/beacon/chat are never invented as canonical gameplay.
- Existing files/data are preserved; a production switch remains blocked on migration and adapter review plus final CI.

## Verification
Pure tests cover schema validation, account mismatch, stale snapshots, canonical entry/resume, exact API bodies, malformed ACK, reconnect and transition serialization. Normal sandboxed browser UI must verify registration/login, movement/navigation/cancellation, two peers, NPC rendering and region crossings against the reviewed unified fixture server before release.

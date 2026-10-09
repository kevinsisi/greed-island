# Client contract

## ADDED Requirements

### Requirement: One validated canonical identity
The client SHALL satisfy the following contract:
- One entrypoint, login form and cookie session for the canonical game.
- World commands and logout assert the displayed numeric identity in a server-validated header; mismatches invalidate the stale client. Token-free BroadcastChannel notices coordinate tabs without browser credentials/state stores.
- Validate profile, versioned PlayerWorldSnapshot and individual command ACK before using them.

#### Scenario: A client opens the canonical game or receives an account mismatch
- WHEN a client opens the canonical game or receives an account mismatch
- THEN it SHALL use the sole cookie entrypoint, validate profile and protocol data, and invalidate stale identity without storing browser credentials

### Requirement: Canonical entry and snapshot authority
The client SHALL satisfy the following contract:
- Only explicit WORLD_ENTRY_REQUIRED permits an enter intent; concurrent ALREADY_IN_WORLD resumes a fresh snapshot.
- Stream snapshots, not acknowledgements, update authoritative position/NPC/map state.
- Same-account tabs do not create duplicate players. Same-region peers and living outdoor NPCs are rendered from the server snapshot only.

#### Scenario: A user enters the world or opens another tab of the same account
- WHEN a user enters the world or opens another tab of the same account
- THEN entry SHALL require WORLD_ENTRY_REQUIRED, ALREADY_IN_WORLD SHALL resume a fresh snapshot, and only snapshots SHALL establish one player and visible peers and NPCs

### Requirement: Server-validated navigation lifecycle
The client SHALL satisfy the following contract:
- Region geometry changes cancel stale navigation and rebuild the scene.
- Transition actions are server-validated; no teleport, client coordinates, actor or resource fields are sent.
- Disconnect, expired identity, malformed state, blur, typing and canceled navigation stop movement.

#### Scenario: Geometry changes, identity expires, or navigation is interrupted
- WHEN geometry changes, identity expires, or navigation is interrupted
- THEN the client SHALL cancel stale movement and rebuild changed geometry; transition requests SHALL contain no client coordinates, actor or resource authority

### Requirement: Honest availability and release gates
The client SHALL satisfy the following contract:
- Known unavailable/unsupported regions and unavailable progress are explicit. Supplies/rewards/beacon/chat are never invented as canonical gameplay.
- Existing files/data are preserved; a production switch remains blocked on migration and adapter review plus final CI.

#### Scenario: The client receives unsupported or unresolved gameplay state before production review is complete
- WHEN the client receives unsupported or unresolved gameplay state before production review is complete
- THEN it SHALL display explicit unavailability without fabricated progress or resources and SHALL preserve existing data while keeping the production switch blocked on migration, adapter review and final CI

## Verification
Pure tests cover schema validation, account mismatch, stale snapshots, canonical entry/resume, exact API bodies, malformed ACK, reconnect and transition serialization. Normal sandboxed browser UI must verify registration/login, movement/navigation/cancellation, two peers, NPC rendering and region crossings against the reviewed unified fixture server before release.

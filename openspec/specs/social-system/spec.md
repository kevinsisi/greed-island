# social-system Specification

## Purpose
TBD - created by archiving change add-social-system-and-roles. Update Purpose after archive.
## Requirements
### Requirement: Friendships

Friendship SHALL be undirected; a row in `friends` represents one accepted edge between two distinct accounts. A pending request MUST be acceptable, rejectable, or replaceable by a fresh request from either side after rejection. Self-friendship MUST be rejected at the API layer with code `SELF_REQUEST`. Removing a friend MUST delete the edge entirely, and either side MAY remove.

#### Scenario: Self-friendship is rejected

- **WHEN** a player sends a friend request to their own account id
- **THEN** the API rejects the request with code `SELF_REQUEST`
- **AND** no friendship row is inserted

### Requirement: Private messages

Each row in `messages` SHALL be a directed `(sender, receiver)` record with content of 1-1000 chars after trim and a `read_at` timestamp set when the receiver fetches the conversation. `GET /social/messages/:userId` MUST mark all unread messages from that peer as read in a single transaction before returning the slice. `GET /social/conversations` SHALL return a peer-grouped projection with peer summary, last message, and unread count for the requester. Messages MUST NOT be deleted on unfriend.

#### Scenario: Conversation fetch marks messages read

- **GIVEN** user A has sent unread messages to user B
- **WHEN** user B calls `GET /social/messages/A`
- **THEN** all unread messages from A to B have `read_at` set
- **AND** the returned conversation includes those messages

### Requirement: Alliances

An alliance SHALL have a unique name, a leader, and at most five members including the leader. Only the leader MAY invite. When the leader leaves, the next-joined member MUST be promoted automatically. When the last member leaves, the alliance row MUST be deleted. A user MUST belong to at most one alliance at a time.

#### Scenario: Last alliance member leaves

- **WHEN** the leader leaves an alliance with no other members
- **THEN** the alliance row and its membership are deleted in the same transaction
- **AND** the response indicates `disbanded: true`

### Requirement: Presence

`POST /social/presence` SHALL upsert `(user_id, tile_id, last_seen_tick)` using the runtime's current tick. A player MUST count as in tile X if `last_seen_tick >= currentTick - PRESENCE_FRESH_TICKS` where `PRESENCE_FRESH_TICKS` is 60. Entering a new tile MUST publish `presence.enter` to existing peers there and `presence.leave` to peers in the previous tile via SocialBus.

#### Scenario: Entering a tile emits presence hints

- **GIVEN** player A was previously present in tile `t_old`
- **WHEN** A posts presence for tile `t_new`
- **THEN** peers in `t_new` receive `presence.enter`
- **AND** peers in `t_old` receive `presence.leave`

### Requirement: SSE stream

`/api/social/stream` SHALL be an authenticated EventSource endpoint that emits per-receiver events. Auth MUST support `Authorization: Bearer <jwt>` or `?access_token=<jwt>` for browser EventSource. Event types MUST include `friend.request`, `friend.accepted`, `friend.rejected`, `friend.removed`, `message.new`, `presence.enter`, `presence.leave`, and `alliance.invited`. The stream SHALL be a real-time hint; clients MUST reconcile with REST endpoints for source-of-truth state.

#### Scenario: New message pushes via SSE

- **WHEN** user A sends a message to user B
- **THEN** the server publishes a `message.new` event to user B with the receiver-side payload `{ from, messageId, preview }`
- **AND** the message is persisted with `read_at = NULL`
- **AND** the next call by user B to `GET /social/messages/A` marks the row as read

### Requirement: Player avatar rendering SHALL distinguish social presence from simulation authority

Player avatar rendering MAY use authenticated social presence coordinates for showing nearby players, but those coordinates and any derived visual action are social/UI presence, not living-world simulation authority. Unless the server exposes an explicit action field, peer player avatars MUST be limited to safe visual states derived from presence position changes.

#### Scenario: Nearby player avatar uses presence coordinates

- **GIVEN** `/api/social/nearby` returns player `p1` with `x`, `y`, and `z`
- **WHEN** the Hub or Area scene renders peer player avatars
- **THEN** `p1` MAY be rendered at those coordinates
- **AND** missing coordinates MUST use an existing safe fallback placement, not a fabricated world action

#### Scenario: Peer player action is not overclaimed

- **GIVEN** `/api/social/nearby` does not include a player action field
- **WHEN** the frontend observes position deltas and renders a walking pose
- **THEN** that pose MUST be treated as visual interpolation only
- **AND** the UI MUST NOT claim the player is working, trading, patrolling, eating, or sleeping

#### Scenario: Controlled player animation does not mutate world state

- **GIVEN** the local player avatar plays idle or walk animation from keyboard/pointer input
- **WHEN** the frontend posts `/api/social/presence`
- **THEN** the request MAY include coordinates
- **AND** it MUST NOT mutate NPC state, settlement state, world facts, or combat state


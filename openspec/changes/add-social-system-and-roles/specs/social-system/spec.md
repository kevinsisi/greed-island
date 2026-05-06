# social-system

The social-system capability gives each authenticated player a way to find, befriend, and message other players, plus form an alliance of up to five members. It exposes presence so the AreaPage can show same-area players in real time.

## Requirements

### Friendships

- Friendship is undirected; a row in `friends` represents one accepted edge between two distinct accounts.
- A pending request can be accepted (status='accepted', responded_at set), rejected (status='rejected'), or replaced by a fresh request from either side after a rejection.
- Self-friendship is rejected at the API layer with code `SELF_REQUEST`.
- Removing a friend deletes the edge entirely; either side may remove.

### Private messages

- Each row in `messages` is a directed (sender, receiver) record with content (1–1000 chars after trim) and a `read_at` timestamp set when the receiver fetches the conversation.
- `GET /social/messages/:userId` marks all unread messages from that peer as read in a single transaction before returning the slice.
- `GET /social/conversations` returns a peer-grouped projection: peer summary, last message, unread count for the requester.
- Messages are not deleted on unfriend; the conversation remains accessible until either account is deleted.

### Alliances

- An alliance has a unique name, a leader, and at most five members (including the leader).
- Only the leader can invite. The leader has no other privileges (members may all leave individually).
- When the leader leaves, the next-joined member is promoted automatically. When the last member leaves, the alliance row is deleted.
- A user can belong to at most one alliance at a time (enforced by a UNIQUE constraint on `alliance_members.user_id`).

### Presence

- `POST /social/presence` upserts `(user_id, tile_id, last_seen_tick)` using the runtime's current tick.
- A player counts as "in tile X" if `last_seen_tick >= currentTick - PRESENCE_FRESH_TICKS` (60 ticks ≈ 5 minutes at the 5s tick).
- Entering a new tile publishes `presence.enter` to existing peers there and `presence.leave` to peers in the previous tile via SocialBus.

### SSE stream

- `/api/social/stream` is an authenticated EventSource endpoint that emits per-receiver events.
- Auth supports `Authorization: Bearer <jwt>` (preferred) or `?access_token=<jwt>` (for browser EventSource).
- Event types: `friend.request`, `friend.accepted`, `friend.rejected`, `friend.removed`, `message.new`, `presence.enter`, `presence.leave`, `alliance.invited`.
- The stream is a real-time hint — clients reconcile with REST endpoints (friends, conversations, alliance) for source-of-truth state.

#### Scenario: New message pushes via SSE

- **WHEN** user A sends a message to user B
- **THEN** the server publishes a `message.new` event to user B with the receiver-side payload `{ from, messageId, preview }`
- **AND** the message is persisted with `read_at = NULL`
- **AND** the next call by user B to `GET /social/messages/A` marks the row as read

#### Scenario: Last alliance member leaves

- **WHEN** the leader leaves an alliance with no other members
- **THEN** the alliance row and its membership are deleted in the same transaction
- **AND** the response indicates `disbanded: true`

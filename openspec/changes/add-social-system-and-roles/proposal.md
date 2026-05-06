## Why

Greed Island has only ever modeled the player vs. world; players cannot see or contact each other. The world feels lonely even with NPC dialog. We add a player social layer (friends, private messages, alliances, area presence) and a role/permission system so the existing Gemini key pool is no longer reachable by every signed-in account. The role system also makes "GM-run sessions" possible later: a designated game-master can adjust runtime parameters without standing up a separate admin app.

## What Changes

- Add accounts.role column (`player|gm|admin`); first registrant promoted to admin on creation; legacy `GREED_ISLAND_ADMIN_EMAILS` env now triggers a one-shot promotion at boot rather than gating routes itself.
- Replace the email allow-list gate on /api/settings/* with a role-based middleware (`requireRole('gm','admin')`); JWTs now carry role but the middleware re-reads role from DB so demotions take effect immediately.
- Add /api/admin/users (list) and /api/admin/users/:id/role (PUT) for admins to manage roles. Last admin cannot demote themselves.
- Add SocialStore (SQLite tables: friends, messages, alliances, alliance_members, player_locations) and createSocialRouter:
  - friends: POST friend-request/:id, POST friend-accept/:id, POST friend-reject/:id, GET friends, GET friend-requests, DELETE friends/:id
  - messages: POST message/:id, GET messages/:id, GET conversations
  - alliance: POST alliance/{create,invite/:id,leave}, GET alliance (max 5 members)
  - presence: POST social/presence (tileId), GET social/nearby[?tileId]
- Add per-user SSE at /api/social/stream with optional `?access_token=` query support so EventSource can authenticate without custom headers; SocialBus pub/sub feeds friend.*, message.new, presence.*, alliance.invited events.
- Frontend additions: /social page (friends, requests, messages, alliance tabs), /admin page (role management), NearbyPlayers component on AreaPage with click-to-popup (profile/friend/message/trade placeholder), role-gated nav entries in GameShell, /api/version-driven version display.
- Bump version to 0.5.0 (server + web + root package.json).

## Capabilities

### New Capabilities
- `social-system`: Friends, private messages, alliances, area presence, per-user SSE.
- `account-roles`: player/gm/admin role column, role-aware JWT, role middleware, admin role-management API.

### Modified Capabilities
- `ai-npc-dialog` settings gate moves from email allow-list to role-based gate.

## Impact

- Affects accounts schema (added role column, migration on boot for legacy DBs).
- Affects all /api/settings/* routes — they now require role gm or admin.
- Adds five new SQLite tables for the social layer; foreign keys cascade on account deletion.
- Out of scope: presence on Phaser map (only the area page list is wired this round); card trade between players (left as UI placeholder); friends-of-friends suggestions; cross-tile chat channels.

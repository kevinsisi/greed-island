# Tasks

## Backend

- [x] Add `role` column to accounts schema with backfill migration; first-registrant auto-promoted to admin.
- [x] Implement `requireRole(...)` middleware that re-reads role from DB.
- [x] Replace settings router admin-email gate with `requireRole('gm','admin')`.
- [x] Add admin router with `GET /admin/users` and `PUT /admin/users/:id/role` (admin only, last-admin guard).
- [x] Add SocialStore with friends/messages/alliances/alliance_members/player_locations tables.
- [x] Add SocialBus + createSocialRouter (friends/messages/alliance/presence).
- [x] Add per-user SSE at /api/social/stream that accepts header or `?access_token=` for EventSource compatibility.

## Frontend

- [x] Extend api/client.ts with social, version, and admin endpoints + role types on ServerAccount.
- [x] Build /social page with 4 tabs (friends, requests, messages, alliance).
- [x] Build /admin page with role management table.
- [x] Add NearbyPlayers component + popup to AreaPage.
- [x] Role-gate nav items in GameShell; player can't see admin/settings.
- [x] Show server-driven version (mismatched client/server warns red).
- [x] Add zh + en i18n strings for social and admin.

## Release

- [x] Bump version constants (server, web, root package.json) to 0.5.0.
- [x] `npm run check` (build + tests) green; 44 tests pass.
- [x] Update memory project_deploy_state.md to reflect v0.5.0.
- [ ] `docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d --build` and verify /api/version + /api/social/friends + /api/admin/users.

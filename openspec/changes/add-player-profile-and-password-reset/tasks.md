# Tasks

## Backend

- [x] Extend accounts schema with `nickname` and `avatar` columns + additive migration.
- [x] Add `AccountStore.updateProfile` / `verifyPasswordById` / `updatePassword` and `normalizeNickname`.
- [x] Hardcode owner allow-list (`kevin950805@gmail.com`) merged with env list; promote on every boot.
- [x] Add `PasswordResetStore` (single-use tokens, 1-hour TTL, expired pruning).
- [x] Add `POST /api/auth/forgot-password` and `POST /api/auth/reset-password`.
- [x] Add profile router: `GET /api/profile`, `PATCH /api/profile`, `POST /api/profile/password`.
- [x] Add `POST /api/admin/users/:id/reset-password` that mints a single-use reset token for the GM to hand off.
- [x] Update `toPublicAccount` to include nickname / avatar / displayName.
- [x] Make social `accountToSummary` respect nickname.

## Frontend

- [x] Extend `api/client.ts` with profile, forgot/reset password, and admin reset endpoints; add nickname/avatar/displayName on `ServerAccount`.
- [x] Add `Avatar` component + 8 glyph presets and `AvatarPicker`.
- [x] Build `/profile` page (nickname, avatar, password change, language, sign-out).
- [x] Build `/forgot-password` page (returns generated reset link copy-to-clipboard).
- [x] Build `/reset-password` page (token via URL or paste, auto sign-in on success).
- [x] Extend `/admin` page with reset-password button + modal showing the generated link.
- [x] Update `/account` page: forgot-password link in login mode, profile/admin/settings shortcuts when signed in, email hint in register mode.
- [x] Update GameShell nav: visibility predicate is `account` not just role; brandbar pill shows avatar + displayName and links to `/profile` when signed in; mobile bar trimmed to 5 slots.
- [x] zh + en i18n keys for profile, forgot, reset, admin reset password, nav.profile.

## Release

- [x] Bump version constants to 0.6.0 (server, web, root package.json).
- [x] `npm run check` (build + tests) green; 44 tests pass.
- [ ] Update memory `project_deploy_state.md` to reflect v0.6.0.
- [ ] `docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d --build` on the desktop and verify `/api/version` returns 0.6.0, `/profile` saves nickname/avatar, `/forgot-password` mints a token, and `/reset-password?token=<token>` rotates the password.

## Why

Players have no way to change their displayed name, no way to recover from a forgotten password without database surgery, and no separation between "GM tools" (API key pool) and "admin tools" (role + password resets). The owner email also needs a stable path to admin role on a fresh deploy without remembering to set `GREED_ISLAND_ADMIN_EMAILS`.

## What Changes

- Extend accounts schema with `nickname` (TEXT, nullable, max 24 chars) and `avatar` (TEXT, default `'tide'`); migration adds the columns to legacy DBs without losing data. `displayName` is derived as `nickname ?? email-handle`.
- Add hardcoded owner allow-list (`kevin950805@gmail.com`) merged with env-supplied `GREED_ISLAND_ADMIN_EMAILS` and re-applied on every boot.
- Add `password_resets` table (token, account_id, expires_at, used_at, created_at) with single-use 1-hour tokens; previously outstanding tokens for the same account are invalidated when a new one is issued.
- Add `POST /api/auth/forgot-password` — returns reset token in JSON because email delivery is not wired in; admin can also see it in server logs.
- Add `POST /api/auth/reset-password` — consumes token + rotates password hash + re-issues JWT.
- Add player profile router (auth-gated): `GET /api/profile`, `PATCH /api/profile` (nickname/avatar), `POST /api/profile/password` (current + new).
- Add admin reset-on-behalf: `POST /api/admin/users/:id/reset-password` returns single-use token + reset path so the GM can hand it to the player out of band.
- Frontend additions: `/profile` page (nickname, avatar picker with 8 presets, password change, language toggle), `/forgot-password`, `/reset-password?token=...`, admin-issued reset modal in `/admin`. Avatar component used in brandbar + admin list.
- Nav split: `/profile` for every signed-in player, `/settings` for GM+admin (renamed to "API 金鑰" / "API keys" so its purpose is unambiguous), `/admin` for admins only. `/account` becomes the guest gate; the brandbar pill links to `/profile` when signed in.
- Bump version to 0.6.0 (server + web + root package.json).

## Capabilities

### Modified Capabilities
- `account-roles`: now persists nickname + avatar and exposes a player profile editor; admins can mint single-use password reset links for any account.

## Impact

- Affects accounts schema (additive: nickname, avatar columns) and adds the password_resets table.
- Affects all auth response shapes (ServerAccount now carries nickname/avatar/displayName); existing clients that only read `account.email` keep working.
- The hardcoded owner allow-list runs alongside the env list — does not remove env support.
- Out of scope: real outbound email (still printed/JSON-returned), avatar uploads (only preset glyphs this round), profile activity stream.

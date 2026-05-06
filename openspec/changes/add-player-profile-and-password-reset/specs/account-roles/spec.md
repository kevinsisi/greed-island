# account-roles (delta)

Extends the account-roles capability with player profile fields, a self-service profile editor, password rotation, and admin-issued password resets.

## Modified Requirements

### Role values + owner allow-list

- Each account still has exactly one role: `'player' | 'gm' | 'admin'`.
- New accounts default to `player`; the very first account on a fresh DB is created as `admin`.
- Owner allow-list `kevin950805@gmail.com` is hardcoded and merged with the env-supplied `GREED_ISLAND_ADMIN_EMAILS` list. Every boot promotes any registered account whose email is on the merged list and is not already admin. Unregistered emails stay queued; promotion runs again on each boot.

### JWT and public account shape

- Tokens issued by `/api/auth/{login,register,reset-password}` include `{ sub, email, role }`.
- `/api/auth/me` returns `{ account: { id, email, createdAt, role, nickname, avatar, displayName } }`.
- `displayName` is derived as `nickname ?? email.split('@')[0]`.

## New Requirements

### Profile fields

- `accounts.nickname` is nullable TEXT, max 24 trimmed chars, unique to the user (not enforced).
- `accounts.avatar` is non-null TEXT defaulting to `'tide'`. Allowed values are an enum (`tide`, `fox`, `lantern`, `sword`, `leaf`, `moon`, `flame`, `mask`); unknown stored values render as `'tide'`.
- Schema migration is additive: `ALTER TABLE accounts ADD COLUMN nickname TEXT` and `ALTER TABLE accounts ADD COLUMN avatar TEXT NOT NULL DEFAULT 'tide'`. No row rewrite.

### Profile API

- `GET /api/profile` (auth) returns `{ account, avatarPresets }` where `avatarPresets` is the server-defined list.
- `PATCH /api/profile` (auth) accepts any subset of `{ nickname?: string|null, avatar?: string }`. Empty/whitespace nickname stores `NULL`. Avatar must be in the preset list (400 `INVALID_AVATAR` otherwise).
- `POST /api/profile/password` (auth) accepts `{ currentPassword, newPassword }`. 401 `INVALID_CURRENT_PASSWORD` on a mismatch; 400 `WEAK_PASSWORD` if the new password is shorter than 8 chars.

### Password reset (self-service)

- `password_resets` table: `(id, account_id, token UNIQUE, expires_at, used_at, created_at)`. Foreign key cascades on account delete.
- `POST /api/auth/forgot-password` accepts `{ email }`. If the email is registered the server mints a 32-hex-char single-use token (1-hour TTL), invalidates any prior outstanding token for the same account, and returns `{ ok: true, issued: true, token, expiresAt, message }`. If the email is not registered the response is `{ ok: true, issued: false, message }` so existence does not leak.
- `POST /api/auth/reset-password` accepts `{ token, password }`. On success: marks the token used, rotates the password hash, issues a new JWT, returns `{ ok: true, token, account }`. Failure modes: 400 `INVALID_TOKEN` (unknown / expired / already-used), 400 `WEAK_PASSWORD`, 404 `USER_NOT_FOUND`.
- Tokens older than 30 days are pruned on boot regardless of state.

### Admin-issued reset

- `POST /api/admin/users/:id/reset-password` (admin) mints a fresh single-use reset token for the target account and returns `{ ok: true, target: { id, email }, token, expiresAt, resetPath }` so the GM can hand the URL to the player out of band.

#### Scenario: Owner email is auto-promoted on every boot

- **GIVEN** an account `kevin950805@gmail.com` exists with role `player`
- **WHEN** the server starts
- **THEN** the account's role is upgraded to `admin` and the boot log records the promotion

#### Scenario: Profile update changes nickname and avatar

- **GIVEN** a signed-in player
- **WHEN** the player sends `PATCH /api/profile` with `{ nickname: " Tide Reader ", avatar: "fox" }`
- **THEN** the stored nickname is `Tide Reader`, the stored avatar is `fox`, and the response returns the new account payload with `displayName = "Tide Reader"`.

#### Scenario: Password reset consumes a single-use token

- **GIVEN** a player has been issued a reset token via `forgot-password`
- **WHEN** the player POSTs `/api/auth/reset-password` with that token and a new password ≥ 8 chars
- **THEN** the password hash is rotated, the token is marked used, and a fresh JWT is returned. A second submission with the same token fails with 400 `INVALID_TOKEN`.

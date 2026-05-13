# account-roles (delta)

Extends the account-roles capability with player profile fields, a self-service profile editor, password rotation, and admin-issued password resets.

## MODIFIED Requirements

### Requirement: Role values and owner allow-list

Each account SHALL still have exactly one role: `'player' | 'gm' | 'admin'`. New accounts MUST default to `player`; the very first account on a fresh DB MUST be created as `admin`. Owner allow-list `kevin950805@gmail.com` SHALL be hardcoded and merged with the env-supplied `GREED_ISLAND_ADMIN_EMAILS` list. Every boot MUST promote any registered account whose email is on the merged list and is not already admin. Unregistered emails MUST stay queued; promotion MUST run again on each boot.

#### Scenario: Owner email is auto-promoted on every boot

- **GIVEN** an account `kevin950805@gmail.com` exists with role `player`
- **WHEN** the server starts
- **THEN** the account's role is upgraded to `admin` and the boot log records the promotion

### Requirement: JWT and public account shape

Tokens issued by `/api/auth/{login,register,reset-password}` SHALL include `{ sub, email, role }`. `/api/auth/me` SHALL return `{ account: { id, email, createdAt, role, nickname, avatar, displayName } }`. `displayName` MUST be derived as `nickname ?? email.split('@')[0]`.

#### Scenario: Current-account payload exposes profile display fields

- **GIVEN** a signed-in player has `nickname = NULL` and `avatar = 'fox'`
- **WHEN** the player calls `/api/auth/me`
- **THEN** the response includes `nickname`, `avatar`, and `displayName`
- **AND** `displayName` falls back to the email local part when nickname is absent

## ADDED Requirements

### Requirement: Profile fields

`accounts.nickname` SHALL be nullable TEXT with max 24 trimmed chars and unique to the user (not enforced). `accounts.avatar` SHALL be non-null TEXT defaulting to `'tide'`. Allowed values MUST be an enum (`tide`, `fox`, `lantern`, `sword`, `leaf`, `moon`, `flame`, `mask`); unknown stored values MUST render as `'tide'`. Schema migration MUST be additive: `ALTER TABLE accounts ADD COLUMN nickname TEXT` and `ALTER TABLE accounts ADD COLUMN avatar TEXT NOT NULL DEFAULT 'tide'`. No row rewrite SHALL be required.

#### Scenario: Profile columns are added additively

- **GIVEN** an existing accounts table without profile columns
- **WHEN** the server boots and runs migrations
- **THEN** `nickname` and `avatar` columns exist
- **AND** existing accounts keep their row identity and receive the default avatar value

### Requirement: Profile API

`GET /api/profile` (auth) SHALL return `{ account, avatarPresets }` where `avatarPresets` is the server-defined list. `PATCH /api/profile` (auth) SHALL accept any subset of `{ nickname?: string|null, avatar?: string }`. Empty/whitespace nickname MUST store `NULL`. Avatar MUST be in the preset list (400 `INVALID_AVATAR` otherwise). `POST /api/profile/password` (auth) SHALL accept `{ currentPassword, newPassword }`. The endpoint MUST return 401 `INVALID_CURRENT_PASSWORD` on a mismatch and 400 `WEAK_PASSWORD` if the new password is shorter than 8 chars.

#### Scenario: Profile update changes nickname and avatar

- **GIVEN** a signed-in player
- **WHEN** the player sends `PATCH /api/profile` with `{ nickname: " Tide Reader ", avatar: "fox" }`
- **THEN** the stored nickname is `Tide Reader`, the stored avatar is `fox`, and the response returns the new account payload with `displayName = "Tide Reader"`

### Requirement: Password reset self-service

`password_resets` table SHALL store `(id, account_id, token UNIQUE, expires_at, used_at, created_at)` and MUST cascade when the account is deleted. `POST /api/auth/forgot-password` SHALL accept `{ email }`; registered emails MUST mint a 32-hex-char single-use token with 1-hour TTL, invalidate prior outstanding tokens for that account, and return `{ ok: true, issued: true, token, expiresAt, message }`. Unregistered emails MUST return `{ ok: true, issued: false, message }` so existence does not leak. `POST /api/auth/reset-password` SHALL accept `{ token, password }`; success MUST mark the token used, rotate the password hash, issue a new JWT, and return `{ ok: true, token, account }`. Failure modes MUST be 400 `INVALID_TOKEN`, 400 `WEAK_PASSWORD`, and 404 `USER_NOT_FOUND`. Tokens older than 30 days MUST be pruned on boot regardless of state.

#### Scenario: Password reset consumes a single-use token

- **GIVEN** a player has been issued a reset token via `forgot-password`
- **WHEN** the player POSTs `/api/auth/reset-password` with that token and a new password of at least 8 chars
- **THEN** the password hash is rotated, the token is marked used, and a fresh JWT is returned
- **AND** a second submission with the same token fails with 400 `INVALID_TOKEN`

### Requirement: Admin-issued reset

`POST /api/admin/users/:id/reset-password` (admin) SHALL mint a fresh single-use reset token for the target account and return `{ ok: true, target: { id, email }, token, expiresAt, resetPath }` so the GM can hand the URL to the player out of band.

#### Scenario: Admin mints a reset link for a player

- **GIVEN** an admin is signed in and a target player account exists
- **WHEN** the admin posts to `/api/admin/users/:id/reset-password`
- **THEN** the response includes a single-use reset token and reset path for that player
- **AND** the player's password is not changed until the reset token is submitted

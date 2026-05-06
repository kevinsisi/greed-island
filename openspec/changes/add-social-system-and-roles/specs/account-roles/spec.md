# account-roles

The account-roles capability adds a discrete role on every account that gates server-side capabilities, replacing the legacy email-allow-list gate that previously protected the Gemini key pool.

## Requirements

### Role values

- Each account has exactly one role: `'player' | 'gm' | 'admin'`.
- New accounts default to `player`. The very first account on a fresh database (`COUNT(*) = 0` at insert time) is created as `admin` so a freshly-deployed instance always has someone in charge.
- The `GREED_ISLAND_ADMIN_EMAILS` env var, if set, is interpreted as a one-shot allow-list at boot: each listed account that is not already admin is promoted to admin during `createHttpApp(...)`. After boot, the env list does not gate any route.

### Migrations

- The boot path runs `PRAGMA table_info(accounts)`; if no `role` column exists, it adds one with default `'player'`.
- After ensuring the column exists, if the table has rows but no admin, the earliest account (`MIN(id)`) is promoted to admin so legacy DBs gain a controller.

### Gating

- `requireRole(authConfig, accountStore, ...allowedRoles)` returns an Express middleware that verifies the JWT, **re-reads the role from the database**, and either passes (adding `req.auth = { sub, email, role }`) or returns 401/403.
- Re-reading guarantees that demotions take effect on the next request even when an older JWT carries an outdated role claim.
- /api/settings/* uses `requireRole('gm','admin')`; /api/admin/* uses `requireRole('admin')`.

### Admin role-management API

- `GET /api/admin/users` returns all accounts (id, email, role, createdAt) — admin only.
- `PUT /api/admin/users/:id/role` accepts `{ role }` and updates the target account's role. Constraints:
  - 400 `INVALID_ROLE` if body.role is not in {player, gm, admin}.
  - 404 `USER_NOT_FOUND` if the target account does not exist.
  - 409 `LAST_ADMIN` if the change would leave zero admins (either the caller demoting themselves or another admin being the sole survivor).

### JWT shape

- Tokens issued by /api/auth/{login,register} include `{ sub, email, role }`.
- `/api/auth/me` returns `{ account: { id, email, createdAt, role } }`.

#### Scenario: First-registered account becomes admin

- **WHEN** the accounts table is empty and a new account registers
- **THEN** the new row is inserted with `role = 'admin'`
- **AND** the issued JWT carries `role: 'admin'`

#### Scenario: Demoting the last admin is rejected

- **WHEN** an admin attempts to set their own role to `player` or `gm` and they are the only admin
- **THEN** the request fails with HTTP 409 `LAST_ADMIN` and the role is unchanged

# account-roles Specification

## Purpose
TBD - created by archiving change add-staff-shortcuts-and-mobile-version. Update Purpose after archive.
## Requirements
### Requirement: Profile page surfaces staff shortcuts

The signed-in `/profile` page SHALL render an additional "staff shortcuts" section whose visibility depends on the viewer's role, and which provides links to the role-gated pages that the mobile bottom nav cannot show.

#### Scenario: admin sees both shortcuts

- **GIVEN** a signed-in account whose role is `admin`
- **WHEN** the user opens `/profile`
- **THEN** the page shows a staff-shortcut section with a link to `/settings` and a link to `/admin`

#### Scenario: gm sees only settings

- **GIVEN** a signed-in account whose role is `gm`
- **WHEN** the user opens `/profile`
- **THEN** the page shows a staff-shortcut section with a link to `/settings` and no link to `/admin`

#### Scenario: player sees no shortcuts

- **GIVEN** a signed-in account whose role is `player`
- **WHEN** the user opens `/profile`
- **THEN** the staff-shortcut section is not rendered

#### Scenario: shortcuts do not bypass role gates

- **GIVEN** any account viewing `/profile`
- **WHEN** the user clicks the rendered shortcut to `/settings` or `/admin`
- **THEN** the underlying route still enforces its existing role check; the shortcut is purely navigational and does not change the role-gating of the destination page or its API endpoints.

### Requirement: Role values

Each account SHALL have exactly one role: `'player' | 'gm' | 'admin'`. New accounts MUST default to `player`. The very first account on a fresh database (`COUNT(*) = 0` at insert time) MUST be created as `admin` so a freshly-deployed instance always has someone in charge. The `GREED_ISLAND_ADMIN_EMAILS` env var, if set, SHALL be interpreted as a one-shot allow-list at boot: each listed account that is not already admin MUST be promoted to admin during `createHttpApp(...)`. After boot, the env list MUST NOT gate any route.

#### Scenario: First-registered account becomes admin

- **WHEN** the accounts table is empty and a new account registers
- **THEN** the new row is inserted with `role = 'admin'`
- **AND** the issued JWT carries `role: 'admin'`

### Requirement: Migrations

The boot path SHALL run `PRAGMA table_info(accounts)`; if no `role` column exists, it MUST add one with default `'player'`. After ensuring the column exists, if the table has rows but no admin, the earliest account (`MIN(id)`) MUST be promoted to admin so legacy DBs gain a controller.

#### Scenario: Legacy database gains an admin

- **GIVEN** an existing accounts table has rows but no `role` column
- **WHEN** the server boots
- **THEN** the `role` column exists
- **AND** the earliest account is promoted to `admin`

### Requirement: Gating

`requireRole(authConfig, accountStore, ...allowedRoles)` SHALL return an Express middleware that verifies the JWT, re-reads the role from the database, and either passes by adding `req.auth = { sub, email, role }` or returns 401/403. Re-reading MUST guarantee that demotions take effect on the next request even when an older JWT carries an outdated role claim. `/api/settings/*` MUST use `requireRole('gm','admin')`; `/api/admin/*` MUST use `requireRole('admin')`.

#### Scenario: Demotion takes effect before JWT expiry

- **GIVEN** a user has an old JWT that says `role = 'admin'`
- **AND** the database role has been changed to `player`
- **WHEN** the user calls an admin endpoint
- **THEN** the middleware re-reads the database role and rejects the request with HTTP 403

### Requirement: Admin role-management API

`GET /api/admin/users` SHALL return all accounts as `(id, email, role, createdAt)` and require admin role. `PUT /api/admin/users/:id/role` SHALL accept `{ role }` and update the target account's role. The endpoint MUST return 400 `INVALID_ROLE` if `body.role` is not in `{player, gm, admin}`, 404 `USER_NOT_FOUND` if the target account does not exist, and 409 `LAST_ADMIN` if the change would leave zero admins.

#### Scenario: Demoting the last admin is rejected

- **WHEN** an admin attempts to set their own role to `player` or `gm` and they are the only admin
- **THEN** the request fails with HTTP 409 `LAST_ADMIN`
- **AND** the role is unchanged

### Requirement: JWT shape

Tokens issued by `/api/auth/{login,register}` SHALL include `{ sub, email, role }`. `/api/auth/me` SHALL return `{ account: { id, email, createdAt, role } }`.

#### Scenario: Login token includes role

- **GIVEN** a registered account with role `gm`
- **WHEN** the account logs in successfully
- **THEN** the issued JWT contains `role: 'gm'`
- **AND** `/api/auth/me` returns the same role in the account payload


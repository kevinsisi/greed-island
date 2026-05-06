## ADDED Requirements

### Requirement: Users self-register with username and password
The platform SHALL provide self-service user registration with a username and password. Registration MUST NOT require operator intervention in the default flow.

#### Scenario: Self-registration creates a Player account
- **WHEN** a user submits a valid registration form with a unique username and a password meeting the configured complexity rule
- **THEN** the platform MUST create a new user record with the Player role bundle and MUST establish an authenticated session for that user

#### Scenario: Duplicate username is rejected
- **WHEN** a registration attempt uses a username that already exists
- **THEN** the platform MUST reject the registration without creating a duplicate record

### Requirement: Passwords are stored using bcrypt
Passwords SHALL be stored as `bcrypt` hashes with a per-deployment cost factor configurable via environment variable. Plaintext passwords MUST NEVER be persisted, logged, or transmitted in responses.

#### Scenario: Password hash is non-reversible
- **WHEN** a user record is inspected
- **THEN** the password column MUST contain a `bcrypt` hash, and the original plaintext password MUST NOT be retrievable from the database

#### Scenario: Password is never logged
- **WHEN** the registration or login path is exercised
- **THEN** no log line, error response, or audit record MUST contain the plaintext password

### Requirement: Sessions use JWT in an httpOnly cookie
Authenticated sessions SHALL be carried by a JWT delivered as an `httpOnly`, `Secure`, `SameSite=Lax` (or stricter) cookie. The frontend MUST NOT store the JWT in `localStorage` or `sessionStorage`.

#### Scenario: JWT is not accessible to client JavaScript
- **WHEN** the frontend runs in a browser after login
- **THEN** the JWT cookie MUST NOT be readable from `document.cookie` and MUST NOT appear in `localStorage` or `sessionStorage`

#### Scenario: Logout clears the session cookie
- **WHEN** a user logs out
- **THEN** the server MUST instruct the browser to clear the JWT cookie and subsequent protected-route requests MUST be rejected as unauthenticated

### Requirement: Permissions are a bitmask integer
Permissions SHALL be represented as a single bitmask integer column (`permission_bits`) on the user record. Each capability MUST be a distinct bit. Capabilities SHALL be granular enough that an operator can grant exactly the verbs a user needs without granting a whole role.

The capability bits SHALL include at minimum:
- `VIEW_WORLD`
- `VIEW_MAP`
- `VIEW_NPCS`
- `VIEW_EVENTS`
- `VIEW_CARDS`
- `TRADE`
- `COLLECT_CARDS`
- `WRITE_PLAYER_COMMAND` (reserved for future player-command intake; not used by v1 gameplay)
- `MANAGE_NPCS`
- `MANAGE_ECONOMY`
- `MANAGE_WORLD_EVENTS`
- `OPERATE_GM_TOOLS`
- `MANAGE_USERS`
- `MANAGE_AI_KEYS`

Additional bits MAY be added without renumbering existing bits.

#### Scenario: Permission check is a bitwise operation
- **WHEN** a protected API route or UI element checks whether a user is allowed to perform an action
- **THEN** the check MUST be `(user.permission_bits & REQUIRED_BIT) !== 0`, NOT a comparison against a role name

#### Scenario: Role-name-based authorization is forbidden
- **WHEN** the codebase is inspected for authorization decisions
- **THEN** there MUST NOT be any conditional that branches on a role name (e.g. `if (user.role === 'GM')`); authorization MUST always read individual capability bits

### Requirement: Role bundles are creation-time templates, not runtime authority
The platform SHALL provide named role bundles — Player, GM, Admin — that are **only templates** used at account creation, role-promotion, and admin-tooling presets. A role bundle MUST NOT participate in any runtime authorization decision; runtime checks MUST consult `permission_bits` directly.

The default bundles SHALL be:
- **Player** — `VIEW_WORLD`, `VIEW_MAP`, `VIEW_NPCS`, `VIEW_EVENTS`, `VIEW_CARDS`, `TRADE`, `COLLECT_CARDS`, plus eventual `WRITE_PLAYER_COMMAND` and own-profile management bits.
- **GM** — Player bits plus `MANAGE_NPCS`, `MANAGE_ECONOMY`, `MANAGE_WORLD_EVENTS`, `OPERATE_GM_TOOLS`.
- **Admin** — GM bits plus `MANAGE_USERS` and `MANAGE_AI_KEYS`.

Bundle definitions SHALL live in a single named-constants module so adding a capability bit updates every bundle at one site.

#### Scenario: Bundle template is applied at user creation
- **WHEN** a user is created with the Player bundle
- **THEN** the user's `permission_bits` MUST be set to exactly the OR of the Player bundle's bits at that moment, and the user record MUST NOT carry any separate role-name field that authorization code reads

#### Scenario: Admins can adjust individual bits independent of bundle
- **WHEN** an Admin grants or revokes a single capability bit on a specific user (e.g. enabling `MANAGE_AI_KEYS` on an otherwise-Player account)
- **THEN** the change MUST update only that bit on `permission_bits`, MUST NOT require switching the user's "role," and MUST NOT cascade-modify any other bit

#### Scenario: Promoting a user to GM applies the GM template once
- **WHEN** an Admin applies the GM bundle to an existing user
- **THEN** the operation MUST OR the GM bundle's bits onto the user's existing `permission_bits` (additive promotion), and a "demote to Player" operation MUST be the explicit complementary action that AND-NOTs the GM-only bits

### Requirement: GM and Admin actions flow through the kernel like any other Command
GM and Admin actions that mutate world state SHALL be expressed as Commands that pass through the Rule Engine. There MUST NOT be a privileged code path that appends Events directly to the EventLog without Rule Engine evaluation.

#### Scenario: GM SystemCommand is rule-evaluated
- **WHEN** a GM with `OPERATE_GM_TOOLS` triggers a world event
- **THEN** the action MUST be expressed as a SystemCommand, MUST be evaluated by the Rule Engine, and any resulting Events MUST be appended only after acceptance

#### Scenario: Admin user-management is non-simulation
- **WHEN** an Admin with `MANAGE_USERS` updates another user's permission bitmask
- **THEN** the change MUST be recorded in the user store and MUST NOT generate simulation Events; user identity is metadata, not WorldState

### Requirement: Authorization is enforced server-side
All protected API routes SHALL enforce permission checks on the server. The frontend MAY hide or disable UI elements based on permissions, but server-side enforcement MUST be authoritative.

#### Scenario: Direct API call without permission is rejected
- **WHEN** a user without the required capability bit calls a protected API route directly
- **THEN** the server MUST reject the request with an authorization error, regardless of frontend UI state

### Requirement: Public exposure is gated by the deployment hardening gate
The accounts and permissions capability SHALL be implemented to be ready for eventual public exposure, but v1 deployment access MUST remain Tailscale-internal. Public exposure MUST NOT be enabled until the deployment hardening gate (super-admin login restricted to Tailscale, SSH restricted to Tailscale, real-client-IP plumbing, backups for DB and `.env`) is satisfied.

#### Scenario: v1 access is internal-only
- **WHEN** v1 is deployed
- **THEN** `hunter.sisihome.org` MUST be reachable only over the Tailscale internal network and MUST NOT be reachable from the public internet

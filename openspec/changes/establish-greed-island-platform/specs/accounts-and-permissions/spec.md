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
Permissions SHALL be represented as a single bitmask integer column on the user record. Each capability MUST be a distinct bit.

The capability bits SHALL include at minimum:
- `READ_WORLD`
- `WRITE_PLAYER_COMMAND` (reserved for future player-command intake; not used by v1 gameplay)
- `MANAGE_NPCS`
- `MANAGE_USERS`
- `MANAGE_ECONOMY`
- `OPERATE_GM_TOOLS`
- `MANAGE_AI_KEYS`

Additional bits MAY be added without renumbering existing bits.

#### Scenario: Permission check is a bitwise operation
- **WHEN** a protected API route checks whether a user is allowed to perform an action
- **THEN** the check MUST be a bitwise AND between the user's permission bitmask and the required capability bit

### Requirement: Role bundles are computed from the bitmask
The platform SHALL define three named role bundles that compose capability bits. A role bundle MUST be a *view* on the bitmask, not a separate enum that can drift out of sync.

The bundles SHALL be:
- **Player** — `READ_WORLD` plus eventual `WRITE_PLAYER_COMMAND` and own-profile management bits.
- **GM** — Player bits plus `MANAGE_NPCS`, `MANAGE_ECONOMY`, `OPERATE_GM_TOOLS`.
- **Admin** — GM bits plus `MANAGE_USERS` and `MANAGE_AI_KEYS`.

#### Scenario: Role bundle assignment sets the right bits
- **WHEN** an Admin assigns the GM bundle to a user
- **THEN** the user's permission bitmask MUST contain exactly the union of bits defined by the GM bundle, with no other bits set unless they were already present

#### Scenario: Role bundle is not stored as a separate enum that can drift
- **WHEN** the user record is inspected
- **THEN** the user's effective role MUST be derivable from the permission bitmask alone, with no separate authoritative role column required

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

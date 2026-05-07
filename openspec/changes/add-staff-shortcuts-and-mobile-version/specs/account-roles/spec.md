# account-roles (delta)

Adds a profile-page staff-shortcut section so admin and GM users can reach the role-gated `/settings` and `/admin` pages on devices where the bottom nav is capped (mobile).

## ADDED Requirements

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

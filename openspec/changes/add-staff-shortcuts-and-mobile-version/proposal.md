## Why

Players reported two regressions on top of v0.7.0:

1. The version tag was invisible on mobile because `VersionTag` only rendered inside `DesktopRail` and `DesktopFooter`, both `lg:flex hidden`. Operators want the version visible on every screen so they can confirm what they are looking at.
2. Admin (and GM) accounts on mobile cannot reach `/settings` and `/admin` because `MobileTabBar` caps at five entries. The five visible slots are filled by `/`, `/codex`, `/timeline`, `/social`, `/profile`, leaving the role-gated pages with no entry point on phones.

The hub Phaser map also still resets the player to the central street every time the user navigates back to `/` from any other page, which is a needless context-loss now that area scenes already remember per-tile positions.

## What Changes

- Render `VersionTag` inside the sticky `Brandbar` (visible on all viewports) in addition to its existing `DesktopRail` / `DesktopFooter` placements.
- In `/profile`, when the signed-in account's role is `gm` or `admin`, render an additional "staff shortcuts" section that links to `/settings` (GM + admin) and `/admin` (admin only).
- Persist the hub map player position to `localStorage` (`gi:hub:player-pos:v1`) with a 2 s autosave, a `visibilitychange` flush, and an unmount flush. Restore on next visit so the player resumes where they were.

## Capabilities

### Modified Capabilities
- `account-roles`: profile page additionally surfaces role-gated pages as shortcut links so they remain reachable when the mobile bottom nav is full.

## Impact

- Affects: `packages/web/src/components/layout/GameShell.tsx`, `packages/web/src/pages/ProfilePage.tsx`, `packages/web/src/i18n/{zh,en,types}.ts`, `packages/web/src/game/MapScene.ts`, `packages/web/src/game/PhaserGame.tsx`.
- Server logic unchanged; no version bump (still 0.7.0).
- Out of scope: mobile-specific overflow menu, role-aware nav reordering, or persisting hub position to the server.

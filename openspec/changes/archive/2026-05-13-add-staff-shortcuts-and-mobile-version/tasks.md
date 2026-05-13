# Tasks

- [x] In `GameShell.tsx`, render `<VersionTag />` inside `Brandbar` (after `<BrandMark />`) so it appears on every viewport, while keeping the existing usages in `DesktopRail` and `DesktopFooter`.
- [x] In `ProfilePage.tsx`, when `account.role === 'gm' || 'admin'`, render a `profile.staffShortcuts` section with `<Link to="/settings">` (GM + admin) and `<Link to="/admin">` (admin only).
- [x] Add `profile.staffShortcuts` and `profile.staffShortcutsHint` translation keys (zh + en + `i18n/types.ts` union).
- [x] Add hub Phaser player-position persistence: `MapScene.ts` accepts `initialPosition` in `init()` and exposes `getPlayerPosition()`; `PhaserGame.tsx` reads/writes localStorage key `gi:hub:player-pos:v1` (2 s autosave + `visibilitychange` flush + unmount flush).
- [x] Update memory `project_deploy_state.md` with the v0.7.0 + staff-shortcut + brandbar version + hub persist notes.
- [x] Run `npm run build` and `npm run test` from the workspace root.
- [x] `docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d --build` on the desktop and verify `/api/version` still returns 0.7.0, the brandbar shows the version on mobile, admin sees `/settings` + `/admin` shortcuts in `/profile`, and the hub player marker resumes its previous position after navigating away and back.
- [x] Verify `https://hunter.sisihome.org/healthz` returns `version:"0.7.0"`.

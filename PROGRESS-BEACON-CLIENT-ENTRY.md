# 2026-10-08 — original beacon frontend preservation candidate

Restored the original harbor supplies/rewards/contribution UI and dock beacon into /game with the sole cookie AuthProvider/world client. Verified required DTO and empty contribute intent against frozen server 6de62799. All four independent preservation review corrections are included in the new local baseline and untouched.

Available checks: 53 frontend files/469 tests, 10 local actual-producer compatibility tests, strict affected TypeScript and whitespace passed. Exact pinned full build, native SQLite and actual browser/CI acceptance remain pending. No live/push/import/deploy actions occurred. Details and review gates: docs/SINGLE_GAME_BEACON_CLIENT.md.

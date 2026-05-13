# Tasks

## Server

- [x] Add `api_keys` table + `SettingsStore` (`http/settings.ts`) with seed-from-env, list, add (idempotent), delete, reactivate, mark-used, mark-failure.
- [x] Add `npcs/geminiClient.ts` with key-pool rotation, per-status disable rules (401/403/429 disable, 5xx skip), 15s timeout.
- [x] Add `npcs/aiDialog.ts` with system + user prompt builder, strict-JSON reply parser (`parseReply`), tier-aware NPC briefing.
- [x] Refactor `POST /api/npc/:npcId/interact` to accept `{ message?, intent? }`, run AI when keys are active, fall back to the static `dialog.ts` library on any AI failure.
- [x] Add `/api/settings/health`, `/api/settings/keys` GET/POST, `/api/settings/keys/:id` DELETE, `/api/settings/keys/reactivate-all` POST.
- [x] Wire `SettingsStore` + admin gate in `http/server.ts`; thread `geminiApiKeys` and `adminEmails` from `server.ts` env.
- [x] Add unit tests for `parseReply` (clean JSON, fenced JSON, surrounding prose, clamp, invalid).

## Web

- [x] Extend `api/client.ts`: `npcInteract` now takes `{ message?, intent? }`, plus settings endpoints and types.
- [x] Replace `NpcDialog` button list with a free-text textarea + Enter-to-send; keep 4 quick-intent buttons; render AI/static badge.
- [x] Add `pages/SettingsPage.tsx` with textarea batch entry, health stats, per-key delete, and reactivate-all action.
- [x] Add `nav.settings` route + GameShell tab (mobile grid bumped to 5 columns).
- [x] Add zh/en i18n keys.

## Deploy

- [x] Add `GEMINI_API_KEY` and `GREED_ISLAND_ADMIN_EMAILS` to `deploy/docker-compose.yml` env block and `deploy/.env.example`.
- [x] (deferred to a separate task) `docker compose up -d --build` on the desktop host — the user explicitly told me NOT to deploy here.

## Verification

- [x] `npm run build:server` clean.
- [x] `npm run build:web` clean.
- [x] `npm test` passes (35 tests, including 6 new `aiDialog` parser tests).

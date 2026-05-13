# Spec — `ai-npc-dialog`

## ADDED Requirements

### Requirement: Gemini API key pool MUST be persisted in SQLite

The server SHALL persist Gemini API keys in an `api_keys` SQLite table with at least the fields `id, key, source, status, last_error, last_used_at, failure_count, created_at`. Keys MUST be unique on the `key` column. The schema is created idempotently with `CREATE TABLE IF NOT EXISTS` so a fresh deployment and an upgraded deployment converge on the same shape without a manual migration.

#### Scenario: env-seeded keys are inserted at boot

- **GIVEN** the server boots with `GEMINI_API_KEY=k1,k2`
- **WHEN** `createHttpApp` runs
- **THEN** rows for `k1` and `k2` exist in `api_keys` with `source='env'` and `status='active'`
- **AND** restarting the server with the same env does NOT create duplicate rows.

#### Scenario: admin batch insert deduplicates

- **GIVEN** `api_keys` already contains key `k1`
- **WHEN** the admin POSTs `keys=k1\nk1\nk2` to `/api/settings/keys`
- **THEN** the response reports `inserted=1, duplicates=2, submitted=3`
- **AND** the table contains exactly the rows for `k1` and `k2`.

### Requirement: NPC dialog MUST use the key pool with automatic rotation and fallback

`POST /api/npc/:npcId/interact` SHALL prefer the AI-driven path whenever the key pool has at least one `active` key. It MUST iterate active keys oldest-used-first, mark a key `disabled` on HTTP 401/403/429, and skip-but-keep-active on transient errors (HTTP 5xx, network, timeout). If every active key fails or none are configured, the endpoint MUST fall back to the static dialog library so the user always receives a reply, and SHALL return `replySource='fallback'` plus the last AI error in `aiError`.

#### Scenario: a single quota-exhausted key disables itself

- **GIVEN** the pool contains exactly one active key `k1`
- **WHEN** the AI call returns HTTP 429
- **THEN** `k1.status` becomes `disabled` and `k1.last_error` is populated
- **AND** the endpoint returns a static-fallback line with `replySource='fallback'`.

#### Scenario: free-text message produces an AI reply

- **GIVEN** the pool has at least one healthy active key
- **WHEN** the player POSTs `{ "message": "你最近聽說阿鬼那邊的事嗎？" }` to `/api/npc/central.exchange.shen_ruo_yun/interact`
- **THEN** the response includes `line.zh` and `line.en` strings whose content is NOT byte-identical to any line in `dialog.ts` for that NPC
- **AND** `replySource='ai'`
- **AND** `personalEvent.id` references a new row in `personal_events` containing the AI-generated line.

#### Scenario: empty pool falls back without erroring

- **GIVEN** `api_keys` is empty
- **WHEN** the player sends a message
- **THEN** the endpoint returns 200 with `replySource='fallback'` and a line drawn from `dialog.ts`.

### Requirement: Admin-only Settings endpoints MUST gate by allow-list with first-registered fallback

The Settings router SHALL expose `GET /api/settings/health`, `GET /api/settings/keys`, `POST /api/settings/keys`, `DELETE /api/settings/keys/:id`, and `POST /api/settings/keys/reactivate-all`. Each endpoint MUST require a valid bearer JWT and MUST verify that the caller's email is either in the `GREED_ISLAND_ADMIN_EMAILS` allow-list (when set) or is the first-registered account (`MIN(accounts.id)`) when the allow-list is empty. Non-admin callers MUST receive HTTP 403 with code `FORBIDDEN`.

#### Scenario: allow-list overrides the first-registered fallback

- **GIVEN** `GREED_ISLAND_ADMIN_EMAILS=alice@example.com`
- **AND** the first-registered account is `bob@example.com`
- **WHEN** Bob calls `GET /api/settings/keys`
- **THEN** the response is HTTP 403 with `error: 'FORBIDDEN'`
- **AND** Alice receives a successful list.

#### Scenario: empty allow-list grants the first registrant

- **GIVEN** `GREED_ISLAND_ADMIN_EMAILS` is unset
- **AND** Bob is the only registered account
- **WHEN** Bob calls `GET /api/settings/health`
- **THEN** the response is HTTP 200 with the key-pool counts.

### Requirement: Key fingerprints MUST never expose full key material over HTTP

The Settings list endpoints SHALL return key summaries containing only a fingerprint (`••••<last4>`), source, status, last error, last-used timestamp, and failure count. The full key value MUST NOT appear in any HTTP response body, log line, or error message returned to the client.

#### Scenario: list returns fingerprint, never the raw key

- **GIVEN** the pool contains key `AIzaSyABCDEFGHIJKLMNOP1234`
- **WHEN** the admin calls `GET /api/settings/keys`
- **THEN** the response contains `fingerprint: '••••1234'`
- **AND** the literal `AIzaSyABCDEFGHIJKLMNOP1234` does NOT appear anywhere in the response body.

### Requirement: AI replies MUST be a strict 4-field JSON object the parser can recover

`generateAiReply` MUST instruct Gemini to respond with `{ zh, en, intent, trustDelta }` only. The parser MUST accept a clean JSON body, a body wrapped in a triple-backtick fence (` ```json ... ``` `), or a body with surrounding prose, and MUST reject replies missing fields or carrying an unknown `intent`. `trustDelta` SHALL be clamped to the inclusive range [-5, 5].

#### Scenario: parser recovers a fenced reply

- **WHEN** the parser is given ``` ```json\n{"zh":"a","en":"b","intent":"ask","trustDelta":2}\n``` ```
- **THEN** it returns `{ zh: 'a', en: 'b', intent: 'ask', trustDelta: 2 }`.

#### Scenario: parser clamps an out-of-range delta

- **WHEN** the parser is given `{"zh":"a","en":"b","intent":"leave","trustDelta":99}`
- **THEN** the returned `trustDelta` is `5`.

#### Scenario: parser rejects an unknown intent

- **WHEN** the parser is given `{"zh":"a","en":"b","intent":"flirt","trustDelta":1}`
- **THEN** it returns `null`.

### Requirement: Free-text NPC interaction MUST persist as a personal_events row

When the AI succeeds, the endpoint MUST persist a `personal_events` row containing the AI-generated `line_zh`, `line_en`, the resolved `intent`, the new trust value, and the current world tick. When the AI fails and the static fallback runs, the row MUST instead carry the static line that was actually returned to the user, so per-player history reflects what the player actually saw.

#### Scenario: AI reply is logged with its actual content

- **GIVEN** an AI reply lands as `{ zh: '「來找我幹嘛？」', en: '"What do you want?"', intent: 'ask', trustDelta: -1 }`
- **WHEN** the endpoint returns 200
- **THEN** a new `personal_events` row exists with `line_zh='「來找我幹嘛？」'`, `intent='ask'`, `trust_after = previousTrust - 1`.

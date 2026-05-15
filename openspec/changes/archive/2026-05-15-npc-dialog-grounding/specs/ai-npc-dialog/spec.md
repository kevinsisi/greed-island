## MODIFIED Requirements

### Requirement: NPC dialog MUST use the key pool with automatic rotation and fallback
`POST /api/npc/:npcId/interact` SHALL prefer the AI-driven path whenever the key pool has at least one `active` key. It MUST iterate active keys oldest-used-first, mark a key `disabled` on HTTP 401/403/429, and skip-but-keep-active on transient errors (HTTP 5xx, network, timeout). If every active key fails or none are configured, the endpoint MUST fall back to the static dialog library so the user always receives a reply, and SHALL return `replySource='fallback'` plus the last AI error in `aiError`. The AI system prompt MUST include grounded world context (known-person list, anti-hallucination constraints, ecological awareness, recent local events, active rumors) assembled from live runtime projections before the call is made.

#### Scenario: a single quota-exhausted key disables itself
- **GIVEN** the pool contains exactly one active key `k1`
- **WHEN** the AI call returns HTTP 429
- **THEN** `k1.status` becomes `disabled` and `k1.last_error` is populated
- **AND** the endpoint returns a static-fallback line with `replySource='fallback'`

#### Scenario: free-text message produces an AI reply with grounded context
- **GIVEN** the pool has at least one healthy active key
- **AND** the NPC has interact memories with two other NPCs and the tile has animal population data
- **WHEN** the player POSTs `{ "message": "你最近聽說阿鬼那邊的事嗎？" }` to `/api/npc/central.exchange.shen_ruo_yun/interact`
- **THEN** the response includes `line.zh` and `line.en` strings
- **AND** `replySource='ai'`
- **AND** the system prompt sent to the AI contained the known-person list, ecological block, and anti-hallucination constraints

#### Scenario: empty pool falls back without erroring
- **GIVEN** `api_keys` is empty
- **WHEN** the player sends a message
- **THEN** the endpoint returns 200 with `replySource='fallback'` and a line drawn from `dialog.ts`

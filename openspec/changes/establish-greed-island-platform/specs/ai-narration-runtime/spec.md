## ADDED Requirements

### Requirement: AI narration uses the shared `@kevinsisi/ai-core` MultiProviderClient
The server SHALL perform all AI calls through `@kevinsisi/ai-core` `MultiProviderClient` backed by a `KeyPool`. The server MUST NOT reimplement provider routing, key rotation, retry classification, or cooldown handling locally.

#### Scenario: Local provider routing is forbidden
- **WHEN** the server source is inspected
- **THEN** AI provider selection MUST go through `MultiProviderClient` and key allocation MUST go through `KeyPool`, not through hand-written rotation code

### Requirement: AI runtime supports multiple keys per provider
The narration runtime SHALL support multiple Gemini and OpenAI API keys loaded from environment variables and from the SQLite-backed key store. Placeholder strings such as `YOUR_KEY_HERE` MUST be filtered out at import time.

#### Scenario: Multiple keys rotate under cooldown
- **WHEN** one key returns an HTTP 429 response
- **THEN** that key MUST be cooled down per `key-pool-standard` and the next narration call MUST use a different available key without operator intervention

### Requirement: Narration runs after tick commit and never blocks the runtime
The narration worker SHALL only generate narration for events that have already been committed by the kernel. AI latency, AI failure, and AI quota exhaustion MUST NOT delay tick advancement, MUST NOT mutate WorldState, and MUST NOT append Events to the EventLog.

#### Scenario: AI outage does not stop ticks
- **WHEN** all configured AI providers are unavailable
- **THEN** the kernel and runtime MUST continue advancing ticks and committing events normally

#### Scenario: Narration is post-commit only
- **WHEN** the narration worker observes an event
- **THEN** that event MUST already be present in the EventLog with its committed sequence number

### Requirement: Narration output is stored outside the EventLog
Narration output SHALL be persisted to a `narration_view` table or an equivalent view artifact. The Reducer, Rule Engine, and any other authoritative simulation component MUST NOT read narration output as part of WorldState derivation.

#### Scenario: Reducer ignores narration view
- **WHEN** WorldState is rebuilt from the EventLog
- **THEN** the resulting WorldState MUST be byte-identical regardless of whether the narration view contains rows

### Requirement: Default model is `gemini-2.5-flash`
The narration runtime SHALL default to `gemini-2.5-flash` and SHALL allow override via a `GEMINI_MODEL` (or equivalent) environment variable. The model identifier MUST NOT be hidden inside ad-hoc constants spread across files.

#### Scenario: Model is overridable by env
- **WHEN** the operator sets `GEMINI_MODEL` to a different supported model identifier
- **THEN** the narration worker MUST use that model for subsequent calls without code changes

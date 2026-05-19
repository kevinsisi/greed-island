# event-motivation-chronicle Delta Specification (phase-6-player-civilization)

## ADDED Requirements

### Requirement: All chronicle fallback narrations SHALL be machine-readable English, never hardcoded Chinese
`eventToChronicleEvent` MUST NOT contain any hardcoded Chinese strings. The `narration` field on `ChronicleEvent` is a fallback used only when Gemini is unavailable; it MUST be a structured English summary of the form `"[EVENT_TYPE] key1=val1 key2=val2"`. All existing hardcoded Chinese fallback strings (LIVESTOCK_SLAUGHTERED, MOUNT_ASSIGNED, SPECIES_EXTINCT, SPECIES_RECOVERED, and all E4 event types) MUST be replaced with this format.

#### Scenario: Gemini unavailable produces machine-readable fallback
- **WHEN** no Gemini API keys are active
- **THEN** every chronicle event that reaches `renderFallbackChronicle` MUST have a `narration` matching the pattern `"[EVENT_TYPE] ..."` — no Chinese characters

#### Scenario: No hardcoded Chinese in chronicle renderer source
- **WHEN** `chronicleRenderer.ts` is inspected
- **THEN** it MUST contain zero Chinese characters in any string literal in `eventToChronicleEvent`

### Requirement: Player civilization events SHALL pass through to the AI chronicle pipeline
`eventToChronicleEvent` in `chronicleRenderer.ts` MUST NOT suppress (return null for) any player civilization event type. All 14 player civilization command types MUST return a `ChronicleEvent` with `actorId = playerAccountId` so the Gemini AI narrative pipeline receives them as context. A minimal generic fallback narration (`"玩家{playerAccountId}執行了{eventType}"`) MUST be provided and used only when AI generation is unavailable.

The chronicle AI (Gemini) is the system that produces the actual player-visible narrative — hardcoded per-event Chinese strings MUST NOT be used.

#### Scenario: Player traded goods appears in AI chronicle context
- **WHEN** `PLAYER_TRADED_GOODS` is committed to EventLog
- **THEN** `buildChronicleContext()` MUST include the event in the context passed to Gemini
- **AND** the event MUST NOT be filtered out by the null-return path in `eventToChronicleEvent`

#### Scenario: AI generates narrative incorporating player actions
- **WHEN** Gemini is available and the chronicle window includes player civilization events
- **THEN** `renderChronicle()` MUST produce an AI-generated narrative that MAY reference the player's actions
- **AND** the narrative MUST only cite names from `allowedNames` (anti-hallucination rule)

#### Scenario: Fallback narrative used when Gemini unavailable
- **WHEN** no Gemini API keys are active
- **THEN** player civilization events MUST produce a machine-readable English fallback string in the form `"[EVENT_TYPE] actor=X tile=Y"` — no hardcoded Chinese strings

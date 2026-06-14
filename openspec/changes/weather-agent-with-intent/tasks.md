## 1. Kernel Contract

- [x] 1.1 Add typed `WEATHER_INTENT_PROPOSED` command/event payload definitions and validation.
- [x] 1.2 Extend the living-world command catalog and Rule Engine tests for accepted and rejected weather-agent intent.
- [x] 1.3 Ensure invalid desired weather, missing thought fields, and unsupported pressure sources reject with `INVALID_PAYLOAD`.

## 2. Weather Agent Policy

- [x] 2.1 Add a deterministic weather-agent policy module keyed by EventLog-derived projection, tick, ruleset version, and world config.
- [x] 2.2 Derive bounded mood, pressure source, desired weather, thought, reason, and cadence key without AI or wall-clock input.
- [x] 2.3 Wrap the existing weather cadence so weather-agent intent is emitted before weather change commands.

## 3. Projection And Replay

- [x] 3.1 Extend living-world reducers/projections with weather-agent mood, latest thought, recent thoughts, latest desired weather, and latest accepted weather.
- [x] 3.2 Wire weather-agent projection rebuild into both small-log and large-log runtime boot paths.
- [x] 3.3 Add deterministic replay tests proving byte-identical weather, weather-agent mood, and weather-agent thoughts from identical EventLogs.

## 4. API And Chronicle Surfacing

- [x] 4.1 Add additive weather-agent metadata to `/api/world` while preserving the existing `weather` field.
- [x] 4.2 Surface committed weather-agent thoughts in timeline/chronicle input without allowing narration to invent uncommitted weather facts.
- [x] 4.3 Add API and chronicle regression tests for weather-agent thought visibility.

## 5. Verification

- [x] 5.1 Run targeted server tests for command validation, policy determinism, projection rebuild, and API surfacing.
- [x] 5.2 Run `npm run build` and `npx openspec validate --all --strict`.
- [x] 5.3 Update `PROGRESS.md` and `ROADMAP.md` with implementation and verification evidence before release.

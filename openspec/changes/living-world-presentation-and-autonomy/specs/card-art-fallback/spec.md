## ADDED Requirements

### Requirement: Every catalog card SHALL have deterministic procedural art

The web client MUST provide a `CardArt` component that renders a deterministic SVG illustration for any card id 1..100, seeded by the card id (mulberry32). Category (derived from the fixed id ranges mirroring the server `CATEGORY_ID_RANGES`) MUST select the palette and motif composition; rank MUST select the frame and glow tier (S strongest, D plainest). The same card id MUST always render the identical image.

#### Scenario: Card art is deterministic

- **GIVEN** card id 42 rendered twice on different devices
- **WHEN** the SVG is produced
- **THEN** both renders MUST be byte-identical markup

#### Scenario: Categories are visually distinct

- **GIVEN** card 5 (潮源系) and card 55 (生靈系)
- **WHEN** both render
- **THEN** they MUST use different palettes and different motif compositions

### Requirement: CardImage SHALL fall back from upload to procedural art to rank square

`CardImage` MUST display, in priority order: (1) the GM-uploaded `imageUrl` when present and not failed, (2) the procedural `CardArt` when a valid `cardId` (1..100) is provided, (3) the legacy rank-letter colored square otherwise. Codex grid tiles, the codex detail pane, the card drop panel, and the admin cards page MUST pass `cardId`.

#### Scenario: Uploaded image wins over procedural art

- **GIVEN** a card with `imageUrl` set and a valid `cardId`
- **WHEN** CardImage renders
- **THEN** the uploaded image MUST be shown, not the procedural art

#### Scenario: Missing upload falls back to procedural art

- **GIVEN** a card without `imageUrl` and `cardId = 23`
- **WHEN** CardImage renders
- **THEN** the procedural CardArt for id 23 MUST be shown instead of the rank square

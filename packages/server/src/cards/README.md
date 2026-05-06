# Card Catalog

This directory holds the deterministic 100-card catalog for Greed Island.

## Files

- `types.ts` — TypeScript schema (`CardCatalogEntry`, `CardCatalog`) and the validator.
- `loader.ts` — runtime loader that reads `catalog.json`, parses, and validates.
- `catalog.json` — **the editable source of truth** for the 100 cards.

## How to fill in canonical content

Every entry in `catalog.json` ships with:

- A stable `id` (1–100).
- A pre-assigned `rank` slot.
- Stable rule references (`discoveryRuleId`, `restrictionRuleId`) you can wire to.
- Placeholder `nameZh`, `nameEn`, `description`, and `story` fields.

The project owner is expected to populate the placeholder fields from their own
canonical source material (HUNTER × HUNTER · Greed Island arc reference). No
code change is required — edit the JSON, restart the server, and the catalog
loader picks it up after schema validation.

The validator enforces:

- exactly 100 entries
- unique ids in `1..100`
- non-empty `nameZh` and `nameEn`
- valid rank from `SS, S, A, B, C, D, E, F, G, H`
- non-empty `discoveryRuleId` and `restrictionRuleId`

If validation fails, the server refuses to boot.

## Why placeholders, not pre-filled canon

The catalog is deterministic data the simulation depends on. Putting canon
content in the repository means committing the project owner's source into
version control. The schema and the 100-slot scaffold are project code; the
canon fill-in lives next to the code as data the project owner controls.

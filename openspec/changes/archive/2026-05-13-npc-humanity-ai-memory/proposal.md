## Why

Greed Island's NPCs still behave like scheduled map props instead of people.
Role-locked NPCs such as merchants, craftsmen, guards, and priests are often
anchored to one tile for the whole day, which makes the world feel static and
contradicts the product goal that every NPC is a living actor. The current
building projection can also expose the same NPC through a building interior
while the area map renders that NPC outside, because building occupants and
`/api/npcs` are separate projections that can drift during boot or refresh.

Chronicle entries are deterministic templates. They are safer than ungrounded
AI, but they still read like canned text and do not reflect accumulated memory,
player history, or relationships well enough.

This change starts the NPC humanity upgrade while preserving the kernel rule
that AI is not world-authoritative: every NPC has one unique location, movement
is allowed across districts by weighted intent instead of hard role locks, and
AI renders grounded narration/memory summaries from committed facts rather than
inventing facts or directly mutating state.

## What Changes

- Establish a **single NPC presence authority**: every NPC may have only one
  visible presence tuple at a time: `tileId`, `buildingId | null`,
  `subCol/subRow/subZ`, `activity`, and future `intent`.
- Make building occupant views derive from the same NPC presence authority used
  by `/api/npcs`, so AreaPage and BuildingPage cannot render the same NPC in two
  places.
- Replace hard role-lock movement with **duty-weighted freedom**. Duty still
  matters, but merchants, craftsmen, guards, priests, and civic NPCs can leave
  their home tile for errands, social visits, patrols, food, rest, events, or
  memory-driven reasons.
- Persist and read player↔NPC and NPC↔NPC memories as first-class projections,
  including facts needed to shape future dialog, movement intent, and chronicle
  rendering.
- Replace canned chronicle presentation with AI-rendered, grounded chronicle
  text generated from committed events, NPC names, locations, relationship
  facts, and memory snippets. AI output remains renderer-only and must not emit
  Commands or Events directly.

## Implementation Slices

1. **Unique presence fix**: make building occupants derive from NPC state and
   prevent interior/exterior duplicates. This is the immediate user-visible bug
   fix.
2. **Duty-weighted free exploration**: remove permanent role locks and replace
   them with weighted duty windows plus exploration intents.
3. **Memory-backed AI chronicle**: introduce grounded AI chronicle rendering and
   memory summarization with key-pool robustness, retries, timeouts, and
   deterministic fallback metadata.

## Capabilities

### New Capabilities

- `npc-humanity-ai-memory`: NPCs are unique world actors with one authoritative
  presence, free-but-weighted movement, persistent memory, and AI-rendered
  grounded chronicle text.

### Modified Capabilities

- `living-deterministic-world`: NPC movement policy changes from hard
  role-locks to duty-weighted exploration while preserving Rule Engine and
  EventLog authority.
- `ai-npc-dialog`: NPC memories from player and NPC interactions become shared
  grounding input for dialog and chronicle rendering.
- `server-authoritative-npc-sprite`: building/interior views consume the same
  server-authoritative NPC presence projection as area sprites.

## Impact

- Backend: building runtime, NPC movement policy, memory projection, and AI
  chronicle rendering will change over multiple slices.
- Frontend: AreaPage and BuildingPage should render only one presence per NPC;
  chronicle UI may gain AI source/status metadata in a later slice.
- Operational: product version bumps for each shipped slice; deployment must be
  verified at `https://hunter.sisihome.org/healthz`.
- Non-goals for the first slice: full AI movement planning, every chronicle line
  rewritten by AI, or destructive event-log migration.

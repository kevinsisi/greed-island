# Proposal — Ecosystem Pressure & Collapse (Phase E2)

## Why

`docs/WORLD_CAPABILITIES.md` §38 (Phase E2) defines the feedback loop that gives civilization actions real ecological consequences. Phase E0/E1 shipped the ecosystem substrate and predator/prey dynamics. Phase 2 wired goods to ecosystem harvests. But right now:

- A player can hunt `fog_wolf` to zero — the world shows no response.
- Overfishing `marsh_fish` past collapse threshold emits `FISHERY_COLLAPSED` only as a FACT, not as a planner-driven event with settlement consequences.
- There is no observable "species extinction warning" for any NPC to reference in dialog or any admin page to display.
- Civilization pressure (heavy construction, overharvesting) does not raise `EcosystemRegion.pollution` or reduce local species spawn rates.
- Recovery after pressure lifts is not modelled.

The feedback loop — **civilization damages ecosystem → ecosystem limits civilization → recovery if pressure drops** — is entirely missing. Without this loop, NPC hunters, fishers, and combat encounters have no long-term ecological consequence, which means Phase 2's economy is running on an infinite-resource assumption.

## What Changes

### E2.1 — Species Extinction Monitoring

- Add `SPECIES_EXTINCTION_WARNING` command/event: emitted when a tile's population for a species drops below `Species.extinctionThreshold`.
- Add `SPECIES_EXTINCT` command/event: emitted when a species has zero population on all its biome-affinity tiles for `SPECIES_EXTINCT_GRACE_TICKS` consecutive cadence ticks.
- Add `SPECIES_RECOVERED` command/event: emitted when an extinct species re-establishes population above `extinctionThreshold` (via spawn or migration).
- New `SpeciesExtinctionProjection` tracks per-species status: `stable | warning | extinct`.
- Runtime planner runs on reproduction cadence: scans `animal_population` rows, emits warnings and extinction events deterministically.

### E2.2 — Fishery Collapse Integration

- Upgrade `FISHERY_COLLAPSED` from a passive FACT to a planner-driven event emitted by the fishery planner when `density ≤ FISHERY_COLLAPSE_THRESHOLD`.
- `FISHERY_COLLAPSED` now causes:
  - Carrying capacity for fish species on that tile halved (via `FisheryDensityProjection`)
  - Settlement food pressure contribution increases (via existing `SettlementPressurePlanner`)
- Add `FISHERY_RECOVERED` event when density recovers above threshold after collapse.

### E2.3 — Civilization Pressure → EcosystemRegion pollution

- Add `ECOSYSTEM_PRESSURE_RAISED` command/event: emitted when NPC `work` actions on building types with `civilizationPressure > 0` (mining, heavy construction, large fishing) accumulate above a per-tile threshold within a cadence window.
- New `EcosystemRegionProjection` tracks per-tile `pressureLevel` (0–100) and `pollutionLevel` (0–100).
- High pressure reduces effective spawn rate for species with low `civilizationTolerance` on that tile.

### E2.4 — Recovery Loops

- `ECOSYSTEM_PRESSURE_RECOVERED` event: emitted when tile pressure drops to zero for `ECOSYSTEM_PRESSURE_RECOVERY_TICKS` consecutive cadence ticks.
- Species warnings clear when population recovers above `extinctionThreshold` (`SPECIES_RECOVERED`).
- Fishery density regenerates passively at `FISHERY_RECOVERY_RATE` per cadence tick when below max but above zero.

### E2.5 — Visibility

- `WorldSnapshot.facts.extinctionWarnings` and `facts.ecosystemRegions` added.
- `/admin/world` page: "生態壓力" section showing per-species status icons (✅/⚠️/☠️) and per-tile pressure level.
- Chronicle suppresses individual extinction warning facts to avoid noise; only `SPECIES_EXTINCT` and `SPECIES_RECOVERED` surface as chronicle entries.

## Out Of Scope

- Forest depletion (heavy logging reducing biome identity permanently) — Phase E2.2+ future slice.
- Domestication and livestock — Phase E3.
- Mythic ecology events (`white_marsh_leviathan`) — Phase E4.
- Player-facing ecological protection actions — Phase 6.

## Impact

- Overhunting produces visible extinction warnings on the admin world page.
- NPC dialog can reference "沒有看到霧狼" (extinction warning present) via the existing ecology context hook.
- Fish scarcity spikes settlement food pressure, which the settlement pressure planner already reads.
- The world becomes self-limiting: civilization growth creates ecological cost, creating natural economic pressure that motivates logistics and trade.

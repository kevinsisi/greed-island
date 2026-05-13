## Why

`docs/WORLD_CAPABILITIES.md` now defines the program as six runtime layers:
Kernel, Living World, Ecosystem, Civilization, Combat, and Perception. The
engine-level architecture source of truth (`ARCHITECTURE.md`) still stops at the
older §11 backlog and does not formally define Layer 2.5 Ecosystem or the
inter-layer dependency rules.

Without that layer vocabulary in `ARCHITECTURE.md`, future OpenSpec changes can
accidentally grow civilization, combat, or AI features before the substrate they
depend on exists.

## What Changes

- Add `ARCHITECTURE.md` §12 "Six Runtime Layers".
- Define each layer's authority, existing modules, and forbidden shortcuts.
- Add dependency rules from `docs/WORLD_CAPABILITIES.md`: budget gate before
  growth, ecosystem foundation before goods/logistics/market, combat outcomes
  must feed civilization/ecosystem/history, and AI remains perception-only.
- Update roadmap/progress so the next world-program slice is Phase 0
  Architecture Formalization before Phase 1 / E0 implementation.

## Impact

- Documentation only. No runtime behavior change.
- New OpenSpec capability delta modifies `simulation-kernel` to require the
  six-layer architecture vocabulary and inter-layer authority boundaries.
- Establishes the review standard for upcoming changes:
  - Phase 1: budget gate + settlement runtime
  - Phase E0: ecosystem foundation
  - Phase 2: goods/logistics/market sourced from ecosystem events

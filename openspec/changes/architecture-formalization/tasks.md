## 1. Architecture Source Of Truth

- [x] 1.1 Add `ARCHITECTURE.md` §12 "Six Runtime Layers".
- [x] 1.2 Define the authority and non-authority of each layer: Kernel, Living World, Ecosystem, Civilization, Combat, Perception.
- [x] 1.3 Map existing major modules to layers and name the missing substrates.
- [x] 1.4 Add inter-layer dependency rules: budget gate before growth, E0 before goods/logistics/market, combat outcomes feed world projections, AI stays read-only.

## 2. OpenSpec + Roadmap Alignment

- [x] 2.1 Add a `simulation-kernel` spec delta requiring the six-layer vocabulary and layer-boundary review rule.
- [x] 2.2 Update `ROADMAP.md` with Phase 0 Architecture Formalization as the next program slice.
- [x] 2.3 Update `PROGRESS.md` with this session's OpenSpec hygiene and Phase 0 state.
- [x] 2.4 Archive proposal-only `player-intervene-and-combat` so strict OpenSpec validation passes.
- [x] 2.5 Remove empty `construction-motivation-chronicle` active change directory.

## 3. Verification

- [x] 3.1 `npx openspec validate architecture-formalization --strict` passes.
- [x] 3.2 `npx openspec validate --all --strict` passes.
- [x] 3.3 Commit, push, and verify CI + Deploy Dev.

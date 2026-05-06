# NPC Profiles

NPC behavior in Greed Island is data-driven. Every NPC is one JSON file in `profiles/`. The deterministic policy interpreter reads frozen `WorldState(t-1)` plus the loaded profile and emits NPCCommands. There is no NPC-specific code path — every NPC-specific fact lives in its JSON file.

## Adding a new NPC

1. Copy one of the sample profiles in `profiles/`.
2. Pick a unique `id` (kebab-case-with-namespace, e.g. `port.merchant.anton`).
3. Fill in bilingual `name` and `role`.
4. Set a `defaultLocation` (must match a tile id known to the world map).
5. Define `routine` slots in tick-of-day units (0..17279). Slots may overlap; the interpreter picks the first match.
6. Define `triggers`. Each trigger has a `when` predicate string (see `types.ts`) and an `emitCommand`. The Rule Engine still validates the resulting command.
7. Define `memory.decayFn` and `memory.decayParam` so relationship state with this NPC decays deterministically.
8. Restart the server. The loader validates every profile at boot and refuses to start if any profile is malformed.

## Why JSON, not TypeScript

- The project owner can add and tune NPCs without writing code.
- Profiles are deterministic data — they replay identically.
- A future `/api/npcs/admin/reload` endpoint (GM-only, gated by `OPERATE_GM_TOOLS`) can re-read profiles without a server restart.

## Context

`SqliteNpcRelationshipsStore` is one of the most-touched projections (consumed by AI dialog, household pair-bond planner, social history arc, NPC memory weights). Its data model is a single 0..100 `trust` scalar derived purely from `NPC_INTERACT` events:

```ts
type RelationshipRow = {
  npcA, npcB, relationshipType: 'neutral'|'friend'|'rival',
  trust: number,           // 0..100, base 50
  history: HistoryEntry[], // capped at 50
  interactionCount, lastTick
}
```

The transition graph for `relationshipType` is single-axis: trust ≥ 75 → friend; trust ≤ 25 → rival; otherwise neutral, no direct friend↔rival transition.

The §12.5.12 vision says relationships are eight dimensions. Today's implementation has one. Every event in the world that should perturb a non-trust dimension (combat fear, mentor respect, household attraction, faction loyalty, grief-driven resentment) currently has **no place to land**. They get ignored.

The simulation runs ~10 cognitive consumers off relationships. Adding seven dimensions has to be done without breaking any of them. Trust must keep its current behavior bit-for-bit so existing tests continue to pass.

## Goals / Non-Goals

**Goals:**
- Implement eight-axis vector per §12.5.12 (trust, fear, respect, attraction, loyalty, resentment, dependency, familiarity), each 0..100 int.
- Source dimensions from existing world events without inventing new player actions:
  - `NPC_INTERACT` (existing) drives trust + familiarity (and now resentment on argue).
  - `NPC_DECEASED`, `FACTION_TILE_SEIZED`, `COMBAT_RESOLVE`, `NPC_MENTORSHIP_COMPLETED`, `NPC_HOUSEHOLD_FORMED` drive the rest.
- Maintain `trust`-only API backwards compatibility for read consumers.
- Composite `RelationshipType` covers the seven Part-I tones (`neutral`, `friend`, `rival`, `lover`, `mentor`, `apprentice`, `feared`).
- AI dialog grounding surfaces dominant non-trust dimensions so tone matches the model without invention.
- Pair-bond planner gates on attraction (≥ 50) instead of pure mechanics.
- Replay-safe; canonical-hash test covers the eight-dim row shape.

**Non-Goals:**
- Real-time decay of every dimension (would multiply tick load). Use existing event-driven mutation only. Decay can be a future change.
- Long-arc emotional system (jealousy, infidelity, betrayal arc). Provide the substrate; do not author the arcs.
- Player-visible UI of dimension scalars (keep them in the server-side context).
- Symmetric / asymmetric debate. Some dimensions are inherently asymmetric (apprentice respects mentor; mentor's attraction to apprentice differs). Model both directions for each ordered pair (npcA→npcB and npcB→npcA).

## Decisions

### Decision 1: Eight dimensions stored as a JSON blob, NOT eight columns

**Choice:** `npc_relationships.dimensions_json TEXT` — a canonical JSON object holding `{ trust, fear, respect, attraction, loyalty, resentment, dependency, familiarity }`. Default `'{"trust":50,"fear":50,"respect":50,"attraction":50,"loyalty":50,"resentment":50,"dependency":50,"familiarity":0}'`. Reads parse on demand.

**Why JSON not eight columns?**
- Schema is more extensible — future dimensions don't require migrations.
- Aligns with existing `history_json` pattern in the same table.
- Saves seven `ALTER TABLE` operations.
- Trust column kept as a redundant integer column for fast WHERE/ORDER queries by AI dialog (`WHERE trust > 70`). Reasoning: a few queries need it indexed; the others read JSON anyway.

**Alternatives considered:**
- *Eight integer columns* — cleaner SQL, but rigid schema; 7 ALTER TABLEs; future ninth dimension forces another migration.
- *Separate `npc_relationship_dimensions` table* — relational purity but explodes the join surface; AI dialog already reads one row per pair, doesn't need a star schema.

### Decision 2: Asymmetric dimensions (per ordered pair)

**Choice:** Store dimensions per **ordered** `(npcA, npcB)` direction, not per canonical pair. Canonical-pair compatibility kept by always also recording the reverse row (so the table has 2x rows but each row has its own dimensions).

**Why?**
- Apprentice→Mentor: high respect + loyalty. Mentor→Apprentice: high attraction (fondness), moderate respect.
- Aggressor→Victim and Victim→Aggressor differ dramatically (fear is asymmetric).
- Without asymmetry, the model would collapse meaning ("they both fear each other equally" is rarely true).

**Implementation:** Add `direction TEXT NOT NULL CHECK (direction IN ('a_to_b', 'b_to_a'))` to the primary key. Reads accept ordered (from, to) pair. The existing `canonicalPair` helper is renamed `orderedPair`.

**Risk:** Doubles row count. Mitigation: 50 NPCs × 50 NPCs × 2 = 5,000 max rows. Negligible.

### Decision 3: Trust math unchanged in scope, augmented in fan-in

**Choice:** Existing trust delta math from `NPC_INTERACT` (chat +1, argue −2) **stays exactly the same** for the `trust` dimension. New events do not perturb trust unless explicitly defined (e.g., grief-driven trust shifts are out of scope; combat fear does not pull trust down). This preserves every existing trust-based test.

The NEW dimensions get NEW delta tables — they are additive, not mutating existing trust behavior.

### Decision 4: Delta tables per event source

| Event | Direction | Dimensions affected | Delta |
|---|---|---|---|
| `NPC_INTERACT` mode=chat | a→b and b→a | trust +1 (existing), familiarity +1, resentment −1 (clamped 0) | preserve existing trust behavior; add fam/res |
| `NPC_INTERACT` mode=argue | a→b and b→a | trust −2 (existing), resentment +2, familiarity +1 | preserve existing trust behavior; add res/fam |
| `NPC_HOUSEHOLD_FORMED` partners=[a,b] | a→b and b→a | attraction +30, dependency +20, familiarity +20, trust +5 | one-time on form |
| `NPC_MENTORSHIP_COMPLETED` mentor=a, apprentice=b | b→a (apprentice→mentor) | respect +20, loyalty +15, familiarity +10 | one-time |
| `NPC_MENTORSHIP_COMPLETED` mentor=a, apprentice=b | a→b (mentor→apprentice) | attraction +10 (fondness), respect +5, familiarity +10 | one-time |
| `NPC_DECEASED` victim=v, witnesses subscribed via `COMBAT_WITNESS_RECORDED` or co-tile | witness→killer if known and combat-related | fear +25, resentment +15 | per witness |
| `NPC_DECEASED` natural cause, victim is high-respect | each NPC with respect≥60 toward victim: grief = `-fear → 0, +respect +10` (memorial respect) | one-time | |
| `FACTION_TILE_SEIZED` seizingFaction=F, defendingFaction=D | each NPC of faction D with knowledge → each named NPC of faction F | fear +15, resentment +20 | |
| `FACTION_TILE_SEIZED` victorious faction | each NPC of faction F → other faction F member who fought | respect +10, loyalty +10 | |
| `COMBAT_RESOLVE` outcome=player_victory, witnesses recorded | each witness → winner-player as an "actor" (handled via player NPC graph) | fear +20 | |
| Same-tile co-presence ≥ K consecutive checks | both directions | familiarity +1 per cadence | cadence-gated, very slow |

Deltas use simple add+clamp(0,100); no per-NPC variance for v1 (deterministic, replay-safe).

### Decision 5: Composite `RelationshipType` resolver

**Choice:** Pure function `resolveRelationshipType(dims): RelationshipType` deterministically maps an eight-axis vector to one of `'neutral' | 'friend' | 'rival' | 'lover' | 'mentor' | 'apprentice' | 'feared'`. Order of precedence:

1. `attraction ≥ 70 AND trust ≥ 60` → `'lover'`
2. `respect ≥ 70 AND loyalty ≥ 60 AND fear < 40` → `'mentor'` (if direction implied by lineage edge) or `'apprentice'` (reverse direction). Determined via `SkillXpProjection.lineageOf` external lookup.
3. `fear ≥ 70` → `'feared'`
4. `resentment ≥ 60 OR (trust ≤ 25 AND respect ≤ 40)` → `'rival'`
5. `trust ≥ 70 AND respect ≥ 50` → `'friend'`
6. else → `'neutral'`

**Why this order?**
- Strongest emotional signal (attraction at lover threshold) trumps generic friendship.
- Mentor/apprentice requires both directional evidence (the mentorship event already wrote the lineage edge).
- Fear trumps friend even if trust is high (you can fear a friend; the relationship resolves to the dominant emotion).

**Risk:** A "friend" who once won a combat against the NPC may flip to `'feared'`. Acceptable — that flip is exactly the kind of emergent civilization story §43.1 demands.

### Decision 6: AI dialog directive injection

**Choice:** `formatRelationshipContext(rel: RelationshipRow): string` is extended to inject directive hints based on dominant non-trust dimensions when those dimensions are extreme (≥ 70 or ≤ 30):

```
你對 {targetName} 的關係：
- 信任：高 / 中 / 低 (based on trust)
- 你恐懼他 (if fear ≥ 70)         [new]
- 你欽佩他 (if respect ≥ 70)       [new]
- 你深受他吸引 (if attraction ≥ 70) [new]
- 你忠於他 (if loyalty ≥ 70)       [new]
- 你怨恨他 (if resentment ≥ 60)    [new]
- 你依賴他 (if dependency ≥ 70)    [new]
- 你和他很熟 / 你和他剛認識 (familiarity bands) [new]
```

The directive lines are pure data; AI uses them as hedge-language rules per existing pattern (v0.50.0 belief hedge style).

### Decision 7: Pair-bond gate

**Choice:** `planHouseholdCommands` adds a new check: between any two pairing candidates (already filtered by same tile + thresholds + lifeGoal), require `dimensions(a→b).attraction ≥ 50 AND dimensions(b→a).attraction ≥ 50`. If no pair clears, no household forms this cadence.

**Why threshold 50 (the default)?**
- At base, attraction is exactly 50. Two NPCs who have never interacted have base attraction; without prior interactions they don't form households.
- Households form only after some `NPC_INTERACT` events build base familiarity + interactions. This adds biological plausibility.

**Compatibility note:** Existing worlds where no interactions have built up will see household formation slow down. This is desired (today's instant-mechanical pairing is the bug; making it slower is the fix). On a fresh boot, NPCs need to interact for ~1 in-game day before any household forms.

## Risks / Trade-offs

- **[Risk] Existing trust-based tests may fail if the same row's resentment also moves on chat.**
  → Mitigation: chat's `resentment −1` is clamped at 0; on the first interaction starting at base resentment 50, the value drops to 49. Trust still moves +1 exactly as before. Tests asserting only `trust` will pass; tests asserting full row content need a `dimensions` extension.

- **[Risk] Replay determinism if event ordering between `NPC_INTERACT` and `NPC_MENTORSHIP_COMPLETED` matters.**
  → Mitigation: all deltas are pure adds with clamp; addition is commutative. Order doesn't change final values.

- **[Risk] AI prompt size grows by 7 directive lines × N known NPCs.**
  → Mitigation: only emit directives when dimensions are extreme (≥70 or ≤30); typical NPC has 1-2 extreme directional edges. Average prompt growth ~5%.

- **[Trade-off] Asymmetric storage doubles row count.**
  → Accepted. 5,000 max rows is trivial for SQLite. Insert overhead measured per tick is negligible.

- **[Trade-off] No per-NPC personality multipliers on deltas (e.g., a high-greed NPC could feel resentment harder).**
  → Conscious choice. v1 ships deterministic deltas; personality weighting is a v2 sophistication.

- **[Risk] Pair-bond gate may freeze all household formation for fresh worlds where NPCs have never interacted enough.**
  → Mitigation: `NPC_INTERACT` cadence on a shared tile is frequent (per-day cadence). Households should still form within ~1-2 in-game days. If observed not to: lower threshold to 40 or seed initial attraction in profile config.

- **[Risk] `RelationshipType = 'feared'` is a new value not in the existing union — frontend may not render.**
  → Mitigation: extend the union in shared types; add localized labels for the new types.

## Migration Plan

1. **Database migration**: `ALTER TABLE npc_relationships ADD COLUMN dimensions_json TEXT NOT NULL DEFAULT '{"trust":50,...}'; ADD COLUMN direction TEXT NOT NULL DEFAULT 'a_to_b'`. Existing rows take defaults; the `trust` column stays.
2. **Drop+rebuild path**: `rebuildFromEvents` regenerates the entire table from EventLog. Existing trust scalars (already in the EventLog via `NPC_INTERACT` chat/argue history) reproduce identically.
3. **Pre-existing rows without dimensions are accepted** as having default 50-everything except familiarity (0); on first projection touch, the JSON gets populated.
4. **One-way migration.** Rollback is to drop new columns and revert reads to `trust`-only — possible because trust column is untouched.

## Open Questions

- **Q1:** Should `dependency` decay when an NPC moves households or becomes financially independent?
  - **Answer**: v1 — no automatic decay. Future event `NPC_LEFT_HOUSEHOLD` could drop dependency to 0. Out of scope.

- **Q2:** Does `attraction` decay over time if no recent interactions?
  - **Answer**: v1 — no. Once attracted, the NPC stays attracted until a contradicting event (e.g., aggression). Real life ≠ simulation; deterministic deltas only.

- **Q3:** How do we expose dimensions to admin debugging?
  - **Answer**: Extend `/api/world/npc-relationships?npcId=X` to include `dimensions` in the response. Build a small `/admin/npc-relationships/:id` page that shows the 8-axis radar chart per known target. Add to admin UI tasks but not core.

- **Q4:** Where does the matured-born-NPC + their parents' relationship start?
  - **Answer**: When `NPC_MATURED` is committed (from the `born-npc-becomes-runtime-entity` change), inject initial `dimensions(child→parent).trust=80, respect=70, loyalty=70, dependency=80, familiarity=80, attraction=30 (filial bond not romantic)`; parent→child mirrors with `respect=50, attraction=60 (parental love), loyalty=70, familiarity=80, dependency=20`. These are the only seeded values; the rest stays at defaults. (Out of scope for this change's task list; this is the integration point for the OTHER OpenSpec change.)

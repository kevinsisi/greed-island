# relationship-type-derivation Specification

## Purpose
Defines how the composite `RelationshipType` ∈ {`neutral`, `friend`, `rival`, `lover`, `mentor`, `apprentice`, `feared`} is deterministically computed from the eight-dimension vector + an external lineage edge lookup (for mentor/apprentice). Replaces the prior trust-threshold-only logic.

## ADDED Requirements

### Requirement: resolveRelationshipType SHALL produce a deterministic type from dimensions + lineage
A pure function `resolveRelationshipType(from, to, dimensions, isMentorOf, isApprenticeOf): RelationshipType` MUST evaluate in this precedence order:

1. If `dimensions.attraction ≥ 70 AND dimensions.trust ≥ 60` → `'lover'`
2. If `isApprenticeOf(from, to) === true` AND `dimensions.respect ≥ 70 AND dimensions.loyalty ≥ 60 AND dimensions.fear < 40` → `'apprentice'` (i.e., `from` is apprentice of `to`)
3. If `isMentorOf(from, to) === true` AND `dimensions.respect ≥ 60 AND dimensions.attraction ≥ 50 AND dimensions.fear < 40` → `'mentor'` (i.e., `from` is mentor of `to`)
4. If `dimensions.fear ≥ 70` → `'feared'`
5. If `dimensions.resentment ≥ 60 OR (dimensions.trust ≤ 25 AND dimensions.respect ≤ 40)` → `'rival'`
6. If `dimensions.trust ≥ 70 AND dimensions.respect ≥ 50` → `'friend'`
7. Else → `'neutral'`

#### Scenario: High trust + high attraction yields lover
- **GIVEN** dimensions { trust: 75, attraction: 85, fear: 20, ... }
- **WHEN** `resolveRelationshipType` runs
- **THEN** result MUST equal `'lover'`

#### Scenario: High fear overrides high trust
- **GIVEN** dimensions { trust: 80, fear: 85, attraction: 30, ... }
- **WHEN** `resolveRelationshipType` runs
- **THEN** result MUST equal `'feared'` (not `'friend'`)

#### Scenario: Apprentice link with high respect resolves to apprentice
- **GIVEN** dimensions { trust: 70, respect: 80, loyalty: 70, fear: 30, attraction: 40 }
- **AND** `isApprenticeOf(from, to) === true`
- **WHEN** `resolveRelationshipType` runs
- **THEN** result MUST equal `'apprentice'`

#### Scenario: High resentment yields rival despite moderate trust
- **GIVEN** dimensions { trust: 55, resentment: 70, respect: 50, fear: 20 }
- **WHEN** `resolveRelationshipType` runs
- **THEN** result MUST equal `'rival'`

#### Scenario: Default neutral on base values
- **GIVEN** dimensions at all defaults (trust=50, etc., familiarity=0)
- **WHEN** `resolveRelationshipType` runs
- **THEN** result MUST equal `'neutral'`

### Requirement: RelationshipType SHALL be stored on each row and refreshed on every dimension update
After every projection delta application, `resolveRelationshipType` MUST be re-evaluated and the row's `relationship_type` column MUST be updated atomically.

#### Scenario: Type flips after attraction crosses threshold
- **GIVEN** row with attraction 65, trust 65, type `'friend'`
- **WHEN** an `NPC_HOUSEHOLD_FORMED` event raises attraction to 95
- **THEN** the row's `relationship_type` column MUST be updated to `'lover'`

### Requirement: Type union SHALL be exposed to frontend
The TypeScript `RelationshipType` union exported to clients MUST equal `'neutral' | 'friend' | 'rival' | 'lover' | 'mentor' | 'apprentice' | 'feared'`. Localized labels MUST exist in `packages/web/src/i18n/zh.ts` and `en.ts` for each new value.

#### Scenario: Frontend renders new type names
- **WHEN** the AreaPage or AdminPage displays an NPC pair with `relationship_type='feared'`
- **THEN** the UI MUST render a non-empty localized label (e.g., `「畏懼」` / `feared`)

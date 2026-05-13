## ADDED Requirements

### Requirement: Layer 2.5 SHALL define a canonical initial species catalog

The server codebase SHALL define a canonical initial ecosystem species catalog
covering the 22 species listed in `docs/WORLD_CAPABILITIES.md` §6.4 across the
regions `salt_marsh`, `forest`, `mountain`, `desert`, and `ruin`.

#### Scenario: Catalog covers the documented initial regions
- **WHEN** the server loads the ecosystem species catalog
- **THEN** the catalog MUST contain exactly the documented region groups
- **AND** each species MUST have a stable `id`, `category`, `biomeAffinity`, and
  `rarity`

#### Scenario: Species ids are unique and deterministic
- **WHEN** the catalog is loaded twice in two independent processes
- **THEN** the species list order and species ids MUST be identical
- **AND** no duplicate species id may exist

### Requirement: Layer 2.5 SHALL define the Animal substrate type

The server codebase SHALL define a read-only `Animal` domain type matching the
Phase E0 substrate: `id`, `speciesId`, `tileId`, `biomeRegion`, `position`,
`state`, `hunger`, `health`, `fear`, `aggression`, optional `packId`, optional
`migrationTarget`, optional `currentTarget`, `reproductionCooldown`,
`lifecycleStage`, optional `ownerSettlementId`, optional `domesticatedBy`.

#### Scenario: Animal references a species from the catalog
- **WHEN** an `Animal` value is created in future slices
- **THEN** its `speciesId` MUST refer to a species present in the canonical
  ecosystem catalog

### Requirement: Ecosystem lookup helpers SHALL be read-only and deterministic

The ecosystem module SHALL provide deterministic read-only helpers for listing
the full catalog, looking up a species by id, and filtering by region or
category.

#### Scenario: Lookup by region is stable
- **WHEN** a caller requests `listSpeciesByRegion('forest')`
- **THEN** the returned species ids MUST be the same across repeated calls
- **AND** every returned species MUST include `forest` in its `biomeAffinity`

#### Scenario: Unknown species is rejected by requireSpecies
- **WHEN** a caller requests `requireSpecies('missing_species')`
- **THEN** the helper MUST throw an explicit error instead of returning a fake
  fallback species

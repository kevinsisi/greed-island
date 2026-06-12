## ADDED Requirements

### Requirement: Terrain cells SHALL render as beveled pixel bricks

Every active terrain cell in AreaScene and MapScene MUST be overlaid with a deterministic dither-noise texture (variant selected by cell coordinates) and a bevel texture (lighter top/left, darker bottom/right edges), generated procedurally at runtime with no external image assets. Water cells MUST additionally show a flickering sparkle overlay on a deterministic subset of cells.

#### Scenario: Same cell renders identically across reloads

- **GIVEN** cell (3,4) of t_forest
- **WHEN** the scene is recreated
- **THEN** the same noise variant MUST be selected (deterministic by coordinates)

### Requirement: Decorations SHALL render as pixel props instead of emoji

Every decoration glyph with a pixel-prop mapping (trees, rocks, houses, shops, shrines, lanterns, crystals, anchors, boats, signs…) MUST render as a procedurally generated pixel-art image anchored at the cell bottom (taller than the tile, with a drop shadow). Unmapped glyphs MAY fall back to the legacy emoji text. Existing environment animations (sway, flicker, float) MUST keep working on the prop images.

#### Scenario: Forest decorations are pixel trees

- **GIVEN** t_forest decorations containing 🌳 and 🌲
- **WHEN** AreaScene draws the background
- **THEN** pixel `tree` and `pine` images MUST be rendered with shadows instead of emoji text

### Requirement: Characters SHALL render as texture-based 8-bit pixel humans

`createProceduralHumanoidAvatar` MUST compose a character from pixel textures: tinted legs (pants color) and torso (outfit color = server-driven), a seeded skin-tone head with facing-aware eyes, and a seeded hair color/style — with a two-frame walk cycle, a raised-tool work frame, idle breathing, and a lying sleep pose. Scene recoloring MUST go through `applyAvatarOutfitColor`.

#### Scenario: Outfit recolor keeps skin and hair intact

- **GIVEN** an avatar whose faction color changes
- **WHEN** `applyAvatarOutfitColor(avatar, color)` is called
- **THEN** only the torso tint and label color change; head and hair textures are untouched

// Sprint 2A — world-visibility-ecology
// Display colors + emoji for known wildlife species, used by MapScene
// (Hub badges) and AreaScene (individual / cluster sprites). Unknown
// species fall back to a neutral palette + first-letter glyph.

export type SpeciesVisual = Readonly<{
  emoji: string
  /** 24-bit RGB sprite color. */
  color: number
  /** Short label fallback when emoji is unsupported. */
  letter: string
}>

const PALETTE: Readonly<Record<string, SpeciesVisual>> = {
  forest_deer: { emoji: '\u{1F98C}', color: 0x9c6b3c, letter: '鹿' },
  fog_wolf: { emoji: '\u{1F43A}', color: 0x6e6e7c, letter: '狼' },
  mountain_lynx: { emoji: '\u{1F408}', color: 0xc99c4a, letter: '猞' },
  marsh_heron: { emoji: '\u{1FAB6}', color: 0xe8e8e8, letter: '鷺' },
  reef_carp: { emoji: '\u{1F41F}', color: 0xe06b3a, letter: '鯉' },
  deep_eel: { emoji: '\u{1F40D}', color: 0x4a3a6e, letter: '鰻' },
  desert_jerboa: { emoji: '\u{1F42D}', color: 0xc6a86b, letter: '鼠' },
  ruin_raven: { emoji: '\u{1F426}', color: 0x2a2a2a, letter: '鴉' },
}

const FALLBACK: SpeciesVisual = { emoji: '\u{1F43E}', color: 0x808080, letter: '生' }

export function visualForSpecies(speciesId: string): SpeciesVisual {
  return PALETTE[speciesId] ?? {
    ...FALLBACK,
    letter: firstGlyph(speciesId),
  }
}

function firstGlyph(speciesId: string): string {
  if (!speciesId) return FALLBACK.letter
  const ch = speciesId.charAt(0).toUpperCase()
  return ch
}

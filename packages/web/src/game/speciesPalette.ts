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
  moss_boar: { emoji: '\u{1F417}', color: 0x7a4f2a, letter: '豬' },
  ember_owl: { emoji: '\u{1F989}', color: 0xd9892b, letter: '鴞' },
  bark_mantis: { emoji: '\u{1F997}', color: 0x72a142, letter: '螳' },
  mountain_lynx: { emoji: '\u{1F408}', color: 0xc99c4a, letter: '猞' },
  cliff_goat: { emoji: '\u{1F410}', color: 0xb8b0a0, letter: '羊' },
  iron_beak_vulture: { emoji: '\u{1F985}', color: 0x7b756d, letter: '鷲' },
  stone_lizard: { emoji: '\u{1F98E}', color: 0x83907c, letter: '蜥' },
  mountain_bear: { emoji: '\u{1F43B}', color: 0x6b4a32, letter: '熊' },
  marsh_heron: { emoji: '\u{1FAB6}', color: 0xe8e8e8, letter: '鷺' },
  marsh_fish: { emoji: '\u{1F41F}', color: 0x5ca7c8, letter: '魚' },
  salt_crab: { emoji: '\u{1F980}', color: 0xd46a3a, letter: '蟹' },
  reed_eel: { emoji: '\u{1F40D}', color: 0x596b3a, letter: '鰻' },
  white_marsh_leviathan: { emoji: '\u{1F40B}', color: 0xe9f5ff, letter: '鯨' },
  reef_carp: { emoji: '\u{1F41F}', color: 0xe06b3a, letter: '鯉' },
  deep_eel: { emoji: '\u{1F40D}', color: 0x4a3a6e, letter: '鰻' },
  desert_jerboa: { emoji: '\u{1F42D}', color: 0xc6a86b, letter: '鼠' },
  dune_lizard: { emoji: '\u{1F98E}', color: 0xc9a15e, letter: '蜥' },
  ash_serpent: { emoji: '\u{1F40D}', color: 0x7a6f63, letter: '蛇' },
  sand_runner: { emoji: '\u{1F407}', color: 0xd5b56f, letter: '兔' },
  mirage_hawk: { emoji: '\u{1F985}', color: 0xd0a24a, letter: '鷹' },
  ruin_raven: { emoji: '\u{1F426}', color: 0x2a2a2a, letter: '鴉' },
  ruin_rat: { emoji: '\u{1F400}', color: 0x8a7966, letter: '鼠' },
  mimic_mold: { emoji: '\u{1F344}', color: 0x8b6bb0, letter: '菌' },
  iron_hound: { emoji: '\u{1F415}', color: 0x5e6470, letter: '犬' },
  lantern_moth: { emoji: '\u{1F98B}', color: 0xf2d45c, letter: '蛾' },
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

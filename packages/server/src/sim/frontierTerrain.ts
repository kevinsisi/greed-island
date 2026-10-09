/** Authored 15×10 frontier terrain. Availability remains owned by TILE_GENERATED.
 * X = impassable rock, . = deep water; all other glyphs are walkable.
 * Players and NPCs consume these exact masks. Frontend mirrors are parity-tested.
 */
export const FRONTIER_TERRAIN: Readonly<Record<string, readonly string[]>> = Object.freeze({
  t_frontier_badlands: Object.freeze([
    'XXooooopoooooXX',
    'XoorroopoorrooX',
    'ooorrXopooXrroo',
    'ooooXXopooXXooo',
    'ppppppppppppppp',
    'ooooooopooooooo',
    'ooXXooopooXXooo',
    'oorrooopooorroo',
    'XoooooopooooooX',
    'XXooooopoooooXX',
  ]),
  t_frontier_highland: Object.freeze([
    'XXXXXXpppXXXXXX',
    'XXXXooopoooXXXX',
    'XXXooroporroXXX',
    'XXooXXopooXXooX',
    'ooooooopooooooo',
    'ppppppppppppppp',
    'XXoooroporrooXX',
    'XXXoooopooooXXX',
    'XXXXooopoooXXXX',
    'XXXXXXpppXXXXXX',
  ]),
  t_frontier_cove: Object.freeze([
    'LLLLLLLSSsss...',
    'LLLLLLLSSsss...',
    'LLXXLLLSSsss...',
    'LLXXLLLSSsss...',
    'LLLLLLLPPPPPPss',
    'LLLLLLLPPPPPPss',
    'LLLLLLLSSsss...',
    'LLXXLLLSSsss...',
    'LLLLLLLSSsss...',
    'LLLLLLLSSsss...',
  ]),
})

// Area-canvas grid constants extracted out of AreaScene so non-Phaser
// modules (terrainMask, tests, anything else that needs to reason
// about sub-cell coordinates) can import them without pulling Phaser
// into a Node test environment where `window` is undefined.

export const AREA_TILE_SIZE = 40
export const AREA_GRID_COLS = 15
export const AREA_GRID_ROWS = 10
export const AREA_CANVAS_WIDTH = AREA_TILE_SIZE * AREA_GRID_COLS // 600
export const AREA_CANVAS_HEIGHT = AREA_TILE_SIZE * AREA_GRID_ROWS // 400

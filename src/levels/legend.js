// Single source of truth for the ASCII level legend.
// Tiles become tilemap indices; entities spawn sprites and their cell empties.
import { SOLID_VARIANTS, ONEWAY_TILE_INDEX } from '../gfx/sprites.js';

export const CAGE_TILE_INDEX = 4;

// char -> tile index resolver (0 = empty). '#' picks a deterministic variant.
export function tileIndexFor(ch, col, row) {
  if (ch === '#') return SOLID_VARIANTS[(col * 7 + row * 13) % SOLID_VARIANTS.length];
  if (ch === '%') return CAGE_TILE_INDEX;
  if (ch === '-') return ONEWAY_TILE_INDEX;
  return 0;
}

export const TILE_CHARS = new Set(['#', '%', '-', '.']);

// Entity chars (everything else the parser understands).
export const ENTITY_CHARS = new Set(['P', 'X', 'C', 'S', 's', 'W', '*', 'H', '!', 'z', '|', 'j']);

export const SOLID_CHARS = new Set(['#', '%']);

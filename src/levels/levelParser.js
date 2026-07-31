// ASCII rows -> tilemap layer + entity spawn list + exit + bounds.
// Fails fast and loudly at load: level bugs must surface here, not in play.
import Phaser from 'phaser';
import { TILE, LEVEL_COLS } from '../constants.js';
import { SOLID_TILE_INDICES, ONEWAY_TILE_INDEX } from '../gfx/sprites.js';
import { tileIndexFor, TILE_CHARS, ENTITY_CHARS, SOLID_CHARS } from './legend.js';

export function validateLevel(levelDef) {
  const { rows, name } = levelDef;
  if (!rows?.length) throw new Error(`[level ${name}] no rows`);
  let spawns = 0, exits = 0;
  rows.forEach((row, r) => {
    if (row.length !== LEVEL_COLS) {
      throw new Error(`[level ${name}] row ${r} has ${row.length} chars, expected ${LEVEL_COLS}: "${row}"`);
    }
    for (const ch of row) {
      if (!TILE_CHARS.has(ch) && !ENTITY_CHARS.has(ch)) {
        throw new Error(`[level ${name}] row ${r}: unknown char "${ch}"`);
      }
      if (ch === 'P') spawns++;
      if (ch === 'X') exits++;
    }
  });
  if (spawns !== 1) throw new Error(`[level ${name}] expected exactly 1 'P' spawn, found ${spawns}`);
  if (exits < 1) throw new Error(`[level ${name}] no 'X' exit`);
}

// Grid coordinate helpers. row 0 = top of the level.
const cx = (col) => col * TILE + TILE / 2;
const cy = (row) => row * TILE + TILE / 2;

function isSolidAt(rows, col, row) {
  if (row < 0 || row >= rows.length || col < 0 || col >= LEVEL_COLS) return true; // out of bounds = solid
  return SOLID_CHARS.has(rows[row][col]);
}

// For mounted entities (clamps, barbs, lamps): which neighbor is solid.
// Returns 'left' | 'right' | 'up' | 'down' | null, preferring the order given.
function findMount(rows, col, row, prefer) {
  const n = {
    left: isSolidAt(rows, col - 1, row),
    right: isSolidAt(rows, col + 1, row),
    up: isSolidAt(rows, col, row - 1),
    down: isSolidAt(rows, col, row + 1),
  };
  for (const dir of prefer) if (n[dir]) return dir;
  return null;
}

// Scan from (col,row) along an axis to the nearest solid on each side.
// Returns patrol bounds in world px (centers of the first/last free cells).
function patrolBounds(rows, col, row, axis) {
  if (axis === 'h') {
    let lo = col, hi = col;
    while (!isSolidAt(rows, lo - 1, row)) lo--;
    while (!isSolidAt(rows, hi + 1, row)) hi++;
    return { min: cx(lo), max: cx(hi) };
  }
  let lo = row, hi = row;
  while (!isSolidAt(rows, col, lo - 1)) lo--;
  while (!isSolidAt(rows, col, hi + 1)) hi++;
  return { min: cy(lo), max: cy(hi) };
}

// First solid row at or below `row` in this column (for lamp beams / press floor).
function floorRowBelow(rows, col, row) {
  let r = row;
  while (r < rows.length && !isSolidAt(rows, col, r)) r++;
  return r; // row index of the solid tile (or rows.length)
}

export function parseLevel(scene, levelDef) {
  validateLevel(levelDef);
  const { rows, config = {} } = levelDef;
  const height = rows.length;

  // --- pass 1: tile grid ---
  const grid = [];
  for (let r = 0; r < height; r++) {
    const line = [];
    for (let c = 0; c < LEVEL_COLS; c++) {
      line.push(tileIndexFor(rows[r][c], c, r));
    }
    grid.push(line);
  }

  const map = scene.make.tilemap({ data: grid, tileWidth: TILE, tileHeight: TILE });
  const tileset = map.addTilesetImage('tiles');
  const layer = map.createLayer(0, tileset, 0, 0);
  layer.setCollision(SOLID_TILE_INDICES);
  layer.forEachTile((t) => {
    if (t.index === ONEWAY_TILE_INDEX) {
      t.setCollision(false, false, true, false); // stand on top, pass up through
    }
  });

  // --- pass 2: entities ---
  const spawns = [];
  let playerSpawn = null;
  const exitCells = [];

  for (let r = 0; r < height; r++) {
    for (let c = 0; c < LEVEL_COLS; c++) {
      const ch = rows[r][c];
      if (TILE_CHARS.has(ch)) continue;
      const cfg = config[`${c},${r}`] ?? {};
      const x = cx(c), y = cy(r);

      if (ch === 'P') {
        playerSpawn = { x, y };
      } else if (ch === 'X') {
        exitCells.push({ c, r });
      } else if (ch === 'C') {
        const mount = findMount(rows, c, r, ['left', 'right', 'down', 'up']);
        if (!mount) throw new Error(`[level ${levelDef.name}] clamp at ${c},${r} has no solid neighbor to mount on`);
        spawns.push({ type: 'clamp', x, y, mount, cfg });
      } else if (ch === 'S' || ch === 's') {
        const axis = ch === 'S' ? 'h' : 'v';
        spawns.push({ type: 'saw', x, y, axis, bounds: patrolBounds(rows, c, r, axis), cfg });
      } else if (ch === '*') {
        const mount = findMount(rows, c, r, ['down', 'up', 'left', 'right']);
        if (!mount) throw new Error(`[level ${levelDef.name}] barb at ${c},${r} has no solid neighbor`);
        spawns.push({ type: 'barb', x, y, mount, col: c, row: r, cfg });
        // Deny clinging to the mounted wall face at this cell.
        if (mount === 'left' || mount === 'right') {
          const t = layer.getTileAt(mount === 'left' ? c - 1 : c + 1, r);
          if (t) t.properties.noCling = true;
        }
      } else if (ch === 'H') {
        const floorRow = floorRowBelow(rows, c, r + 1);
        spawns.push({ type: 'lamp', x, y, beamBottom: floorRow * TILE, cfg });
      } else if (ch === 'W') {
        const floorRow = floorRowBelow(rows, c, r + 1);
        spawns.push({ type: 'press', x, y, lowY: floorRow * TILE - 2 * TILE, cfg });
      } else if (ch === '!') {
        spawns.push({ type: 'sign', x, y, cfg });
      } else if (ch === 'z') {
        spawns.push({ type: 'cagedLizard', x, y, cfg });
      } else if (ch === '|') {
        spawns.push({ type: 'pipe', x, y, cfg });
      } else if (ch === 'j') {
        spawns.push({ type: 'jar', x, y, cfg });
      }
    }
  }

  // Union all exit cells into one rect (levels have a single exit area).
  const minC = Math.min(...exitCells.map((e) => e.c));
  const maxC = Math.max(...exitCells.map((e) => e.c));
  const minR = Math.min(...exitCells.map((e) => e.r));
  const maxR = Math.max(...exitCells.map((e) => e.r));
  const exit = new Phaser.Geom.Rectangle(
    minC * TILE, minR * TILE,
    (maxC - minC + 1) * TILE, (maxR - minR + 1) * TILE,
  );

  return {
    layer,
    map,
    spawn: playerSpawn,
    exit,
    spawns,
    worldWidth: LEVEL_COLS * TILE,
    worldHeight: height * TILE,
    rows,
  };
}

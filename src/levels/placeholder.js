// Programmatic placeholder level builder — used by level1/2/3 until the real
// authored layouts land. Produces a valid climbable shaft with a few traps.
import { LEVEL_COLS } from '../constants.js';

export function buildPlaceholder(name, subtitle, paletteKey, height, trapChars) {
  const g = Array.from({ length: height }, () => Array(LEVEL_COLS).fill('#'));
  const carve = (r1, r2, c1, c2, ch = '.') => {
    for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) g[r][c] = ch;
  };
  // bottom room
  carve(height - 6, height - 2, 1, LEVEL_COLS - 2);
  // zig-zag shaft up: alternating 4-wide columns with connecting landings
  let leftSide = true;
  let lastTop = height - 7, lastC1 = 4;
  for (let top = height - 26; top >= 2; top -= 20) {
    const bot = Math.min(top + 19, height - 7);
    const c1 = leftSide ? 4 : LEVEL_COLS - 9;
    carve(top, bot, c1, c1 + 4);
    // landing corridor connecting to the previous shaft
    carve(bot - 1, bot, 4, LEVEL_COLS - 5);
    leftSide = !leftSide;
    lastTop = top; lastC1 = c1;
    // a trap on the shaft wall midway (wall to its left = mount)
    const midR = Math.floor((top + bot) / 2);
    const ch = trapChars[(top / 20 | 0) % trapChars.length];
    g[midR][c1] = ch;
  }
  // connect the last shaft to the top corridor, then exit
  carve(2, lastTop, lastC1, lastC1 + 4);
  carve(1, 2, 1, LEVEL_COLS - 2);
  g[1][14] = 'X'; g[1][15] = 'X';
  g[height - 2][2] = 'P';
  const rows = g.map((r) => r.join(''));
  return { name, subtitle, paletteKey, rows, config: {} };
}

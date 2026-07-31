// Pure pixel-string art data. No Phaser imports. Chars '.'/' ' = transparent.
// Rows may be built with helpers — only the resulting strings matter.
// Conventions:
//  - Gecko horizontal poses face RIGHT (flipX for left).
//  - Gecko cling/climb poses are drawn with the wall on the LEFT (flipX for right wall).
//  - The gecko has NO tail in any frame — the tail is a separate follower object.
import { P } from './palette.js';

const _ = (n) => '.'.repeat(n);

// ---------------------------------------------------------------------------
// GECKO (16x24 frames)
// ---------------------------------------------------------------------------
export const GECKO_PALETTE = { G: P.GREEN, D: P.GREEN_D, B: P.BELLY, E: P.EYE };

const BLANK16 = _(16);
const pad24 = (artRows) => {
  const out = [];
  for (let i = 0; i < 24 - artRows.length; i++) out.push(BLANK16);
  return [...out, ...artRows];
};

// Horizontal body (rows 18-21), legs vary per frame (rows 22-23).
const H_BODY = [
  '............GG..',
  '..DGGGGGGGGGEGG.',
  '.DGGGGGGGGGGGGG.',
  '.DBBBBBBBBBBGG..',
];
const hFrame = (legsA, legsB) => pad24([...H_BODY, legsA, legsB]);

const IDLE = hFrame('..G...G...G.....', '.G...G...G......');
const WALK = [
  hFrame('..G...G...G.....', '.G...G...G......'),
  hFrame('...G...G...G....', '..G...G...G.....'),
  hFrame('..G...G...G.....', '...G...G...G....'),
  hFrame('.G...G...G......', '..G...G...G.....'),
];
const JUMP = pad24([...H_BODY, '...G.G...G.G....', BLANK16]);
const FALL = pad24([...H_BODY, '.G..G....G..G...', 'G............G..']);

// Vertical cling column (head up, wall at left). Leg rows reach x=0.
const vRow = (art) => art + _(16 - art.length);
const clingFrames = (legOffset) => {
  const rows = [];
  rows.push(vRow('..GG'));
  rows.push(vRow('.GGGG'));
  rows.push(vRow('.GEGG'));
  rows.push(vRow('..GGG'));
  for (let y = 4; y < 22; y++) {
    const legPhase = (y + legOffset) % 5 === 0 && y < 17;
    if (legPhase) rows.push(vRow('G.GGGD'));
    else if (y < 16) rows.push(vRow('..GGGD'));
    else if (y < 19) rows.push(vRow('..GGG'));
    else rows.push(vRow('...GG'));
  }
  rows.push(vRow('...G'));
  rows.push(BLANK16);
  return rows;
};
const CLING = clingFrames(1);
const CLIMB = [clingFrames(1), clingFrames(3)];

export const GECKO = {
  palette: GECKO_PALETTE,
  spec: {
    idle: [IDLE],
    walk: WALK,
    jump: [JUMP],
    fall: [FALL],
    cling: [CLING],
    climb: CLIMB,
  },
  anims: {
    idle: { frameRate: 2, repeat: -1 },
    walk: { frameRate: 10, repeat: -1 },
    climb: { frameRate: 8, repeat: -1 },
  },
};

// ---------------------------------------------------------------------------
// TAIL (separate follower segments + detached drop)
// ---------------------------------------------------------------------------
export const TAIL_PALETTE = { G: P.GREEN, D: P.GREEN_D };

export const TAIL_BASE = [[
  '.GGGG.',
  'GGGGGG',
  'GGGGGG',
  'GGGGGG',
  'GGGGGG',
  '.DDDD.',
]];
export const TAIL_MID = [[
  '.GGG.',
  'GGGGG',
  'GGGGG',
  'GGGGG',
  '.DDD.',
]];
export const TAIL_TIP = [[
  '.GG.',
  'GGGG',
  'GGGG',
  '.DD.',
]];
export const TAIL_DROP = [[
  '..GGGGGGGGG...',
  '.GGGGGGGGGGGG.',
  'GGGGGGGGGGGGGG',
  'GGGGGGGGGGGGG.',
  '.DGGGGGGGGGD..',
  '..DDDDDDDD....',
]];

// ---------------------------------------------------------------------------
// TILES (16x16, ordered — index in this array + 1 === tile index in maps)
// ---------------------------------------------------------------------------
export const TILE_PALETTE = {
  '#': P.INK, S: P.STEEL, L: P.STEEL_L, s: P.SHADOW, R: P.RUST, r: P.RUST_L,
};

const steel = (seamX, rivets) => {
  const rows = ['L'.repeat(16)];
  for (let y = 1; y < 15; y++) {
    let row = '';
    for (let x = 0; x < 16; x++) {
      if (x === seamX && y > 2 && y < 13) row += 's';
      else if (rivets && (y === 3 || y === 12) && (x === 2 || x === 13)) row += 'L';
      else row += 'S';
    }
    rows.push(row);
  }
  rows.push('s'.repeat(16));
  return rows;
};

const CAGE_TILE = (() => {
  const bar = '..RR..RR..RR..RR';
  const rows = ['r'.repeat(16)];
  for (let y = 1; y < 15; y++) rows.push(bar);
  rows.push('r'.repeat(16));
  return rows;
})();

const GRATE_TILE = (() => {
  const rows = ['L'.repeat(16)];
  for (let y = 1; y < 5; y++) rows.push('SS.SS.SS.SS.SS.S');
  rows.push('s'.repeat(16));
  for (let y = 6; y < 16; y++) rows.push(BLANK16);
  return rows;
})();

// Ordered tile defs. Level parser references these indices (+1 for the
// reserved empty slot 0): 1 steelA, 2 steelB, 3 riveted, 4 cage, 5 grate.
export const TILES = [steel(5, false), steel(10, false), steel(7, true), CAGE_TILE, GRATE_TILE];
export const SOLID_TILE_INDICES = [1, 2, 3, 4];
export const ONEWAY_TILE_INDEX = 5;
export const SOLID_VARIANTS = [1, 2, 3]; // '#' picks among these deterministically

// ---------------------------------------------------------------------------
// TRAPS
// ---------------------------------------------------------------------------
export const TRAP_PALETTE = {
  '#': P.INK, S: P.STEEL, L: P.STEEL_L, s: P.SHADOW, R: P.RUST, r: P.RUST_L,
  X: P.RED, Y: P.YEL, O: P.ORANGE, W: P.WHITE, G: P.GREEN, T: P.TEAL,
};

// Tail-Clamp 16x16 — drawn mounted on LEFT edge, jaws opening rightward.
// Frames: 0 idle(open) 1 windup(red eye) 2 snap(slammed shut) 3 reset(half)
const clampFrame = (jaw) => {
  // jaw: 'open' | 'wind' | 'shut' | 'half'
  const rows = [];
  for (let y = 0; y < 16; y++) {
    let base = y >= 2 && y <= 13 ? 'R#' : '..';
    let art = _(14);
    if (jaw === 'open') {
      if (y === 2) art = 'LLLLLLL' + _(7);
      else if (y === 3) art = '#SSSSSL' + _(7);
      else if (y === 7 || y === 8) art = 'SS' + _(12);
      else if (y === 12) art = '#SSSSSL' + _(7);
      else if (y === 13) art = 'LLLLLLL' + _(7);
    } else if (jaw === 'wind') {
      if (y === 1) art = 'LLLLLLL' + _(7);
      else if (y === 2) art = '#SSSSSL' + _(7);
      else if (y === 7) art = 'SSX' + _(11); // red eye lit
      else if (y === 8) art = 'SS' + _(12);
      else if (y === 13) art = '#SSSSSL' + _(7);
      else if (y === 14) art = 'LLLLLLL' + _(7);
    } else if (jaw === 'shut') {
      if (y === 6) art = 'LLLLLLLLLLLLL.';
      else if (y === 7) art = 'SSSSSSSSSSSSS#';
      else if (y === 8) art = 'SSSSSSSSSSSSS#';
      else if (y === 9) art = 'LLLLLLLLLLLLL.';
      else if (y === 5 || y === 10) art = '#############.';
    } else { // half
      if (y === 4) art = 'LLLLLLLLL' + _(5);
      else if (y === 5) art = '#SSSSSSSL' + _(5);
      else if (y === 7 || y === 8) art = 'SS' + _(12);
      else if (y === 10) art = '#SSSSSSSL' + _(5);
      else if (y === 11) art = 'LLLLLLLLL' + _(5);
    }
    rows.push(base + art);
  }
  return rows;
};
export const CLAMP = {
  palette: TRAP_PALETTE,
  spec: {
    idle: [clampFrame('open')],
    wind: [clampFrame('wind'), clampFrame('open')], // quiver = alternate
    snap: [clampFrame('shut')],
    reset: [clampFrame('half')],
  },
  anims: { wind: { frameRate: 12, repeat: -1 } },
};

// Harvester Shear 16x16 — circular saw, 2 rotation frames.
const sawFrame = (phase) => {
  const rows = [];
  const c = 7.5, rad = 7;
  for (let y = 0; y < 16; y++) {
    let row = '';
    for (let x = 0; x < 16; x++) {
      const dx = x - c, dy = y - c;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > rad) { row += '.'; continue; }
      if (d > rad - 1.2) {
        // teeth: alternate by angle, offset by phase
        const a = Math.floor(((Math.atan2(dy, dx) + Math.PI) / (Math.PI * 2)) * 12 + phase);
        row += a % 2 ? '#' : 'L';
      } else if (d < 2) row += 'X';
      else if (d < 3) row += 's';
      else row += a2(dx, dy, phase) ? 'S' : 'L';
    }
    rows.push(row);
  }
  return rows;
};
const a2 = (dx, dy, phase) => {
  const a = Math.floor(((Math.atan2(dy, dx) + Math.PI) / (Math.PI * 2)) * 4 + phase);
  return a % 2 === 0;
};
export const SAW = {
  palette: TRAP_PALETTE,
  spec: { spin: [sawFrame(0), sawFrame(1)] },
  anims: { spin: { frameRate: 14, repeat: -1 } },
};

// Barb strip 16x16 — coiled wire hugging the BOTTOM edge (rotate at spawn).
const BARB = (() => {
  const rows = [];
  for (let y = 0; y < 10; y++) rows.push(BLANK16);
  rows.push('..#....#....#...');
  rows.push('.L#L..L#L..L#L..');
  rows.push('L.X.LL.X.LL.X.L.');
  rows.push('.LL.L.LL.L.LL.L.');
  rows.push('L..LL L..LL..L.L'.replace(' ', '.'));
  rows.push('sLssLsLssLsLssLs');
  return rows;
})();
export const BARB_STRIP = { palette: TRAP_PALETTE, spec: { idle: [BARB] }, anims: {} };

// Heat lamp fixture 16x16 — caged bulb hanging from top. Frames: off, warm, on.
const lampFrame = (state) => {
  const bulb = state === 'on' ? 'O' : state === 'warm' ? 'r' : 's';
  const glow = state === 'on' ? 'O' : '.';
  return [
    '......RRRR......',
    '.......RR.......',
    '....R#####R.....',
    '...R#SSSSS#R....',
    '...#S' + bulb.repeat(5) + 'S#....',
    '...#S' + bulb.repeat(5) + 'S#....',
    '...#S' + bulb.repeat(5) + 'S#....',
    '...R#S' + bulb.repeat(3) + 'S#R....',
    '....R##' + (state === 'on' ? 'O' : '#') + '##R.....',
    '.....#.#.#......',
    '....' + glow + '.' + glow + '.' + glow + '.' + glow + '.....',
    BLANK16, BLANK16, BLANK16, BLANK16, BLANK16,
  ];
};
export const LAMP = {
  palette: TRAP_PALETTE,
  spec: { off: [lampFrame('off')], warm: [lampFrame('warm'), lampFrame('off')], on: [lampFrame('on')] },
  anims: { warm: { frameRate: 8, repeat: -1 } },
};

// The Press 48x16 — 3-tile-wide harvester head, 2 frames (teeth shift).
const pressFrame = (shift) => {
  const rows = [];
  rows.push('R'.repeat(48));
  for (let y = 1; y < 10; y++) {
    if (y === 5) {
      rows.push('S'.repeat(22) + 'XX' + 'S'.repeat(24)); // center eye
    } else {
      rows.push('S'.repeat(48));
    }
  }
  let chev = '';
  for (let x = 0; x < 48; x++) chev += Math.floor((x + shift * 4) / 4) % 2 ? 'Y' : '#';
  rows.push(chev);
  rows.push(chev);
  for (let y = 12; y < 15; y++) {
    let teeth = '';
    for (let x = 0; x < 48; x++) {
      const t = (x + shift * 2) % 4;
      teeth += y - 12 >= 2 - (t % 2) * 2 ? (t < 2 ? 'L' : '#') : '.';
    }
    rows.push(teeth);
  }
  let tips = '';
  for (let x = 0; x < 48; x++) tips += (x + shift * 2) % 4 === 1 ? '#' : '.';
  rows.push(tips);
  return rows;
};
export const PRESS = {
  palette: TRAP_PALETTE,
  spec: { grind: [pressFrame(0), pressFrame(1)] },
  anims: { grind: { frameRate: 6, repeat: -1 } },
};

// The Collector deck 48x24, tiled horizontally as a TileSprite. 2 frames.
const collectorFrame = (alt) => {
  const rows = [];
  // claw arms reaching up (alternate positions between frames)
  for (let y = 0; y < 10; y++) {
    let row = '';
    for (let x = 0; x < 48; x++) {
      const grp = Math.floor(x / 12);
      const lx = x % 12;
      const up = (grp % 2 === 0) !== alt; // this arm raised in this frame
      const armH = up ? 0 : 4;
      if (y >= armH && (lx === 5 || lx === 6)) row += 'L';
      else if (y === armH && (lx === 3 || lx === 8)) row += 'L';
      else if (y === armH + 1 && (lx === 4 || lx === 7)) row += '#';
      else row += '.';
    }
    rows.push(row);
  }
  // deck with lamp eyes + jars of tails
  rows.push('R'.repeat(48));
  rows.push('r'.repeat(48));
  for (let y = 12; y < 22; y++) {
    let row = '';
    for (let x = 0; x < 48; x++) {
      const lx = x % 16;
      if (y === 14 && lx === 2) row += 'X'; // lamp eye
      else if (y >= 15 && y <= 20 && lx >= 6 && lx <= 10) {
        // jar with a green tail inside
        if (lx === 6 || lx === 10 || y === 15) row += 'T';
        else if (y >= 17 && y <= 19 && lx === 8) row += 'G';
        else row += 's';
      } else row += y > 20 ? '#' : 'R';
    }
    rows.push(row);
  }
  rows.push('#'.repeat(48));
  rows.push('#'.repeat(48));
  return rows;
};
export const COLLECTOR = {
  palette: TRAP_PALETTE,
  spec: { churn: [collectorFrame(false), collectorFrame(true)] },
  anims: { churn: { frameRate: 4, repeat: -1 } },
};

// ---------------------------------------------------------------------------
// PROPS + UI BITS
// ---------------------------------------------------------------------------
export const PROP_PALETTE = {
  '#': P.INK, S: P.STEEL, L: P.STEEL_L, s: P.SHADOW, R: P.RUST, r: P.RUST_L,
  Y: P.YEL, W: P.WHITE, G: P.GREEN_D, T: P.TEAL, K: P.SKY, X: P.RED,
};

// Hazard sign 16x16 — yellow plate, ink '!'
export const SIGN = [[
  '................',
  '.##############.',
  '.#YYYYYYYYYYYY#.',
  '.#YYYYY##YYYYY#.',
  '.#YYYYY##YYYYY#.',
  '.#YYYYY##YYYYY#.',
  '.#YYYYY##YYYYY#.',
  '.#YYYYY##YYYYY#.',
  '.#YYYYYYYYYYYY#.',
  '.#YYYYY##YYYYY#.',
  '.#YYYYY##YYYYY#.',
  '.#YYYYYYYYYYYY#.',
  '.##############.',
  '.......##.......',
  '.......##.......',
  '................',
]];

// Caged lizard silhouette 16x16 (background storytelling)
export const CAGED_LIZARD = [[
  BLANK16, BLANK16, BLANK16, BLANK16,
  '................',
  '................',
  '..........GG....',
  '....GGGGGGGGG...',
  '...GGGGGGGGGG...',
  '..G..G...G......',
  BLANK16, BLANK16, BLANK16, BLANK16, BLANK16, BLANK16,
].flat()];

// Exit hatch 24x16 — frames: closed, glowing
const hatch = (glow) => {
  const g = glow ? 'K' : 's';
  const rows = [];
  rows.push('R'.repeat(24));
  for (let y = 1; y < 14; y++) {
    let row = 'R#';
    for (let x = 2; x < 22; x++) {
      if (y >= 3 && y <= 11 && x >= 4 && x <= 19) row += g;
      else row += 'S';
    }
    row += '#R';
    rows.push(row);
  }
  rows.push('R'.repeat(24));
  rows.push('#'.repeat(24));
  return rows;
};
export const HATCH = {
  palette: PROP_PALETTE,
  spec: { closed: [hatch(false)], glow: [hatch(true), hatch(false)] },
  anims: { glow: { frameRate: 3, repeat: -1 } },
};

// Pipe 16x16 (vertical)
export const PIPE = [(() => {
  const rows = [];
  for (let y = 0; y < 16; y++) rows.push('....#SLLSS#.....');
  return rows;
})()];

// Jar of tails 16x16 (background prop, conveyor dressing)
export const JAR = [[
  '................',
  '....TTTTTTT.....',
  '....T.....T.....',
  '...TTTTTTTTT....',
  '...TsssssssT....',
  '...TssGssssT....',
  '...TssGGsssT....',
  '...TsssGsssT....',
  '...TssGGsssT....',
  '...TsGGssssT....',
  '...TsssssssT....',
  '...TTTTTTTTT....',
  '................',
  '................',
  '................',
  '................',
]];

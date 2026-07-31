#!/usr/bin/env node
// Level validator: node tools/validate-level.mjs src/levels/level1.js
// Checks structure, legend chars, entity mounts, P->X reachability (flood
// fill), and the fairness rules that can be asserted statically.
import { pathToFileURL } from 'url';
import { resolve } from 'path';

const COLS = 30;
const TILE_CHARS = new Set(['#', '%', '-', '.']);
const ENTITY_CHARS = new Set(['P', 'X', 'C', 'S', 's', 'W', '*', 'H', '!', 'z', '|', 'j']);
const SOLID = new Set(['#', '%']);
const TRAP_CHARS = new Set(['C', 'S', 's', 'W', '*', 'H']);

const file = process.argv[2];
if (!file) { console.error('usage: node tools/validate-level.mjs <level file>'); process.exit(2); }
const mod = await import(pathToFileURL(resolve(file)).href);
const level = mod.default;
const { rows, name } = level;

const errors = [];
const warnings = [];
const err = (m) => errors.push(m);
const warn = (m) => warnings.push(m);

if (!rows?.length) { err('no rows'); }
rows.forEach((row, r) => {
  if (typeof row !== 'string' || row.length !== COLS) err(`row ${r}: length ${row?.length}, expected ${COLS}`);
  for (const ch of row) if (!TILE_CHARS.has(ch) && !ENTITY_CHARS.has(ch)) err(`row ${r}: unknown char "${ch}"`);
});

const H = rows.length;
const at = (c, r) => (r < 0 || r >= H || c < 0 || c >= COLS ? '#' : rows[r][c]);
const solid = (c, r) => SOLID.has(at(c, r));

// entity census
const found = {};
let P = null;
const exits = [];
const traps = [];
for (let r = 0; r < H; r++) {
  for (let c = 0; c < COLS; c++) {
    const ch = rows[r][c];
    found[ch] = (found[ch] ?? 0) + 1;
    if (ch === 'P') P = { c, r };
    if (ch === 'X') exits.push({ c, r });
    if (TRAP_CHARS.has(ch)) traps.push({ ch, c, r });
  }
}
if ((found.P ?? 0) !== 1) err(`expected exactly 1 P, found ${found.P ?? 0}`);
if (!exits.length) err('no X exit');

// mounts
for (const t of traps) {
  const { ch, c, r } = t;
  const hasMount = solid(c - 1, r) || solid(c + 1, r) || solid(c, r - 1) || solid(c, r + 1);
  if ((ch === 'C' || ch === '*') && !hasMount) err(`${ch} at ${c},${r}: no solid neighbor to mount`);
  if (ch === 'H' && !solid(c, r - 1)) err(`H at ${c},${r}: must hang under a solid (needs solid above)`);
  if (ch === 'S') {
    let lo = c, hi = c;
    while (!solid(lo - 1, r)) lo--;
    while (!solid(hi + 1, r)) hi++;
    if (hi - lo < 2) err(`S at ${c},${r}: patrol span ${hi - lo + 1} < 3 tiles`);
    if (hi - lo > 14) warn(`S at ${c},${r}: patrol span ${hi - lo + 1} tiles is very long`);
  }
  if (ch === 's') {
    let lo = r, hi = r;
    while (!solid(c, lo - 1)) lo--;
    while (!solid(c, hi + 1)) hi++;
    if (hi - lo < 2) err(`s at ${c},${r}: patrol span ${hi - lo + 1} < 3 tiles`);
  }
  if (ch === 'W') {
    if (at(c - 1, r) === '#' || at(c + 1, r) === '#') warn(`W at ${c},${r}: press is 3 tiles wide, wants clear cells each side`);
    let rr = r + 1;
    while (rr < H && !solid(c, rr)) rr++;
    if (rr - r < 5) err(`W at ${c},${r}: stroke depth ${rr - r} < 5 tiles to floor`);
  }
}

// P -> X reachability (flood fill through non-solid cells)
if (P && exits.length) {
  const pass = (c, r) => !solid(c, r);
  const seen = new Set([`${P.c},${P.r}`]);
  const q = [P];
  while (q.length) {
    const { c, r } = q.pop();
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nc = c + dc, nr = r + dr, k = `${nc},${nr}`;
      if (nc < 0 || nc >= COLS || nr < 0 || nr >= H || seen.has(k) || !pass(nc, nr)) continue;
      seen.add(k);
      q.push({ c: nc, r: nr });
    }
  }
  if (!exits.some((e) => seen.has(`${e.c},${e.r}`))) err('X not reachable from P (flood fill)');
}

// fairness: no trap within 6 tiles (Chebyshev) of P
if (P) {
  for (const t of traps) {
    if (Math.max(Math.abs(t.c - P.c), Math.abs(t.r - P.r)) <= 6) {
      err(`${t.ch} at ${t.c},${t.r}: within 6 tiles of spawn`);
    }
  }
}
// fairness: victory lap — no traps within 8 rows below the exit row
if (exits.length) {
  const xr = Math.max(...exits.map((e) => e.r));
  for (const t of traps) {
    if (t.r >= xr && t.r <= xr + 8) err(`${t.ch} at ${t.c},${t.r}: inside the victory-lap zone (within 8 rows of exit)`);
  }
}
// fairness: trap density — max 4 traps per 17-row window
for (let r = 0; r + 17 <= H; r++) {
  const n = traps.filter((t) => t.r >= r && t.r < r + 17).length;
  if (n > 4) { err(`trap density: ${n} traps in rows ${r}-${r + 16} (max 4)`); break; }
}

// pressure config sanity (level 3)
if (level.pressure) {
  const p = level.pressure;
  for (const k of ['triggerTilesFromBottom', 'speedTps']) {
    if (typeof p[k] !== 'number') err(`pressure.${k} missing/not a number`);
  }
  (p.stalls ?? []).forEach((s, i) => {
    if (s.tilesFromBottom > H) err(`pressure.stalls[${i}] above level top`);
  });
}

console.log(`level "${name}": ${H} rows, traps: ${traps.length} (${Object.entries(found).filter(([k]) => TRAP_CHARS.has(k)).map(([k, v]) => `${k}:${v}`).join(' ')})`);
warnings.forEach((w) => console.log('WARN:', w));
if (errors.length) {
  errors.forEach((e) => console.log('ERROR:', e));
  process.exit(1);
}
console.log('VALID');

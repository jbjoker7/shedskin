// Runtime pixel-art engine. All game art is generated here from pixel-string
// frames — no image files exist in this repo.
//
// A "frame" is an array of equal-length strings. Chars '.' and ' ' are
// transparent; every other char must exist in the palette {char: '#rrggbb'}.
// Everything is painted at 1x — the game camera's zoom provides display scale.

function validateFrame(key, frame, palette, w, h) {
  if (frame.length !== h) {
    throw new Error(`[gfx] ${key}: frame has ${frame.length} rows, expected ${h}`);
  }
  for (const row of frame) {
    if (row.length !== w) {
      throw new Error(`[gfx] ${key}: ragged row "${row}" (len ${row.length}, expected ${w})`);
    }
    for (const ch of row) {
      if (ch !== '.' && ch !== ' ' && !palette[ch]) {
        throw new Error(`[gfx] ${key}: unknown palette char "${ch}"`);
      }
    }
  }
}

function paintFrame(ctx, frame, palette, ox, oy) {
  for (let y = 0; y < frame.length; y++) {
    const row = frame[y];
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === '.' || ch === ' ') continue;
      ctx.fillStyle = palette[ch];
      ctx.fillRect(ox + x, oy + y, 1, 1);
    }
  }
}

// One horizontal-strip texture from an array of frames. Registers integer
// frame names 0..n-1. Returns the CanvasTexture.
export function makeTexture(scene, key, frames, palette) {
  if (!frames.length) throw new Error(`[gfx] ${key}: no frames`);
  const h = frames[0].length;
  const w = frames[0][0].length;
  frames.forEach((f) => validateFrame(key, f, palette, w, h));

  const tex = scene.textures.createCanvas(key, w * frames.length, h);
  const ctx = tex.getContext();
  frames.forEach((f, i) => paintFrame(ctx, f, palette, i * w, 0));
  // Add frames in order so frame 0 is always the texture's firstFrame.
  frames.forEach((_, i) => tex.add(i, 0, i * w, 0, w, h));
  tex.refresh();
  return tex;
}

// Named animation groups on one strip texture.
// spec = { idle: [frame], walk: [f1, f2, ...], ... }
// anims = { walk: { frameRate: 10, repeat: -1 }, ... }  (groups without an
// entry get no registered anim — fine for single-frame poses)
// Registers anims as `${key}-${name}`. Returns { key, frameIndex } where
// frameIndex.walk === [1, 2, 3] etc.
export function makeSheet(scene, key, spec, palette, anims = {}) {
  const flat = [];
  const frameIndex = {};
  for (const [name, frames] of Object.entries(spec)) {
    frameIndex[name] = frames.map((f) => {
      flat.push(f);
      return flat.length - 1;
    });
  }
  makeTexture(scene, key, flat, palette);
  for (const [name, cfg] of Object.entries(anims)) {
    if (!frameIndex[name]) throw new Error(`[gfx] ${key}: anim "${name}" has no frames in spec`);
    scene.anims.create({
      key: `${key}-${name}`,
      frames: frameIndex[name].map((i) => ({ key, frame: i })),
      frameRate: cfg.frameRate ?? 8,
      repeat: cfg.repeat ?? -1,
    });
  }
  return { key, frameIndex };
}

// Tileset strip. tileDefs is ORDERED; index 0 is reserved empty (painted
// transparent). Tile indices used by the level parser === positions here.
export function makeTiles(scene, key, tileDefs, palette) {
  const size = 16;
  const empty = Array.from({ length: size }, () => '.'.repeat(size));
  return makeTexture(scene, key, [empty, ...tileDefs], palette);
}

// Solid-color / gradient helpers for backgrounds.
export function makeGradient(scene, key, w, h, stops) {
  const tex = scene.textures.createCanvas(key, w, h);
  const ctx = tex.getContext();
  const g = ctx.createLinearGradient(0, 0, 0, h);
  for (const [t, color] of stops) g.addColorStop(t, color);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  tex.refresh();
  return tex;
}

// Mid-layer parallax silhouette: dark pipes and girders, tileable.
export function makeBgMid(scene, key, colors) {
  const size = 96;
  const tex = scene.textures.createCanvas(key, size, size);
  const ctx = tex.getContext();
  ctx.fillStyle = colors.pipe;
  ctx.fillRect(14, 0, 5, size);   // vertical pipe
  ctx.fillRect(70, 0, 3, size);   // thin conduit
  ctx.fillStyle = colors.girder;
  ctx.fillRect(0, 30, size, 6);   // girder
  ctx.fillRect(0, 78, size, 4);
  ctx.fillStyle = colors.pipe;
  ctx.fillRect(38, 52, 22, 16);   // duct box
  tex.refresh();
  return tex;
}

// Dithered dark noise tile for parallax texture.
export function makeNoise(scene, key, size, colors, density = 0.12) {
  const tex = scene.textures.createCanvas(key, size, size);
  const ctx = tex.getContext();
  // Deterministic hash noise — no RNG state, same every boot.
  // `^` coerces to signed int32, so force unsigned before the modulo or half
  // the columns hash negative and paint solid.
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const v = (((x * 73856093) ^ (y * 19349663)) >>> 0) % 997;
      if (v / 997 < density) {
        ctx.fillStyle = colors[v % colors.length];
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }
  tex.refresh();
  return tex;
}

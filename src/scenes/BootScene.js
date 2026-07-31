// Generates every texture and animation in the game (a few ms of canvas
// painting — no loading bar needed), then hands off to Title or a ?level= jump.
import Phaser from 'phaser';
import { makeTexture, makeSheet, makeTiles, makeNoise } from '../gfx/textures.js';
import * as ART from '../gfx/sprites.js';
import { P } from '../gfx/palette.js';
import { sfx } from '../audio/sfx.js';

export class BootScene extends Phaser.Scene {
  constructor() { super('Boot'); }

  create() {
    const sheets = {};
    sheets.gecko = makeSheet(this, 'gecko', ART.GECKO.spec, ART.GECKO.palette, ART.GECKO.anims);
    sheets.clamp = makeSheet(this, 'clamp', ART.CLAMP.spec, ART.CLAMP.palette, ART.CLAMP.anims);
    sheets.saw = makeSheet(this, 'saw', ART.SAW.spec, ART.SAW.palette, ART.SAW.anims);
    sheets.lamp = makeSheet(this, 'lamp', ART.LAMP.spec, ART.LAMP.palette, ART.LAMP.anims);
    sheets.press = makeSheet(this, 'press', ART.PRESS.spec, ART.PRESS.palette, ART.PRESS.anims);
    sheets.collector = makeSheet(this, 'collector', ART.COLLECTOR.spec, ART.COLLECTOR.palette, ART.COLLECTOR.anims);
    sheets.hatch = makeSheet(this, 'hatch', ART.HATCH.spec, ART.HATCH.palette, ART.HATCH.anims);

    makeTexture(this, 'barbs', ART.BARB_STRIP.spec.idle, ART.BARB_STRIP.palette);
    makeTexture(this, 'tail-base', ART.TAIL_BASE, ART.TAIL_PALETTE);
    makeTexture(this, 'tail-mid', ART.TAIL_MID, ART.TAIL_PALETTE);
    makeTexture(this, 'tail-tip', ART.TAIL_TIP, ART.TAIL_PALETTE);
    makeTexture(this, 'tail-drop', ART.TAIL_DROP, ART.TAIL_PALETTE);
    makeTexture(this, 'sign', ART.SIGN, ART.PROP_PALETTE);
    makeTexture(this, 'caged-lizard', ART.CAGED_LIZARD, ART.PROP_PALETTE);
    makeTexture(this, 'pipe', ART.PIPE, ART.PROP_PALETTE);
    makeTexture(this, 'jar', ART.JAR, ART.PROP_PALETTE);
    makeTiles(this, 'tiles', ART.TILES, ART.TILE_PALETTE);
    makeNoise(this, 'bg-noise', 64, [P.SHADOW, P.STEEL], 0.1);

    // 1x1 white pixel for particles/flashes
    const px = this.textures.createCanvas('px', 1, 1);
    px.getContext().fillStyle = '#ffffff';
    px.getContext().fillRect(0, 0, 1, 1);
    px.refresh();

    this.registry.set('sheets', sheets);

    // persistent bits (registry is the runtime source of truth)
    let unlocked = 0;
    try { unlocked = parseInt(localStorage.getItem('shedskin.unlocked') ?? '0', 10) || 0; } catch { /* private mode */ }
    this.registry.set('unlocked', unlocked);
    this.registry.set('failCount', 0);
    this.registry.set('totalFails', 0);
    this.registry.set('runStart', 0);

    sfx.init();
    this.input.keyboard.on('keydown-M', () => sfx.setMuted(!sfx.isMuted()));

    const params = new URLSearchParams(location.search);
    if (params.has('gfx')) return this.debugGrid();
    const jump = params.get('level');
    if (jump !== null) {
      this.scene.start('Game', { level: jump === 'test' ? 'test' : parseInt(jump, 10) - 1 });
    } else {
      this.scene.start('Title');
    }
  }

  // ?gfx — draw every generated texture at 4x for art iteration
  debugGrid() {
    this.cameras.main.setBackgroundColor('#223');
    let x = 20, y = 20, rowH = 0;
    for (const key of this.textures.getTextureKeys()) {
      if (['__DEFAULT', '__MISSING', '__WHITE', '__NORMAL', 'px'].includes(key)) continue;
      const src = this.textures.get(key).getSourceImage();
      const img = this.add.image(x, y, key, 0).setOrigin(0, 0).setScale(4);
      this.add.text(x, y - 14, key, { fontSize: '10px', color: '#fff' });
      x += src.width * 4 + 24;
      rowH = Math.max(rowH, src.height * 4);
      if (x > 900) { x = 20; y += rowH + 40; rowH = 0; }
    }
  }
}

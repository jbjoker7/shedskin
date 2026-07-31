// The game: parses the level, builds the world, owns the playing/dying/won
// state machine. Restart = scene.restart with data — a full clean rebuild.
import Phaser from 'phaser';
import { TUNING as T } from '../config/tuning.js';
import { TILE, VIEW_W, VIEW_H, GAME_W, GAME_H, DEPTH, LEVEL_COLS } from '../constants.js';
import { parseLevel } from '../levels/levelParser.js';
import { LEVELS, TEST_LEVEL } from '../levels/index.js';
import { Player, PSTATE } from '../objects/Player.js';
import { Tail } from '../objects/Tail.js';
import { TrapManager } from '../objects/traps/TrapManager.js';
import { Clamp } from '../objects/traps/Clamp.js';
import { Saw } from '../objects/traps/Saw.js';
import { BarbStrip } from '../objects/traps/BarbStrip.js';
import { HeatLamp } from '../objects/traps/HeatLamp.js';
import { Press } from '../objects/traps/Press.js';
import { Collector } from '../objects/traps/Collector.js';
import { P } from '../gfx/palette.js';
import { makeGradient } from '../gfx/textures.js';
import { sfx } from '../audio/sfx.js';

// per-level background gradient palettes (bottom -> top of the LEVEL;
// the gradient texture is screen-sized and cross-faded by scroll progress)
const BG_STOPS = {
  pens: [[0, '#101a12'], [0.6, '#0d1410'], [1, '#0b0e14']],
  harvest: [[0, '#1a120c'], [0.6, '#140f0c'], [1, '#0b0e14']],
  chimney: [[0, '#0a0c16'], [0.5, '#141024'], [0.85, '#3a2033'], [1, '#7a4a50']],
};

export class GameScene extends Phaser.Scene {
  constructor() { super('Game'); }

  init(data) {
    this.levelIndex = data.level ?? 0;
    this.state = 'playing';
  }

  create() {
    const levelDef = this.levelIndex === 'test' ? TEST_LEVEL : LEVELS[this.levelIndex];
    if (!levelDef) throw new Error(`No level at index ${this.levelIndex}`);
    this.levelDef = levelDef;

    const parsed = parseLevel(this, levelDef);
    this.levelLayer = parsed.layer;
    this.exitRect = parsed.exit;
    this.worldHeight = parsed.worldHeight;

    this.physics.world.setBounds(0, 0, parsed.worldWidth, parsed.worldHeight);
    this.physics.world.gravity.y = T.GRAVITY_Y;
    this.physics.world.timeScale = 1;

    // --- background layers (fixed to camera, manual parallax) ---
    const key = `bg-${levelDef.paletteKey ?? 'pens'}`;
    if (!this.textures.exists(key)) {
      makeGradient(this, key, VIEW_W, VIEW_H, BG_STOPS[levelDef.paletteKey ?? 'pens']);
    }
    // scrollFactor-0 objects at zoom 2 are drawn in a centered sub-rect of the
    // canvas: the visible region spans (GAME/2 - VIEW/2) .. (GAME/2 + VIEW/2).
    const bx = GAME_W / 2 - VIEW_W / 2, by = GAME_H / 2 - VIEW_H / 2;
    this.bgFar = this.add.image(bx, by, key).setOrigin(0, 0).setScrollFactor(0).setDepth(DEPTH.BG_FAR);
    this.bgNoise = this.add.tileSprite(bx, by, VIEW_W, VIEW_H, 'bg-noise')
      .setOrigin(0, 0).setScrollFactor(0).setDepth(DEPTH.BG_MID).setAlpha(0.35);
    this.bgMid = this.add.tileSprite(bx, by, VIEW_W, VIEW_H, 'bg-mid')
      .setOrigin(0, 0).setScrollFactor(0).setDepth(DEPTH.BG_MID).setAlpha(0.8);

    // --- player + tail ---
    this.player = new Player(this, parsed.spawn.x, parsed.spawn.y, this.levelLayer);
    this.tail = new Tail(this, this.player);
    this.physics.add.collider(this.player, this.levelLayer);

    // --- traps + props ---
    this.trapManager = new TrapManager(this);
    for (const s of parsed.spawns) {
      switch (s.type) {
        case 'clamp': this.trapManager.add(new Clamp(this, s.x, s.y, s.mount, s.cfg)); break;
        case 'saw': this.trapManager.add(new Saw(this, s.x, s.y, s.axis, s.bounds, s.cfg)); break;
        case 'barb': this.trapManager.add(new BarbStrip(this, s.x, s.y, s.mount)); break;
        case 'lamp': this.trapManager.add(new HeatLamp(this, s.x, s.y, s.beamBottom, s.cfg)); break;
        case 'press': this.trapManager.add(new Press(this, s.x, s.y, s.lowY, s.cfg)); break;
        case 'sign': this.add.image(s.x, s.y, 'sign').setDepth(DEPTH.BG_PROPS); break;
        case 'cagedLizard': this.add.image(s.x, s.y, 'caged-lizard').setDepth(DEPTH.BG_PROPS).setAlpha(0.8); break;
        case 'pipe': this.add.image(s.x, s.y, 'pipe').setDepth(DEPTH.BG_PROPS).setAlpha(0.7); break;
        case 'jar': this.add.image(s.x, s.y, 'jar').setDepth(DEPTH.BG_PROPS).setAlpha(0.8); break;
      }
    }
    if (levelDef.pressure) {
      this.collector = this.trapManager.add(new Collector(this, parsed.worldHeight, levelDef.pressure));
    }

    // exit hatch sprite + glow anim
    const ex = this.exitRect.centerX, ey = this.exitRect.centerY;
    this.add.sprite(ex, ey, 'hatch').setDepth(DEPTH.TRAPS).play('hatch-glow');

    // --- camera ---
    const cam = this.cameras.main;
    cam.setZoom(2);
    cam.setBounds(0, 0, parsed.worldWidth, parsed.worldHeight);
    cam.startFollow(this.player, true, 0.12, 0.15);
    cam.setDeadzone(60, 40);
    cam.setFollowOffset(0, 20); // player sits ~60% down screen: more world above
    cam.setBackgroundColor(P.INK);
    this.peekTween = null;

    // dust particles for jump/land/wall-grab
    this.dust = this.add.particles(0, 0, 'px', {
      speed: { min: 10, max: 40 }, angle: { min: 200, max: 340 },
      lifespan: 250, scale: { start: 1.5, end: 0 },
      tint: 0x9aa5ad, emitting: false, quantity: 5,
    }).setDepth(DEPTH.FX);
    this.events.on('player-land', (p) => this.dust.emitParticleAt(p.x, p.body.bottom));
    this.events.on('player-jump', (p) => this.dust.emitParticleAt(p.x, p.body.bottom));
    this.events.on('player-walljump', (p, side) => {
      this.dust.emitParticleAt(side === 'left' ? p.body.left : p.body.right, p.y);
    });
    this.events.on('player-cling', (p) => {
      this.dust.emitParticleAt(p.clingSide === 'left' ? p.body.left : p.body.right, p.y);
    });
    // nearby clamp snaps rattle the camera a little
    this.events.on('trap-snap', (x, y) => {
      if (Phaser.Math.Distance.Between(x, y, this.player.x, this.player.y) < 150) {
        cam.shake(80, 0.004);
      }
    });

    // red flash overlay for tail loss (covers the whole visible region)
    this.flash = this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0xe23b2e, 0)
      .setScrollFactor(0).setDepth(DEPTH.FX + 1);

    // instant manual restart
    this.input.keyboard.on('keydown-R', () => {
      if (this.state === 'playing') this.doRestart();
    });
    // pause (UIScene keeps running and shows the card + handles resume)
    this.input.keyboard.on('keydown-ESC', () => {
      if (this.state === 'playing') {
        this.scene.pause();
        this.game.events.emit('game-paused');
      }
    });

    // UI overlay scene. scene.launch only QUEUES the start, so UIScene.create
    // (which subscribes to these events) runs after this method returns —
    // stash the info in the registry too, and UIScene picks it up on create.
    const levelInfo = {
      index: this.levelIndex,
      name: levelDef.name,
      subtitle: levelDef.subtitle ?? '',
      worldHeight: parsed.worldHeight,
    };
    this.registry.set('levelInfo', levelInfo);
    if (!this.scene.isActive('UI')) this.scene.launch('UI');
    else this.game.events.emit('level-start', levelInfo);
    if (!this.registry.get('runStart')) this.registry.set('runStart', Date.now());

    sfx.startAmbient();
    this.events.once('shutdown', () => {
      this.events.off('player-land'); this.events.off('player-jump');
      this.events.off('player-walljump'); this.events.off('player-cling');
      this.events.off('trap-snap');
    });
  }

  kindness() {
    return this.registry.get('failCount') >= T.KINDNESS_FAILS ? T.KINDNESS_MULT : 1;
  }

  update(time, delta) {
    if (this.state === 'won') return;
    this.player.update(time, delta);
    this.tail.update(time, delta);
    // Traps freeze during hit-stop and follow the physics slow-mo scale.
    if (!this.physics.world.isPaused) {
      const scaledDelta = delta / this.physics.world.timeScale;
      this.trapManager.update(time, scaledDelta, this.kindness(), this.state === 'playing');
    }

    // parallax
    const cam = this.cameras.main;
    this.bgNoise.tilePositionY = cam.scrollY * 0.15;
    this.bgMid.tilePositionY = cam.scrollY * 0.45;

    // camera scout peek (hold Up). followOffset is SUBTRACTED from the target:
    // larger offset.y = camera centers higher above the player.
    const wantPeek = this.player.peekHeld >= T.PEEK_HOLD_MS;
    const target = wantPeek ? 20 + T.PEEK_OFFSET : 20;
    if (Math.abs(cam.followOffset.y - target) > 1) {
      cam.followOffset.y += (target - cam.followOffset.y) * Math.min(1, delta / 200);
    }

    // exit check
    if (this.state === 'playing') {
      const b = this.player.body;
      const bodyRect = new Phaser.Geom.Rectangle(b.x, b.y, b.width, b.height);
      if (Phaser.Geom.Intersects.RectangleToRectangle(bodyRect, this.exitRect)) {
        this.onWin();
      }
    }

    // HUD progress
    this.game.events.emit('hud-progress', {
      player: 1 - this.player.y / this.worldHeight,
      collector: this.collector ? 1 - this.collector.topY / this.worldHeight : null,
    });
  }

  // ------------------------------------------------------------------ fail
  onTailLoss(trap) {
    if (this.state !== 'playing') return;
    this.state = 'dying';
    this.registry.inc('failCount');
    this.registry.inc('totalFails');

    const awayX = this.player.x >= (trap?.sprite?.x ?? trap?.x ?? this.player.x) ? 1 : -1;
    this.player.onTailLost();
    sfx.play('tailLoss');

    // hit-stop
    this.physics.world.pause();
    this.cameras.main.shake(250, 0.012);
    this.flash.setAlpha(0.45);
    this.tweens.add({ targets: this.flash, alpha: 0, duration: 200, delay: 60 });

    this.time.delayedCall(T.HITSTOP_MS, () => {
      this.physics.world.resume();
      this.physics.world.timeScale = 1 / T.SLOWMO_SCALE; // >1 slows arcade physics
      this.tail.detach(awayX);
      this.game.events.emit('tail-lost');
    });
    this.time.delayedCall(T.SLOWMO_END_MS, () => {
      this.tweens.add({
        targets: this.physics.world, timeScale: 1, duration: 150,
      });
    });
    this.time.delayedCall(T.FADE_START_MS, () => {
      this.cameras.main.fadeOut(T.RESTART_MS - T.FADE_START_MS, 11, 14, 20);
    });
    this.time.delayedCall(T.RESTART_MS, () => this.doRestart());
  }

  doRestart() {
    this.state = 'restarting';
    this.scene.restart({ level: this.levelIndex });
  }

  // ------------------------------------------------------------------- win
  onWin() {
    this.state = 'won';
    this.player.body.setVelocity(0, 0);
    this.player.body.setAcceleration(0, 0);
    this.player.body.setAllowGravity(false);
    this.registry.set('failCount', 0);
    sfx.play(this.isLastLevel() ? 'victory' : 'door');

    if (this.levelIndex !== 'test') {
      const unlocked = Math.max(this.registry.get('unlocked'), this.levelIndex + 1);
      this.registry.set('unlocked', unlocked);
      try { localStorage.setItem('shedskin.unlocked', String(unlocked)); } catch { /* private mode */ }
    }

    this.game.events.emit('level-complete', {
      index: this.levelIndex,
      isLast: this.isLastLevel(),
      totalFails: this.registry.get('totalFails'),
      elapsedMs: Date.now() - (this.registry.get('runStart') || Date.now()),
    });
  }

  isLastLevel() {
    return this.levelIndex === 'test' || this.levelIndex >= LEVELS.length - 1;
  }

  // called by UIScene when the player confirms the win card
  advance() {
    if (this.isLastLevel()) {
      sfx.stopAmbient();
      this.registry.set('runStart', 0);
      this.registry.set('totalFails', 0);
      this.scene.stop('UI');
      this.scene.start('Title');
    } else {
      this.scene.restart({ level: this.levelIndex + 1 });
    }
  }
}

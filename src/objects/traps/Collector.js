// The Collector: Level 3's rising harvester gantry. Config-driven (not a map
// char). Rises once triggered, with scripted jam-stalls at fixed heights and a
// gentle rubber-band when the player is far ahead. Touching its claws — or
// falling below its deck — is the standard tail-loss fail.
import Phaser from 'phaser';
import { Trap } from './Trap.js';
import { DEPTH, TILE, LEVEL_COLS } from '../../constants.js';
import { P } from '../../gfx/palette.js';
import { sfx } from '../../audio/sfx.js';

export class Collector extends Trap {
  // cfg: { spawnTilesBelow, triggerTilesFromBottom, speedTps, stalls: [{tilesFromBottom, dur}], stopTilesFromBottom }
  constructor(scene, worldHeight, cfg) {
    super(scene, 0, 0);
    this.worldHeight = worldHeight;
    const width = LEVEL_COLS * TILE;
    this.topY = worldHeight + (cfg.spawnTilesBelow ?? 8) * TILE;
    this.triggerY = worldHeight - (cfg.triggerTilesFromBottom ?? 13) * TILE;
    this.baseSpeed = (cfg.speedTps ?? 2.6) * TILE;
    this.stopY = worldHeight - (cfg.stopTilesFromBottom ?? 0) * TILE;
    this.stalls = (cfg.stalls ?? [])
      .map((s) => ({ y: worldHeight - s.tilesFromBottom * TILE, dur: s.dur * 1000, done: false }))
      .sort((a, b) => b.y - a.y);
    this.stallLeft = 0;
    this.triggered = false;

    this.deck = scene.add.tileSprite(width / 2, this.topY, width, 24, 'collector')
      .setOrigin(0.5, 0).setDepth(DEPTH.TRAPS);
    this.fill = scene.add.rectangle(width / 2, this.topY + 24, width, 4, Phaser.Display.Color.HexStringToColor(P.INK).color, 0.95)
      .setOrigin(0.5, 0).setDepth(DEPTH.TRAPS);
    this.glow = scene.add.rectangle(width / 2, this.topY, width, 3, Phaser.Display.Color.HexStringToColor(P.RED).color, 0.5)
      .setOrigin(0.5, 1).setDepth(DEPTH.TRAPS);
    this.animT = 0;

    this.hurt = new Phaser.Geom.Rectangle(0, this.topY - 4, width, 14);
  }

  trigger() {
    if (this.triggered) return;
    this.triggered = true;
    sfx.play('klaxon');
    this.scene.game.events.emit('collector-triggered');
  }

  update(time, delta) {
    // cheap 2-frame churn (TileSprites can't play anims; swap the frame)
    this.animT += delta;
    const f = Math.floor(this.animT / 250) % 2;
    if (this.deck.frame.name !== f) this.deck.setFrame(f);

    const player = this.scene.player;
    if (!this.triggered && player && player.y < this.triggerY) this.trigger();

    if (this.triggered && this.topY > this.stopY) {
      if (this.stallLeft > 0) {
        this.stallLeft -= delta;
      } else {
        let speed = this.baseSpeed;
        // rubber-band: far-ahead players keep the dread but not the loss
        if (player && this.topY - player.y > 12 * TILE) speed *= 0.72;
        this.topY -= speed * (delta / 1000);
        const stall = this.stalls.find((s) => !s.done && this.topY <= s.y);
        if (stall) {
          stall.done = true;
          this.stallLeft = stall.dur;
          sfx.play('rattle');
        }
        if (this.topY < this.stopY) this.topY = this.stopY;
      }
    }

    this.deck.y = this.topY;
    this.glow.y = this.topY;
    this.fill.y = this.topY + 24;
    this.fill.setSize(this.fill.width, Math.max(4, this.worldHeight + 8 * TILE - this.topY));
    this.hurt.y = this.topY - 4;
  }

  getHurtShapes() {
    if (!this.triggered) return [];
    const shapes = [{ rect: this.hurt }];
    // falling below the deck is also lethal
    const player = this.scene.player;
    if (player && player.y > this.topY + 12) {
      shapes.push({ rect: new Phaser.Geom.Rectangle(0, this.topY + 12, LEVEL_COLS * TILE, 4000) });
    }
    return shapes;
  }

  destroy() { this.deck.destroy(); this.fill.destroy(); this.glow.destroy(); }
}

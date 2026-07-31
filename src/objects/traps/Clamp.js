// Tail-Clamp "The Snip": wall-mounted snapper. idle -> wind (telegraph) ->
// snap (hurt) -> reset (visibly safe) -> idle.
import Phaser from 'phaser';
import { Trap } from './Trap.js';
import { DEPTH } from '../../constants.js';
import { sfx } from '../../audio/sfx.js';

export class Clamp extends Trap {
  constructor(scene, x, y, mount, cfg = {}) {
    super(scene, x, y);
    this.mount = mount;
    this.idleMs = cfg.idleMs ?? 1000;
    this.windMs = cfg.windMs ?? 650;
    this.snapMs = cfg.snapMs ?? 140;
    this.resetMs = cfg.resetMs ?? 1200;

    this.sprite = scene.add.sprite(x, y, 'clamp', 0).setDepth(DEPTH.TRAPS);
    if (mount === 'right') this.sprite.setFlipX(true);
    else if (mount === 'down') this.sprite.setAngle(-90);
    else if (mount === 'up') this.sprite.setAngle(90);

    this.frameIndex = scene.registry.get('sheets').clamp.frameIndex;
    this.state = 'idle';
    // phase (0..1) staggers the first cycle so paired clamps desync.
    this.timer = this.idleMs * (1 + (cfg.phase ?? 0));

    // Snap hurt zone = the clamp's own cell, undersized (16x14 across the
    // snap axis) — the jaws reach one tile off the wall face.
    this.hurt = mount === 'up' || mount === 'down'
      ? new Phaser.Geom.Rectangle(x - 7, y - 8, 14, 16)
      : new Phaser.Geom.Rectangle(x - 8, y - 7, 16, 14);
  }

  update(time, delta, kindness) {
    this.timer -= delta;
    if (this.timer > 0) return;
    switch (this.state) {
      case 'idle':
        this.state = 'wind';
        this.timer = this.windMs * kindness;
        this.sprite.play('clamp-wind');
        sfx.play('rattle');
        break;
      case 'wind':
        this.state = 'snap';
        this.timer = this.snapMs;
        this.sprite.stop();
        this.sprite.setFrame(this.frameIndex.snap[0]);
        sfx.play('snap');
        this.scene.events.emit('trap-snap', this.x, this.y);
        break;
      case 'snap':
        this.state = 'reset';
        this.timer = this.resetMs;
        this.sprite.setFrame(this.frameIndex.reset[0]);
        break;
      case 'reset':
        this.state = 'idle';
        this.timer = this.idleMs;
        this.sprite.setFrame(this.frameIndex.idle[0]);
        break;
    }
  }

  getHurtShapes() {
    return this.state === 'snap' ? [{ rect: this.hurt }] : [];
  }

  destroy() { this.sprite.destroy(); }
}

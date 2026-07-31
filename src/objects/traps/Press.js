// The Press: 3-wide harvester head on a slow vertical stroke. Harmful only
// while slamming and during the bottom hold — crossing is safe on the rise.
import Phaser from 'phaser';
import { Trap } from './Trap.js';
import { DEPTH } from '../../constants.js';
import { sfx } from '../../audio/sfx.js';

export class Press extends Trap {
  constructor(scene, x, y, lowY, cfg = {}) {
    super(scene, x, y);
    this.topY = y;
    this.lowY = lowY - 8; // sprite center when the head bottom sits at lowY
    this.holdTopMs = cfg.holdTopMs ?? 1400;
    this.holdBottomMs = cfg.holdBottomMs ?? 900;
    this.slamSpeed = cfg.slamSpeed ?? 300;
    this.riseSpeed = cfg.riseSpeed ?? 60;

    this.sprite = scene.add.sprite(x, y, 'press', 0).setDepth(DEPTH.TRAPS);
    this.sprite.play('press-grind');
    this.state = 'holdTop';
    this.timer = this.holdTopMs * (1 + (cfg.phase ?? 0));
    this.hurt = new Phaser.Geom.Rectangle(x - 22, y - 7, 44, 14);
  }

  update(time, delta) {
    switch (this.state) {
      case 'holdTop':
        this.timer -= delta;
        if (this.timer <= 0) { this.state = 'slam'; sfx.play('rattle'); }
        break;
      case 'slam':
        this.sprite.y += this.slamSpeed * (delta / 1000);
        if (this.sprite.y >= this.lowY) {
          this.sprite.y = this.lowY;
          this.state = 'holdBottom';
          this.timer = this.holdBottomMs;
          sfx.play('snap');
          this.scene.events.emit('trap-snap', this.sprite.x, this.sprite.y);
        }
        break;
      case 'holdBottom':
        this.timer -= delta;
        if (this.timer <= 0) this.state = 'rise';
        break;
      case 'rise':
        this.sprite.y -= this.riseSpeed * (delta / 1000);
        if (this.sprite.y <= this.topY) {
          this.sprite.y = this.topY;
          this.state = 'holdTop';
          this.timer = this.holdTopMs;
        }
        break;
    }
    this.hurt.setPosition(this.sprite.x - 22, this.sprite.y - 7);
  }

  getHurtShapes() {
    return this.state === 'slam' || this.state === 'holdBottom' ? [{ rect: this.hurt }] : [];
  }

  destroy() { this.sprite.destroy(); }
}

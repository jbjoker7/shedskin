// Harvester Shear "The Trimmer": circular saw ping-ponging along a visible
// rail. The 300ms end-pause is the dodge window; the blade is always harmful.
import Phaser from 'phaser';
import { Trap } from './Trap.js';
import { DEPTH } from '../../constants.js';
import { P } from '../../gfx/palette.js';

export class Saw extends Trap {
  constructor(scene, x, y, axis, bounds, cfg = {}) {
    super(scene, x, y);
    this.axis = axis; // 'h' | 'v'
    this.min = bounds.min;
    this.max = bounds.max;
    this.speed = cfg.speed ?? 70;
    this.pauseMs = cfg.pauseMs ?? 300;

    // rail decal
    const g = scene.add.graphics().setDepth(DEPTH.TRAPS - 1);
    g.lineStyle(1, Phaser.Display.Color.HexStringToColor(P.SHADOW).color, 1);
    const dash = 4;
    if (axis === 'h') {
      for (let px = this.min; px < this.max; px += dash * 2) g.lineBetween(px, y, Math.min(px + dash, this.max), y);
    } else {
      for (let py = this.min; py < this.max; py += dash * 2) g.lineBetween(x, py, x, Math.min(py + dash, this.max));
    }
    this.rail = g;

    this.sprite = scene.add.sprite(x, y, 'saw', 0).setDepth(DEPTH.TRAPS);
    this.sprite.play('saw-spin');
    this.dir = 1;
    this.pauseLeft = 0;
    this.circle = new Phaser.Geom.Circle(x, y, 12);
  }

  update(time, delta) {
    if (this.pauseLeft > 0) {
      this.pauseLeft -= delta;
    } else {
      const pos = this.axis === 'h' ? this.sprite.x : this.sprite.y;
      let next = pos + this.dir * this.speed * (delta / 1000);
      if (next >= this.max) { next = this.max; this.dir = -1; this.pauseLeft = this.pauseMs; }
      else if (next <= this.min) { next = this.min; this.dir = 1; this.pauseLeft = this.pauseMs; }
      if (this.axis === 'h') this.sprite.x = next;
      else this.sprite.y = next;
    }
    this.circle.setPosition(this.sprite.x, this.sprite.y);
  }

  getHurtShapes() { return [{ circle: this.circle }]; }

  destroy() { this.sprite.destroy(); this.rail.destroy(); }
}

// Heat Lamp "The Basking Rig": cycling beam. off -> warm (flicker telegraph)
// -> ON (contact = loss) -> off. Phase-offset groups create moving safe lanes.
import Phaser from 'phaser';
import { Trap } from './Trap.js';
import { DEPTH, TILE } from '../../constants.js';
import { P } from '../../gfx/palette.js';
import { sfx } from '../../audio/sfx.js';

export class HeatLamp extends Trap {
  constructor(scene, x, y, beamBottom, cfg = {}) {
    super(scene, x, y);
    this.offMs = cfg.offMs ?? 3000;
    this.warmMs = cfg.warmMs ?? 1200;
    this.onMs = cfg.onMs ?? 2000;

    this.sprite = scene.add.sprite(x, y, 'lamp', 0).setDepth(DEPTH.TRAPS);
    this.frameIndex = scene.registry.get('sheets').lamp.frameIndex;

    const beamTop = y + 4; // just below the fixture
    const w = TILE * 3;
    this.beamRect = new Phaser.Geom.Rectangle(x - w / 2, beamTop, w, beamBottom - beamTop);
    this.hurt = new Phaser.Geom.Rectangle(x - w / 2 + 3, beamTop, w - 6, beamBottom - beamTop);

    const color = Phaser.Display.Color.HexStringToColor(P.ORANGE).color;
    this.beam = scene.add.rectangle(x, beamTop, w, beamBottom - beamTop, color, 0)
      .setOrigin(0.5, 0).setDepth(DEPTH.BEAM);

    this.state = 'off';
    this.timer = this.offMs * (1 + (cfg.phase ?? 0));
  }

  update(time, delta, kindness) {
    this.timer -= delta;
    if (this.state === 'warm') {
      // flicker while warming
      this.beam.setFillStyle(this.beam.fillColor, 0.06 + 0.06 * Math.abs(Math.sin(time / 60)));
    }
    if (this.timer > 0) return;
    switch (this.state) {
      case 'off':
        this.state = 'warm';
        this.timer = this.warmMs * kindness;
        this.sprite.play('lamp-warm');
        sfx.play('hum');
        break;
      case 'warm':
        this.state = 'on';
        this.timer = this.onMs;
        this.sprite.stop();
        this.sprite.setFrame(this.frameIndex.on[0]);
        this.beam.setFillStyle(this.beam.fillColor, 0.28);
        break;
      case 'on':
        this.state = 'off';
        this.timer = this.offMs;
        this.sprite.setFrame(this.frameIndex.off[0]);
        this.beam.setFillStyle(this.beam.fillColor, 0);
        break;
    }
  }

  getHurtShapes() {
    return this.state === 'on' ? [{ rect: this.hurt }] : [];
  }

  destroy() { this.sprite.destroy(); this.beam.destroy(); }
}

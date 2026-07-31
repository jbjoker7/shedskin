// Barb strip "Molting Wire": static surface denial. Always harmful (hurt box
// inset 3px from the visual); the parser also flags the mounted wall face
// noCling so the player can never cling into it.
import Phaser from 'phaser';
import { Trap } from './Trap.js';
import { DEPTH } from '../../constants.js';

export class BarbStrip extends Trap {
  constructor(scene, x, y, mount) {
    super(scene, x, y);
    this.sprite = scene.add.image(x, y, 'barbs').setDepth(DEPTH.TRAPS);
    // art hugs the bottom edge of its cell; rotate so the bottom faces the mount
    if (mount === 'up') this.sprite.setAngle(180);
    else if (mount === 'left') this.sprite.setAngle(90);
    else if (mount === 'right') this.sprite.setAngle(-90);
    // subtle sway so it never reads as background
    scene.tweens.add({ targets: this.sprite, angle: this.sprite.angle + 2, duration: 700, yoyo: true, repeat: -1 });

    const t = 6; // wire thickness
    if (mount === 'down') this.hurt = new Phaser.Geom.Rectangle(x - 5, y + 8 - t, 10, t);
    else if (mount === 'up') this.hurt = new Phaser.Geom.Rectangle(x - 5, y - 8, 10, t);
    else if (mount === 'left') this.hurt = new Phaser.Geom.Rectangle(x - 8, y - 5, t, 10);
    else this.hurt = new Phaser.Geom.Rectangle(x + 8 - t, y - 5, t, 10);
  }

  getHurtShapes() { return [{ rect: this.hurt }]; }

  destroy() { this.sprite.destroy(); }
}

// The tail: a 3-segment follower chain sampling a ring buffer of the player's
// past tail-anchor positions. No physics while attached — just images with a
// trailing hurtbox. On loss it detaches into a single tumbling physics sprite
// that twitches (caudal autotomy — the game's signature beat).
import Phaser from 'phaser';
import { DEPTH } from '../constants.js';

const HISTORY = 24;
const DELAYS = [4, 9, 14]; // ring-buffer sample delay per segment

export class Tail {
  constructor(scene, player) {
    this.scene = scene;
    this.player = player;
    this.history = [];
    const a = player.tailAnchor();
    for (let i = 0; i < HISTORY; i++) this.history.push({ x: a.x, y: a.y });

    this.segments = [
      scene.add.image(a.x, a.y, 'tail-base').setDepth(DEPTH.TAIL),
      scene.add.image(a.x, a.y, 'tail-mid').setDepth(DEPTH.TAIL),
      scene.add.image(a.x, a.y, 'tail-tip').setDepth(DEPTH.TAIL),
    ];
    this.attached = true;
    this.swayT = 0;
    this.hurtRect = new Phaser.Geom.Rectangle(a.x - 5, a.y - 5, 10, 10);
  }

  update(time, delta) {
    if (!this.attached) return;
    this.swayT += delta / 1000;
    const a = this.player.tailAnchor();
    this.history.pop();
    this.history.unshift({ x: a.x, y: a.y });

    let prev = a;
    this.segments.forEach((seg, i) => {
      const p = this.history[Math.min(DELAYS[i], HISTORY - 1)];
      // idle sway: small sine offset perpendicular to the chain
      const sway = Math.sin(this.swayT * Math.PI * 4 + i) * 1.5;
      const angle = Phaser.Math.Angle.Between(p.x, p.y, prev.x, prev.y);
      seg.setPosition(p.x + Math.cos(angle + Math.PI / 2) * sway, p.y + Math.sin(angle + Math.PI / 2) * sway);
      seg.setRotation(angle);
      prev = p;
    });

    const mid = this.segments[1];
    this.hurtRect.setPosition(mid.x - 5, mid.y - 5);
  }

  // Detach: destroy followers, spawn a tumbling twitching physics sprite.
  // awayX = horizontal direction away from the trap (+1 / -1).
  detach(awayX = 1) {
    if (!this.attached) return null;
    this.attached = false;
    const base = this.segments[0];
    const drop = this.scene.physics.add.sprite(base.x, base.y, 'tail-drop').setDepth(DEPTH.FX);
    this.segments.forEach((s) => s.destroy());
    this.segments = [];

    drop.body.setVelocity(80 * awayX, -120);
    drop.body.setBounce(0.3);
    drop.body.setAngularVelocity(560 * awayX);
    this.scene.physics.add.collider(drop, this.scene.levelLayer);
    // the twitch: real dropped lizard tails spasm
    this.scene.tweens.add({
      targets: drop, scaleY: { from: 0.7, to: 1.3 },
      duration: 90, yoyo: true, repeat: 6,
    });
    return drop;
  }

  destroy() {
    this.segments.forEach((s) => s.destroy());
    this.segments = [];
  }
}

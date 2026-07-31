// The tail: a 3-segment follower chain. Each segment is held at a fixed
// distance from the one before it and eased toward that position, so the tail
// whips when you move and hangs naturally when you stop. (Sampling a position
// history instead makes the segments pile into a blob at low speeds.)
// On loss it detaches into a tumbling, twitching physics sprite — caudal
// autotomy, the game's signature beat.
import Phaser from 'phaser';
import { DEPTH } from '../constants.js';

const LENGTHS = [5, 4.5, 4]; // spacing from the previous joint, in px
const SWAY_AMP = 0.22;       // radians
const SWAY_HZ = 1.6;

export class Tail {
  constructor(scene, player) {
    this.scene = scene;
    this.player = player;
    this.attached = true;
    this.swayT = 0;

    const a = player.tailAnchor();
    const d = player.tailRestDir();
    this.segments = ['tail-base', 'tail-mid', 'tail-tip'].map((key, i) => {
      const dist = LENGTHS.slice(0, i + 1).reduce((s, n) => s + n, 0);
      return scene.add.image(a.x + d.x * dist, a.y + d.y * dist, key).setDepth(DEPTH.TAIL);
    });
    this.hurtRect = new Phaser.Geom.Rectangle(a.x - 5, a.y - 5, 10, 10);
  }

  update(time, delta) {
    if (!this.attached) return;
    this.swayT += delta / 1000;

    const anchor = this.player.tailAnchor();
    const rest = this.player.tailRestDir();
    // idle sway rotates the rest direction rather than nudging positions, so
    // it never fights the length constraint
    const sway = Math.sin(this.swayT * Math.PI * 2 * SWAY_HZ) * SWAY_AMP;
    const cos = Math.cos(sway), sin = Math.sin(sway);
    const restX = rest.x * cos - rest.y * sin;
    const restY = rest.x * sin + rest.y * cos;

    const ease = Math.min(1, delta / 45);
    let prev = anchor;
    this.segments.forEach((seg, i) => {
      const len = LENGTHS[i];
      let dx = seg.x - prev.x, dy = seg.y - prev.y;
      let dist = Math.hypot(dx, dy);
      if (dist < 0.01) { dx = restX; dy = restY; dist = 1; }
      // hold the segment `len` away from its parent...
      const tx = prev.x + (dx / dist) * len;
      const ty = prev.y + (dy / dist) * len;
      // ...while drifting toward the rest pose so a still tail settles
      const gx = tx + (prev.x + restX * len - tx) * 0.1;
      const gy = ty + (prev.y + restY * len - ty) * 0.1;
      seg.x += (gx - seg.x) * ease;
      seg.y += (gy - seg.y) * ease;
      seg.setRotation(Math.atan2(seg.y - prev.y, seg.x - prev.x));
      prev = { x: seg.x, y: seg.y };
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
